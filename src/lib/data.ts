import { createServerFn } from "@tanstack/react-start";

import { slugify } from "@/lib/format";

export type CrudTable = "categories" | "brands";
export type CrudRow = { id: string; name: string; slug: string; description: string | null };
export type Supplier = {
  id: string;
  company_name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
};
export type ProductGender = "men" | "women" | "unisex" | "kids";
export type ProductStatus = "available" | "out_of_stock" | "discontinued";
export type ProductInput = {
  id?: string;
  barcode: string;
  article_number?: string | null;
  name: string;
  model_name?: string | null;
  brand_id?: string | null;
  category_id?: string | null;
  key_category?: string | null;
  age_group?: string | null;
  gender?: ProductGender | null;
  sport?: string | null;
  marketing_line?: string | null;
  product_division?: string | null;
  product_line?: string | null;
  product_type?: string | null;
  sub_brand?: string | null;
  color?: string | null;
  size?: string | null;
  purchase_price: number;
  selling_price: number;
  quantity: number;
  min_stock: number;
  description?: string | null;
  images?: string[];
  source_thumbnail?: string | null;
  status?: ProductStatus;
};
export type Product = ProductInput & {
  id: string;
  created_at: string;
  updated_at: string;
  brand?: { name: string } | null;
  category?: { name: string } | null;
};
export type SupplierInput = Omit<Supplier, "id">;

const clean = <T extends Record<string, unknown>>(value: T) =>
  Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === "string" && item.trim() === "" ? null : item,
    ]),
  ) as T;

export const listCrud = createServerFn({ method: "GET" })
  .validator((data: { table: CrudTable }) => data)
  .handler(async ({ data }) => {
    const { query } = await import("./db.server");
    return query<CrudRow>(`select id, name, slug, description from ${data.table} order by name`);
  });

export const saveCrud = createServerFn({ method: "POST" })
  .validator(
    (data: { table: CrudTable; id?: string; name: string; description?: string | null }) => data,
  )
  .handler(async ({ data }) => {
    const { one } = await import("./db.server");
    const payload = {
      name: data.name.trim(),
      slug: slugify(data.name),
      description: data.description?.trim() || null,
    };
    if (data.id) {
      await one(
        `update ${data.table} set name = $1, slug = $2, description = $3 where id = $4 returning id`,
        [payload.name, payload.slug, payload.description, data.id],
      );
      return;
    }
    await one(
      `insert into ${data.table} (name, slug, description) values ($1, $2, $3) returning id`,
      [payload.name, payload.slug, payload.description],
    );
  });

export const deleteCrud = createServerFn({ method: "POST" })
  .validator((data: { table: CrudTable; id: string }) => data)
  .handler(async ({ data }) => {
    const { query } = await import("./db.server");
    await query(`delete from ${data.table} where id = $1`, [data.id]);
  });

export const listSuppliers = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<Supplier>("select * from suppliers order by company_name");
});

