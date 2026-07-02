import { createServerFn } from "@tanstack/react-start";

import { slugify } from "@/lib/format";

export type CrudTable = "categories";
export type CrudRow = { id: string; name: string; slug: string; description: string | null };
export type ProductGender = "men" | "women" | "unisex" | "kids";
export type ProductStatus = "available" | "out_of_stock" | "discontinued";
export type ProductInput = {
  id?: string;
  barcode: string;
  article_number?: string | null;
  name: string;
  model_name?: string | null;
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
  category?: { name: string } | null;
};
export type ImportBatch = {
  id: string;
  file_name: string;
  item_count: number;
  total_quantity: number;
  undone_at: string | null;
  created_at: string;
};
export type SoldProductReport = {
  id: string;
  barcode: string;
  name: string;
  quantity_sold: number;
  selling_price: number;
  total_sales: number;
  last_sold_at: string;
};

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

export const listCategoryOptions = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<{ id: string; name: string }>("select id, name from categories order by name");
});

const productColumns = `
  p.id, p.barcode, p.article_number, p.name, p.model_name, p.category_id,
  p.key_category, p.age_group, p.gender, p.sport, p.marketing_line, p.product_division,
  p.product_line, p.product_type, p.sub_brand, p.color, p.size, p.purchase_price,
  p.selling_price, p.quantity, p.min_stock, p.description, p.images, p.source_thumbnail,
  p.status, p.created_at, p.updated_at,
  case when c.id is null then null else json_build_object('name', c.name) end as category
`;

export const listProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<Product>(
    `select ${productColumns}
     from products p
     left join categories c on c.id = p.category_id
     where p.quantity > 0
     order by p.created_at desc`,
  );
});

export const listArchivedProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<Product>(
    `select ${productColumns}
     from products p
     left join categories c on c.id = p.category_id
     where p.quantity = 0 and p.status = 'out_of_stock'
     order by p.updated_at desc`,
  );
});

export const getProduct = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { one } = await import("./db.server");
    return one<Product>(
      `select ${productColumns}
       from products p
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
          barcode = $1, article_number = $2, name = $3, model_name = $4, category_id = $5,
          key_category = $6, age_group = $7, gender = $8, sport = $9, marketing_line = $10,
          product_division = $11, product_line = $12, product_type = $13, sub_brand = $14,
          color = $15, size = $16, purchase_price = $17, selling_price = $18, quantity = $19,
          min_stock = $20, description = $21, images = $22, source_thumbnail = $23, status = $24
         where id = $25 returning id`,
        [...values, data.id],
      );
      return data.id;
    }
    const row = await one<{ id: string }>(
      `insert into products (
        barcode, article_number, name, model_name, category_id, key_category, age_group,
        gender, sport, marketing_line, product_division, product_line, product_type, sub_brand,
        color, size, purchase_price, selling_price, quantity, min_stock, description, images,
        source_thumbnail, status
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24
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
  .validator((data: { products: ProductInput[]; categories: string[]; fileName?: string }) => data)
  .handler(async ({ data }) => {
    const { getPool } = await import("./db.server");
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const totalQuantity = data.products.reduce(
        (sum, product) => sum + Math.max(0, Number(product.quantity || 0)),
        0,
      );
      const batch = await client.query<{ id: string }>(
        `insert into import_batches (file_name, item_count, total_quantity)
         values ($1, $2, $3)
         returning id`,
        [data.fileName?.trim() || "Imported file", data.products.length, totalQuantity],
      );
      const batchId = batch.rows[0]?.id;
      if (!batchId) throw new Error("Could not create import history record.");

      for (const name of data.categories) {
        await client.query(
          "insert into categories (name, slug) values ($1, $2) on conflict (slug) do update set name = excluded.name",
          [name, slugify(name)],
        );
      }
      const categories = await client.query<{ id: string; slug: string }>(
        "select id, slug from categories",
      );
      const categoryId = new Map(categories.rows.map((row) => [row.slug, row.id]));
      for (const product of data.products) {
        const withIds = {
          ...product,
          category_id: product.category_id ? (categoryId.get(product.category_id) ?? null) : null,
        };
        const imported = await client.query<{ id: string; barcode: string; name: string }>(
          `insert into products (
            barcode, article_number, name, model_name, category_id, key_category, age_group,
            gender, sport, marketing_line, product_division, product_line, product_type, sub_brand,
            color, size, purchase_price, selling_price, quantity, min_stock, description, images,
            source_thumbnail, status
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
            $17, $18, $19, $20, $21, $22, $23, $24
          )
          on conflict (barcode) do update set
            article_number = excluded.article_number, name = excluded.name, model_name = excluded.model_name,
            category_id = excluded.category_id, key_category = excluded.key_category,
            age_group = excluded.age_group, gender = excluded.gender, sport = excluded.sport,
            marketing_line = excluded.marketing_line, product_division = excluded.product_division,
            product_line = excluded.product_line, product_type = excluded.product_type, sub_brand = excluded.sub_brand,
            purchase_price = excluded.purchase_price, selling_price = excluded.selling_price,
            quantity = products.quantity + excluded.quantity,
            min_stock = excluded.min_stock, images = excluded.images, source_thumbnail = excluded.source_thumbnail,
            status = case
              when products.quantity + excluded.quantity = 0 then 'out_of_stock'::product_status
              when products.status = 'discontinued' then products.status
              else 'available'::product_status
            end
          returning id, barcode, name`,
          productValues(withIds),
        );
        const productRow = imported.rows[0];
        if (productRow) {
          await client.query(
            `insert into import_items (
              import_batch_id, product_id, barcode, product_name, quantity_added
            ) values ($1, $2, $3, $4, $5)`,
            [
              batchId,
              productRow.id,
              productRow.barcode,
              productRow.name,
              Math.max(0, Number(product.quantity || 0)),
            ],
          );
        }
      }
      await client.query(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4)",
        [
          "imported",
          "import_batch",
          batchId,
          { file_name: data.fileName?.trim() || "Imported file", item_count: data.products.length },
        ],
      );
      await client.query("commit");
      return { count: data.products.length, importBatchId: batchId };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

export const listImportBatches = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<ImportBatch>(
    `select id, file_name, item_count, total_quantity, undone_at, created_at
     from import_batches
     where undone_at is null
     order by created_at desc
     limit 8`,
  );
});

export const undoImportBatch = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getPool } = await import("./db.server");
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");
      const batch = await client.query<ImportBatch>(
        `select id, file_name, item_count, total_quantity, undone_at, created_at
         from import_batches
         where id = $1
         for update`,
        [data.id],
      );
      const importBatch = batch.rows[0];
      if (!importBatch) throw new Error("Import batch not found.");
      if (importBatch.undone_at) throw new Error("This import has already been undone.");

      const items = await client.query<{ product_id: string | null; quantity_added: number }>(
        "select product_id, quantity_added from import_items where import_batch_id = $1",
        [data.id],
      );

      for (const item of items.rows) {
        if (!item.product_id) continue;
        await client.query(
          `update products
           set quantity = greatest(quantity - $1, 0),
               status = case
                 when status = 'discontinued' then status
                 when greatest(quantity - $1, 0) > 0 then 'available'::product_status
                 else status
               end
           where id = $2`,
          [Number(item.quantity_added || 0), item.product_id],
        );
      }

      await client.query(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4)",
        [
          "import_undone",
          "import_batch",
          data.id,
          { file_name: importBatch.file_name, item_count: importBatch.item_count },
        ],
      );
      await client.query("delete from import_batches where id = $1", [data.id]);
      await client.query("commit");
      return { count: items.rowCount ?? 0 };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

export const getDashboardStats = createServerFn({ method: "GET" }).handler(async () => {
  const { one, query } = await import("./db.server");
  const [products, categories, lowStock, outOfStock, recent, activity] = await Promise.all([
    one<{ count: string }>("select count(*) from products"),
    one<{ count: string }>("select count(*) from categories"),
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
    lowStock,
    outOfStock,
    recent,
    activity,
  };
});

export const listInventory = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<Pick<Product, "id" | "barcode" | "name" | "quantity" | "min_stock" | "updated_at">>(
    "select id, barcode, name, quantity, min_stock, updated_at from products where quantity > 0 order by updated_at desc",
  );
});

export const adjustProductStockByBarcode = createServerFn({ method: "POST" })
  .validator((data: { barcode: string; mode: "remove" | "return" }) => data)
  .handler(async ({ data }) => {
    const barcode = data.barcode.trim();
    if (!barcode) throw new Error("Barcode is required.");

    const { one } = await import("./db.server");
    if (data.mode === "return") {
      const returned = await one<
        Pick<Product, "id" | "barcode" | "name" | "quantity" | "min_stock"> & {
          previous_quantity: number;
        }
      >(
        `update products
         set quantity = quantity + 1,
             status = case
               when status = 'out_of_stock' then 'available'::product_status
               else status
             end
         where barcode = $1
         returning id, barcode, name, quantity - 1 as previous_quantity, quantity, min_stock`,
        [barcode],
      );

      if (!returned) return { status: "not_found" as const, barcode };

      await one(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4) returning id",
        [
          "scanned_return",
          "product",
          returned.id,
          {
            barcode: returned.barcode,
            previous_quantity: returned.previous_quantity,
            quantity: returned.quantity,
          },
        ],
      );
      return { status: "updated" as const, mode: data.mode, product: returned };
    }

    const updated = await one<
      Pick<Product, "id" | "barcode" | "name" | "quantity" | "min_stock"> & {
        previous_quantity: number;
      }
    >(
      `update products
       set quantity = quantity - 1,
           status = case
             when quantity - 1 = 0 then 'out_of_stock'::product_status
             when status = 'out_of_stock' then 'available'::product_status
             else status
           end
       where barcode = $1 and quantity > 0
       returning id, barcode, name, quantity + 1 as previous_quantity, quantity, min_stock`,
      [barcode],
    );

    if (updated) {
      await one(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4) returning id",
        [
          "scanned_out",
          "product",
          updated.id,
          {
            barcode: updated.barcode,
            previous_quantity: updated.previous_quantity,
            quantity: updated.quantity,
          },
        ],
      );
      return { status: "updated" as const, mode: data.mode, product: updated };
    }

    const existing = await one<Pick<Product, "id" | "barcode" | "name" | "quantity">>(
      "select id, barcode, name, quantity from products where barcode = $1",
      [barcode],
    );

    if (existing) return { status: "out_of_stock" as const, product: existing };
    return { status: "not_found" as const, barcode };
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

export const getSoldProductsReport = createServerFn({ method: "GET" }).handler(async () => {
  const { one, query } = await import("./db.server");
  const total = await one<{ count: string }>(
    "select count(*) from activity_logs where action = 'scanned_out'",
  );
  const products = await query<SoldProductReport>(
    `select
       p.id,
       p.barcode,
       p.name,
       count(a.id)::int as quantity_sold,
       p.selling_price,
       (count(a.id) * p.selling_price)::numeric(12, 2) as total_sales,
       max(a.created_at) as last_sold_at
     from activity_logs a
     join products p on p.id = a.entity_id
     where a.action = 'scanned_out'
     group by p.id, p.barcode, p.name, p.selling_price
     order by quantity_sold desc, last_sold_at desc`,
  );
  const totalSales = products.reduce((sum, product) => sum + Number(product.total_sales), 0);
  return { totalSold: Number(total?.count ?? 0), totalSales, products };
});
