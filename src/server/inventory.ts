import { createServerFn } from "@tanstack/react-start";

import type { Product } from "./products";

export const listInventory = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<
    Pick<
      Product,
      | "id"
      | "barcode"
      | "article_number"
      | "name"
      | "sub_brand"
      | "quantity"
      | "min_stock"
      | "selling_price"
      | "updated_at"
    >
  >(
    "select id, barcode, article_number, name, sub_brand, quantity, min_stock, selling_price, updated_at from products where quantity > 0 order by updated_at desc",
  );
});

export const adjustProductStockByBarcode = createServerFn({ method: "POST" })
  .validator((data: { barcode: string; mode: "remove" | "return" }) => data)
  .handler(async ({ data }) => {
    const barcode = data.barcode.trim();
    if (!barcode) throw new Error("Article number is required.");

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
         where barcode = $1 or article_number = $1
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
      Pick<Product, "id" | "barcode" | "name" | "quantity" | "min_stock" | "selling_price"> & {
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
       where (barcode = $1 or article_number = $1) and quantity > 0
       returning id, barcode, name, quantity + 1 as previous_quantity, quantity, min_stock, selling_price`,
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
      "select id, barcode, name, quantity from products where barcode = $1 or article_number = $1",
      [barcode],
    );

    if (existing) return { status: "out_of_stock" as const, product: existing };
    return { status: "not_found" as const, barcode };
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
          barcode: string;
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
           returning id, barcode, name, quantity - $2 as previous_quantity, quantity`,
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
              barcode: product.barcode,
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