export const saveSupplier = createServerFn({ method: "POST" })
  .validator((data: { id?: string; values: SupplierInput }) => data)
  .handler(async ({ data }) => {
    const { one } = await import("./db.server");
    const values = clean(data.values);
    if (data.id) {
      await one(
        `update suppliers
         set company_name = $1, contact_person = $2, phone = $3, email = $4, address = $5, notes = $6
         where id = $7 returning id`,
        [
          values.company_name,
          values.contact_person,
          values.phone,
          values.email,
          values.address,
          values.notes,
          data.id,
        ],
      );
      return;
    }
    await one(
      `insert into suppliers (company_name, contact_person, phone, email, address, notes)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [
        values.company_name,
        values.contact_person,
        values.phone,
        values.email,
        values.address,
        values.notes,
      ],
    );
  });

export const deleteSupplier = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { query } = await import("./db.server");
    await query("delete from suppliers where id = $1", [data.id]);
  });

export const listBrandOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<{ id: string; name: string }>("select id, name from brands order by name");
});

export const listCategoryOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<{ id: string; name: string }>("select id, name from categories order by name");
});

const productColumns = `
  p.id, p.barcode, p.article_number, p.name, p.model_name, p.brand_id, p.category_id,
  p.key_category, p.age_group, p.gender, p.sport, p.marketing_line, p.product_division,
  p.product_line, p.product_type, p.sub_brand, p.color, p.size, p.purchase_price,
  p.selling_price, p.quantity, p.min_stock, p.description, p.images, p.source_thumbnail,
  p.status, p.created_at, p.updated_at,
  case when b.id is null then null else json_build_object('name', b.name) end as brand,
  case when c.id is null then null else json_build_object('name', c.name) end as category
`;

export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<Product>(
    `select ${productColumns}
     from products p
     left join brands b on b.id = p.brand_id
     left join categories c on c.id = p.category_id
     order by p.created_at desc`,
  );
});

export const getProduct = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { one } = await import("./db.server");
    return one<Product>(
      `select ${productColumns}
       from products p
       left join brands b on b.id = p.brand_id
       left join categories c on c.id = p.category_id
       where p.id = $1`,
      [data.id],
    );
  });

const productValues = (product: ProductInput) => [
  product.barcode,
  product.article_number || product.barcode,
  product.name,
  product.model_name || product.name,
  product.brand_id || null,
  product.category_id || null,
  product.key_category || null,
  product.age_group || null,
  product.gender || null,
  product.sport || null,
  product.marketing_line || null,
  product.product_division || null,
  product.product_line || null,
  product.product_type || null,
  product.sub_brand || null,
  product.color || null,
  product.size || null,
  Number(product.purchase_price || 0),
  Number(product.selling_price || 0),
  Number(product.quantity || 0),
  Number(product.min_stock || 0),
  product.description || null,
  product.images ?? [],
  product.source_thumbnail || null,
  product.status ?? (Number(product.quantity || 0) === 0 ? "out_of_stock" : "available"),
];

export const saveProduct = createServerFn({ method: "POST" })
  .validator((data: ProductInput) => data)
  .handler(async ({ data }) => {
    const { one } = await import("./db.server");
    const values = productValues(data);
    if (data.id) {
      await one(
        `update products set
          barcode = $1, article_number = $2, name = $3, model_name = $4, brand_id = $5, category_id = $6,
          key_category = $7, age_group = $8, gender = $9, sport = $10, marketing_line = $11,
          product_division = $12, product_line = $13, product_type = $14, sub_brand = $15,
          color = $16, size = $17, purchase_price = $18, selling_price = $19, quantity = $20,
          min_stock = $21, description = $22, images = $23, source_thumbnail = $24, status = $25
         where id = $26 returning id`,
        [...values, data.id],
      );
      return data.id;
    }
    const row = await one<{ id: string }>(
      `insert into products (
        barcode, article_number, name, model_name, brand_id, category_id, key_category, age_group,
        gender, sport, marketing_line, product_division, product_line, product_type, sub_brand,
        color, size, purchase_price, selling_price, quantity, min_stock, description, images,
        source_thumbnail, status
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25
      ) returning id`,
      values,
    );
    await one(
      "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4) returning id",
      ["created", "product", row?.id, { name: data.name }],
    );
    return row?.id;
  });

export const deleteProducts = createServerFn({ method: "POST" })
  .validator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => {
    const { query } = await import("./db.server");
    await query("delete from products where id = any($1::uuid[])", [data.ids]);
  });

export const importProducts = createServerFn({ method: "POST" })
  .validator((data: { products: ProductInput[]; brands: string[]; categories: string[] }) => data)
  .handler(async ({ data }) => {
    const { getPool } = await import("./db.server");
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      for (const name of data.brands) {
        await client.query(
          "insert into brands (name, slug) values ($1, $2) on conflict (slug) do update set name = excluded.name",
          [name, slugify(name)],
        );
      }
      for (const name of data.categories) {
        await client.query(
          "insert into categories (name, slug) values ($1, $2) on conflict (slug) do update set name = excluded.name",
          [name, slugify(name)],
        );
      }
      const brands = await client.query<{ id: string; slug: string }>(
        "select id, slug from brands",
      );
      const categories = await client.query<{ id: string; slug: string }>(
        "select id, slug from categories",
      );
      const brandId = new Map(brands.rows.map((row) => [row.slug, row.id]));
      const categoryId = new Map(categories.rows.map((row) => [row.slug, row.id]));
      for (const product of data.products) {
        const withIds = {
          ...product,
          brand_id: product.brand_id ? (brandId.get(product.brand_id) ?? null) : null,
          category_id: product.category_id ? (categoryId.get(product.category_id) ?? null) : null,
        };
        await client.query(
          `insert into products (
            barcode, article_number, name, model_name, brand_id, category_id, key_category, age_group,
            gender, sport, marketing_line, product_division, product_line, product_type, sub_brand,
            color, size, purchase_price, selling_price, quantity, min_stock, description, images,
            source_thumbnail, status
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
            $18, $19, $20, $21, $22, $23, $24, $25
          )
          on conflict (barcode) do update set
            article_number = excluded.article_number, name = excluded.name, model_name = excluded.model_name,
            brand_id = excluded.brand_id, category_id = excluded.category_id, key_category = excluded.key_category,
            age_group = excluded.age_group, gender = excluded.gender, sport = excluded.sport,
            marketing_line = excluded.marketing_line, product_division = excluded.product_division,
            product_line = excluded.product_line, product_type = excluded.product_type, sub_brand = excluded.sub_brand,
            purchase_price = excluded.purchase_price, selling_price = excluded.selling_price, quantity = excluded.quantity,
            min_stock = excluded.min_stock, images = excluded.images, source_thumbnail = excluded.source_thumbnail,
            status = excluded.status`,
          productValues(withIds),
        );
      }
      await client.query("commit");
      return { count: data.products.length };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

export const getDashboardStats = createServerFn({ method: "GET" }).handler(async () => {
  const { one, query } = await import("./db.server");
  const [products, categories, brands, lowStock, outOfStock, recent, activity] = await Promise.all([
    one<{ count: string }>("select count(*) from products"),
    one<{ count: string }>("select count(*) from categories"),
    one<{ count: string }>("select count(*) from brands"),
    query<Pick<Product, "id" | "name" | "quantity" | "min_stock">>(
      "select id, name, quantity, min_stock from products where quantity <= 5 and quantity > 0 limit 5",
    ),
    query<Pick<Product, "id" | "name" | "quantity">>(
      "select id, name, quantity from products where quantity = 0 limit 5",
    ),
    query<Pick<Product, "id" | "name" | "selling_price" | "created_at" | "images">>(
      "select id, name, selling_price, created_at, images from products order by created_at desc limit 5",
    ),
    query<{ id: string; action: string; entity_type: string; created_at: string }>(
      "select id, action, entity_type, created_at from activity_logs order by created_at desc limit 8",
    ),
  ]);
  return {
    totalProducts: Number(products?.count ?? 0),
    totalCategories: Number(categories?.count ?? 0),
    totalBrands: Number(brands?.count ?? 0),
    lowStock,
    outOfStock,
    recent,
    activity,
  };
});

export const listInventory = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<Pick<Product, "id" | "barcode" | "name" | "quantity" | "min_stock" | "updated_at">>(
    "select id, barcode, name, quantity, min_stock, updated_at from products order by updated_at desc",
  );
});

export const listReportProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<
    Pick<
      Product,
      "id" | "name" | "barcode" | "quantity" | "min_stock" | "selling_price" | "purchase_price"
    >
  >("select id, name, barcode, quantity, min_stock, selling_price, purchase_price from products");
});
