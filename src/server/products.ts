import { createServerFn } from "@tanstack/react-start";

import { slugify } from "@/lib/format";

export type ProductGender = "men" | "women" | "unisex" | "kids";
export type ProductStatus = "available" | "out_of_stock" | "discontinued";
export type ProductInput = {
  id?: string;
  article_number: string;
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

const productColumns = `
  p.id, p.article_number, p.name, p.model_name, p.category_id,
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
  product.article_number,
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
          article_number = $1, name = $2, model_name = $3, category_id = $4,
          key_category = $5, age_group = $6, gender = $7, sport = $8, marketing_line = $9,
          product_division = $10, product_line = $11, product_type = $12, sub_brand = $13,
          color = $14, size = $15, purchase_price = $16, selling_price = $17, quantity = $18,
          min_stock = $19, description = $20, images = $21, source_thumbnail = $22, status = $23
         where id = $24 returning id`,
        [...values, data.id],
      );
      return data.id;
    }
    const row = await one<{ id: string }>(
      `insert into products (
        article_number, name, model_name, category_id, key_category, age_group,
        gender, sport, marketing_line, product_division, product_line, product_type, sub_brand,
        color, size, purchase_price, selling_price, quantity, min_stock, description, images,
        source_thumbnail, status
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23
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
        const previous = await client.query<{
          quantity: number;
          status: ProductStatus;
        }>("select quantity, status from products where article_number = $1", [
          withIds.article_number,
        ]);
        const previousProduct = previous.rows[0] ?? null;
        const imported = await client.query<{ id: string; article_number: string; name: string }>(
          `insert into products (
            article_number, name, model_name, category_id, key_category, age_group,
            gender, sport, marketing_line, product_division, product_line, product_type, sub_brand,
            color, size, purchase_price, selling_price, quantity, min_stock, description, images,
            source_thumbnail, status
          ) values (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
            $16, $17, $18, $19, $20, $21, $22, $23
          )
          on conflict (article_number) do update set
            name = excluded.name, model_name = excluded.model_name,
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
          returning id, article_number, name`,
          productValues(withIds),
        );
        const productRow = imported.rows[0];
        if (productRow) {
          await client.query(
            `insert into import_items (
              import_batch_id, product_id, article_number, product_name, quantity_added,
              previous_quantity, previous_status
            ) values ($1, $2, $3, $4, $5, $6, $7)`,
            [
              batchId,
              productRow.id,
              productRow.article_number,
              productRow.name,
              Math.max(0, Number(product.quantity || 0)),
              previousProduct?.quantity ?? null,
              previousProduct?.status ?? null,
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

      const items = await client.query<{
        product_id: string | null;
        quantity_added: number;
        previous_quantity: number | null;
        previous_status: ProductStatus | null;
      }>(
        `select product_id, quantity_added, previous_quantity, previous_status
         from import_items
         where import_batch_id = $1`,
        [data.id],
      );

      let deletedProducts = 0;
      for (const item of items.rows) {
        if (!item.product_id) continue;
        const product = await client.query<{ quantity: number; status: ProductStatus }>(
          "select quantity, status from products where id = $1 for update",
          [item.product_id],
        );
        const current = product.rows[0];
        if (!current) continue;

        const nextQuantity =
          item.previous_quantity === null
            ? Math.max(Number(current.quantity || 0) - Number(item.quantity_added || 0), 0)
            : Number(item.previous_quantity || 0);

        if (item.previous_quantity === null && nextQuantity === 0) {
          await client.query("delete from products where id = $1", [item.product_id]);
          deletedProducts += 1;
          continue;
        }

        await client.query(
          `update products
           set quantity = $1,
               status = case
                 when status = 'discontinued' then status
                 when $1 = 0 then coalesce($2::product_status, status)
                 else 'available'::product_status
               end
           where id = $3`,
          [nextQuantity, item.previous_status, item.product_id],
        );
      }

      await client.query(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4)",
        [
          "import_undone",
          "import_batch",
          data.id,
          {
            file_name: importBatch.file_name,
            item_count: importBatch.item_count,
            deleted_products: deletedProducts,
          },
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
