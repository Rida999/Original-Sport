CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  status product_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE products DROP COLUMN IF EXISTS out_of_stock_since;

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

ALTER TABLE import_items ADD COLUMN IF NOT EXISTS previous_quantity INTEGER;
ALTER TABLE import_items ADD COLUMN IF NOT EXISTS previous_status product_status;

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
