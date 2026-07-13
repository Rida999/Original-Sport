import { createServerFn } from "@tanstack/react-start";

import type { Product } from "./products";

export const getDashboardStats = createServerFn({ method: "GET" }).handler(async () => {
  const { one, query } = await import("./db.server");
  const [products, stock, outOfStockCount, outOfStock, recent, activity] = await Promise.all([
    one<{ count: string }>("select count(*) from products"),
    one<{ total: string }>("select coalesce(sum(quantity), 0) as total from products"),
    one<{ count: string }>("select count(*) from products where quantity = 0"),
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
    totalStock: Number(stock?.total ?? 0),
    outOfStockCount: Number(outOfStockCount?.count ?? 0),
    outOfStock,
    recent,
    activity,
  };
});
