import { createServerFn } from "@tanstack/react-start";

import type { Product } from "./products";

export type SoldProductReport = {
  id: string;
  barcode: string;
  article_number: string | null;
  name: string;
  quantity_sold: number;
  selling_price: number;
  total_sales: number;
  last_sold_at: string;
};

export const listReportProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<
    Pick<
      Product,
      | "id"
      | "name"
      | "barcode"
      | "article_number"
      | "quantity"
      | "min_stock"
      | "selling_price"
      | "purchase_price"
    >
  >(
    "select id, name, barcode, article_number, quantity, min_stock, selling_price, purchase_price from products",
  );
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
       p.article_number,
       p.name,
       count(a.id)::int as quantity_sold,
       p.selling_price,
       (count(a.id) * p.selling_price)::numeric(12, 2) as total_sales,
       max(a.created_at) as last_sold_at
     from activity_logs a
     join products p on p.id = a.entity_id
     where a.action = 'scanned_out'
     group by p.id, p.barcode, p.article_number, p.name, p.selling_price
     order by quantity_sold desc, last_sold_at desc`,
  );
  const totalSales = products.reduce((sum, product) => sum + Number(product.total_sales), 0);
  return { totalSold: Number(total?.count ?? 0), totalSales, products };
});
