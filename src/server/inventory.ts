import { createServerFn } from "@tanstack/react-start";

import type { Product } from "./products";

const ensureProductQuickSaleColumn = async () => {
  const { one } = await import("./db.server");
  await one("alter table products add column if not exists quick_sale boolean not null default false");
};

export const listInventory = createServerFn({ method: "GET" }).handler(async () => {
  await ensureProductQuickSaleColumn();
  const { query } = await import("./db.server");
  return query<
    Pick<
      Product,
      | "id"
      | "article_number"
      | "name"
      | "sub_brand"
      | "quantity"
      | "min_stock"
      | "selling_price"
      | "updated_at"
    > & {
      quick_sale: boolean;
      last_sold_at: string | null;
    }
  >(
    `select
       p.id,
       p.article_number,
       p.name,
       p.sub_brand,
       p.quantity,
       p.min_stock,
       p.selling_price,
       p.quick_sale,
       p.updated_at,
       max(a.created_at) as last_sold_at
     from products p
     left join activity_logs a
       on a.entity_id = p.id
      and a.action = 'scanned_out'
     where p.quantity > 0
     group by p.id
     order by p.updated_at desc`,
  );
});

export const setProductQuickSale = createServerFn({ method: "POST" })
  .validator((data: { id: string; quick_sale: boolean }) => data)
  .handler(async ({ data }) => {
    await ensureProductQuickSaleColumn();
    const { one } = await import("./db.server");
    const product = await one<{ id: string; quick_sale: boolean }>(
      `update products
       set quick_sale = $2
       where id = $1
       returning id, quick_sale`,
      [data.id, Boolean(data.quick_sale)],
    );

    if (!product) throw new Error("Product not found.");
    return product;
  });

export const adjustProductStockByArticleNumber = createServerFn({ method: "POST" })
  .validator((data: { article_number: string; mode: "remove" | "return" }) => data)
  .handler(async ({ data }) => {
    const articleNumber = data.article_number.trim();
    if (!articleNumber) throw new Error("Article number is required.");
    if (!/^[A-Za-z0-9 ]{1,20}$/.test(articleNumber)) {
      throw new Error("Article number must be 20 characters or less with no special characters.");
    }

    const { one } = await import("./db.server");
    if (data.mode === "return") {
      const returned = await one<
        Pick<Product, "id" | "article_number" | "name" | "quantity" | "min_stock"> & {
          previous_quantity: number;
        }
      >(
        `update products
         set quantity = quantity + 1,
             status = case
               when status = 'out_of_stock' then 'available'::product_status
               else status
             end
         where article_number = $1
         returning id, article_number, name, quantity - 1 as previous_quantity, quantity, min_stock`,
        [articleNumber],
      );

      if (!returned) return { status: "not_found" as const, article_number: articleNumber };

      await one(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4) returning id",
        [
          "scanned_return",
          "product",
          returned.id,
          {
            article_number: returned.article_number,
            previous_quantity: returned.previous_quantity,
            quantity: returned.quantity,
          },
        ],
      );
      return { status: "updated" as const, mode: data.mode, product: returned };
    }

    const updated = await one<
      Pick<Product, "id" | "article_number" | "name" | "quantity" | "min_stock" | "selling_price"> & {
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
       where article_number = $1 and quantity > 0
       returning id, article_number, name, quantity + 1 as previous_quantity, quantity, min_stock, selling_price`,
      [articleNumber],
    );

    if (updated) {
      await one(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4) returning id",
        [
          "scanned_out",
          "product",
          updated.id,
          {
            article_number: updated.article_number,
            previous_quantity: updated.previous_quantity,
            quantity: updated.quantity,
          },
        ],
      );
      return { status: "updated" as const, mode: data.mode, product: updated };
    }

    const existing = await one<Pick<Product, "id" | "article_number" | "name" | "quantity">>(
      "select id, article_number, name, quantity from products where article_number = $1",
      [articleNumber],
    );

    if (existing) return { status: "out_of_stock" as const, product: existing };
    return { status: "not_found" as const, article_number: articleNumber };
  });

export const restoreReceiptStock = createServerFn({ method: "POST" })
  .validator((data: { items: { product_id: string | null; quantity: number }[] }) => data)
  .handler(async ({ data }) => {
    const items = data.items
      .filter((item) => item.product_id && Number(item.quantity) > 0)
      .map((item) => ({
        product_id: item.product_id as string,
        quantity: Math.max(1, Math.floor(Number(item.quantity))),
      }));

    if (items.length === 0) return { restored: 0 };

    const { getPool } = await import("./db.server");
    const client = await getPool().connect();

    try {
      await client.query("begin");
      let restored = 0;

      for (const item of items) {
        const result = await client.query<{
          id: string;
          article_number: string;
          name: string;
          previous_quantity: number;
          quantity: number;
        }>(
          `update products
           set quantity = quantity + $2,
               status = case
                 when status = 'out_of_stock' then 'available'::product_status
                 else status
               end
           where id = $1
           returning id, article_number, name, quantity - $2 as previous_quantity, quantity`,
          [item.product_id, item.quantity],
        );

        const product = result.rows[0];
        if (!product) continue;

        restored += item.quantity;
        await client.query(
          "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4)",
          [
            "receipt_item_returned",
            "product",
            product.id,
            {
              article_number: product.article_number,
              previous_quantity: product.previous_quantity,
              quantity: product.quantity,
              returned_quantity: item.quantity,
            },
          ],
        );
      }

      await client.query("commit");
      return { restored };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });
