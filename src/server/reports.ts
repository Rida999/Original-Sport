import { createServerFn } from "@tanstack/react-start";

import type { Product } from "./products";

export type SoldProductReport = {
  id: string;
  article_number: string;
  name: string;
  quantity_sold: number;
  selling_price: number;
  total_sales: number;
  last_sold_at: string;
};

export type SalesReportPeriod = "today" | "week" | "month";

export type SalesReport = {
  period: SalesReportPeriod;
  summary: {
    totalIncome: number;
    receiptCount: number;
    totalItems: number;
    averageReceipt: number;
  };
  chart: {
    label: string;
    income: number;
    receipts: number;
  }[];
  products: SoldProductReport[];
  receipts: {
    id: string;
    invoice_number: number;
    item_count: number;
    total: number;
    cash_paid: number;
    cash_exchange: number;
    created_at: string;
  }[];
};

export const listReportProducts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  return query<
    Pick<
      Product,
      | "id"
      | "name"
      | "article_number"
      | "quantity"
      | "min_stock"
      | "selling_price"
      | "purchase_price"
    >
  >(
    "select id, name, article_number, quantity, min_stock, selling_price, purchase_price from products",
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
       p.article_number,
       p.name,
       count(a.id)::int as quantity_sold,
       p.selling_price,
       (count(a.id) * p.selling_price)::numeric(12, 2) as total_sales,
       max(a.created_at) as last_sold_at
     from activity_logs a
     join products p on p.id = a.entity_id
     where a.action = 'scanned_out'
     group by p.id, p.article_number, p.name, p.selling_price
     order by quantity_sold desc, last_sold_at desc`,
  );
  const totalSales = products.reduce((sum, product) => sum + Number(product.total_sales), 0);
  return { totalSold: Number(total?.count ?? 0), totalSales, products };
});

const salesPeriodSql = (period: SalesReportPeriod) => {
  if (period === "today") {
    return {
      start: "date_trunc('day', now())",
      end: "date_trunc('day', now()) + interval '1 day'",
      step: "interval '1 hour'",
      bucket: "hour",
      label: "HH24:00",
    };
  }

  if (period === "week") {
    return {
      start: "date_trunc('week', now())",
      end: "date_trunc('week', now()) + interval '1 week'",
      step: "interval '1 day'",
      bucket: "day",
      label: "Dy",
    };
  }

  return {
    start: "date_trunc('month', now())",
    end: "date_trunc('month', now()) + interval '1 month'",
    step: "interval '1 day'",
    bucket: "day",
    label: "Mon DD",
  };
};

export const getSalesReport = createServerFn({ method: "GET" })
  .validator((data: { period: SalesReportPeriod }) => data)
  .handler(async ({ data }): Promise<SalesReport> => {
    const period = data.period === "week" || data.period === "month" ? data.period : "today";
    const range = salesPeriodSql(period);
    const { one, query } = await import("./db.server");

    const summary = await one<{
      total_income: string;
      receipt_count: number;
      total_items: number;
      average_receipt: string;
    }>(
      `with filtered_receipts as (
         select id, total
         from receipts
         where created_at >= ${range.start} and created_at < ${range.end}
       )
       select
         coalesce(sum(fr.total), 0)::numeric(12, 2) as total_income,
         count(fr.id)::int as receipt_count,
         coalesce(sum(ri.quantity), 0)::int as total_items,
         coalesce(avg(fr.total), 0)::numeric(12, 2) as average_receipt
       from filtered_receipts fr
       left join receipt_items ri on ri.receipt_id = fr.id`,
    );

    const chart = await query<{ label: string; income: string; receipts: number }>(
      `with buckets as (
         select generate_series(${range.start}, ${range.end} - ${range.step}, ${range.step}) as bucket_start
       )
       select
         to_char(b.bucket_start, '${range.label}') as label,
         coalesce(sum(r.total), 0)::numeric(12, 2) as income,
         count(r.id)::int as receipts
       from buckets b
       left join receipts r
         on date_trunc('${range.bucket}', r.created_at) = b.bucket_start
        and r.created_at >= ${range.start}
        and r.created_at < ${range.end}
       group by b.bucket_start
       order by b.bucket_start`,
    );

    const products = await query<SoldProductReport>(
      `select
         coalesce(p.id::text, ri.product_id::text, ri.description) as id,
         coalesce(p.article_number, '') as article_number,
         coalesce(p.name, ri.description) as name,
         sum(ri.quantity)::int as quantity_sold,
         max(ri.unit_price)::numeric(12, 2) as selling_price,
         sum(ri.total)::numeric(12, 2) as total_sales,
         max(r.created_at) as last_sold_at
       from receipt_items ri
       join receipts r on r.id = ri.receipt_id
       left join products p on p.id = ri.product_id
       where r.created_at >= ${range.start} and r.created_at < ${range.end}
       group by coalesce(p.id::text, ri.product_id::text, ri.description), p.article_number, p.name, ri.description
       order by quantity_sold desc, total_sales desc
       limit 6`,
    );

    const receipts = await query<SalesReport["receipts"][number]>(
      `select
         r.id,
         r.invoice_number,
         coalesce(sum(ri.quantity), 0)::int as item_count,
         r.total,
         r.cash_paid,
         r.cash_exchange,
         r.created_at
       from receipts r
       left join receipt_items ri on ri.receipt_id = r.id
       where r.created_at >= ${range.start} and r.created_at < ${range.end}
       group by r.id
       order by r.created_at desc
       limit 5`,
    );

    return {
      period,
      summary: {
        totalIncome: Number(summary?.total_income ?? 0),
        receiptCount: Number(summary?.receipt_count ?? 0),
        totalItems: Number(summary?.total_items ?? 0),
        averageReceipt: Number(summary?.average_receipt ?? 0),
      },
      chart: chart.map((point) => ({
        label: point.label,
        income: Number(point.income),
        receipts: Number(point.receipts),
      })),
      products: products.map((product) => ({
        ...product,
        quantity_sold: Number(product.quantity_sold),
        selling_price: Number(product.selling_price),
        total_sales: Number(product.total_sales),
      })),
      receipts: receipts.map((receipt) => ({
        ...receipt,
        item_count: Number(receipt.item_count),
        total: Number(receipt.total),
        cash_paid: Number(receipt.cash_paid),
        cash_exchange: Number(receipt.cash_exchange),
      })),
    };
  });
