CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE CHECK (username = lower(username)),
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'superadmin')),
  must_change_password BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  session_version INTEGER NOT NULL DEFAULT 1,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_users_active_username_idx
  ON app_users (username)
  WHERE active;

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE app_users FROM anon, authenticated;

DO $$ BEGIN
  CREATE TYPE product_gender AS ENUM ('men', 'women', 'unisex', 'kids');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('available', 'out_of_stock', 'discontinued');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_number TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  model_name TEXT,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  key_category TEXT,
  age_group TEXT,
  gender product_gender,
  sport TEXT,
  marketing_line TEXT,
  product_division TEXT,
  product_line TEXT,
  product_type TEXT,
  sub_brand TEXT,
  color TEXT,
  size TEXT,
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  quantity INTEGER NOT NULL DEFAULT 0,
  min_stock INTEGER NOT NULL DEFAULT 5,
  description TEXT,
  images TEXT[] NOT NULL DEFAULT '{}',
  source_thumbnail TEXT,
  quick_sale BOOLEAN NOT NULL DEFAULT false,
  status product_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products DROP COLUMN IF EXISTS out_of_stock_since;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quick_sale BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS item_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS total_quantity INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL REFERENCES import_batches(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  article_number TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_added INTEGER NOT NULL DEFAULT 0,
  previous_quantity INTEGER,
  previous_status product_status,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE import_items ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS article_number TEXT NOT NULL DEFAULT '';
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS product_name TEXT NOT NULL DEFAULT '';
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS quantity_added INTEGER NOT NULL DEFAULT 0;
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS previous_quantity INTEGER;
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS previous_status product_status;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'import_items'
      AND column_name = 'barcode'
  ) THEN
    ALTER TABLE import_items ALTER COLUMN barcode DROP NOT NULL;
    ALTER TABLE import_items ALTER COLUMN barcode SET DEFAULT '';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS import_items_batch_id_idx ON import_items(import_batch_id);

CREATE SEQUENCE IF NOT EXISTS receipt_invoice_number_seq START 1;

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number INTEGER NOT NULL DEFAULT nextval('receipt_invoice_number_seq') UNIQUE,
  customer_name TEXT,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 11,
  vat_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_paid NUMERIC(12, 2) NOT NULL DEFAULT 0,
  cash_exchange NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  total NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipt_items_receipt_id_idx ON receipt_items(receipt_id);

-- Single shared row holding the receipt currently being built at the
-- register, so a phone doing the scanning and a monitor watching the same
-- page stay in sync (polled, not pushed).
CREATE TABLE IF NOT EXISTS receipt_draft (
  id TEXT PRIMARY KEY DEFAULT 'default',
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO receipt_draft (id) VALUES ('default') ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS categories_set_updated_at ON categories;
CREATE TRIGGER categories_set_updated_at BEFORE UPDATE ON categories
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS products_set_updated_at ON products;
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS app_users_set_updated_at ON app_users;
CREATE TRIGGER app_users_set_updated_at BEFORE UPDATE ON app_users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- This application accesses Postgres only through authenticated server
-- functions. Keep every application table unavailable to Supabase's public
-- Data API roles; the server's database role continues to work normally.
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated;
  END IF;
END $$;
