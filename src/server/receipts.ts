import { createServerFn } from "@tanstack/react-start";

export type ReceiptItemInput = {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
};

export type ReceiptItem = {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
};

export type Receipt = {
  id: string;
  invoice_number: number;
  customer_name: string | null;
  subtotal: number;
  discount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  cash_paid: number;
  cash_exchange: number;
  created_at: string;
};

export type ReceiptWithItems = Receipt & { items: ReceiptItem[] };

const VAT_RATE = 11;

// node-postgres returns NUMERIC columns as strings (to avoid float precision
// loss), so every numeric field must be coerced back to a real JS number here
// - otherwise callers relying on the declared `number` types (e.g. .toFixed())
// break at runtime.
const toReceipt = <T extends Receipt>(row: T): T => ({
  ...row,
  subtotal: Number(row.subtotal),
  discount: Number(row.discount),
  vat_rate: Number(row.vat_rate),
  vat_amount: Number(row.vat_amount),
  total: Number(row.total),
  cash_paid: Number(row.cash_paid),
  cash_exchange: Number(row.cash_exchange),
});

const toReceiptItem = (row: ReceiptItem): ReceiptItem => ({
  ...row,
  quantity: Number(row.quantity),
  unit_price: Number(row.unit_price),
  total: Number(row.total),
});

export const createReceipt = createServerFn({ method: "POST" })
  .validator(
    (data: {
      items: ReceiptItemInput[];
      customer_name?: string | null;
      discount?: number;
      cash_paid?: number;
    }) => data,
  )
  .handler(async ({ data }): Promise<ReceiptWithItems> => {
    if (data.items.length === 0) throw new Error("Receipt has no items.");

    const { getPool } = await import("./db.server");
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query("begin");

      const subtotal = data.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
      const discount = Math.max(0, Number(data.discount || 0));
      // Prices are tax-inclusive, so the VAT amount is the portion of the
      // total that represents tax, not an additional charge on top.
      const total = Math.max(0, subtotal - discount);
      const vatAmount = total - total / (1 + VAT_RATE / 100);
      const cashPaid = Math.max(0, Number(data.cash_paid || 0));
      const cashExchange = Math.max(0, cashPaid - total);

      const receipt = await client.query<Receipt>(
        `insert into receipts (
          customer_name, subtotal, discount, vat_rate, vat_amount, total, cash_paid, cash_exchange
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)
        returning id, invoice_number, customer_name, subtotal, discount, vat_rate, vat_amount,
                  total, cash_paid, cash_exchange, created_at`,
        [
          data.customer_name?.trim() || null,
          subtotal,
          discount,
          VAT_RATE,
          vatAmount,
          total,
          cashPaid,
          cashExchange,
        ],
      );
      const savedReceipt = receipt.rows[0];
      if (!savedReceipt) throw new Error("Could not create receipt.");

      const items: ReceiptItem[] = [];
      for (const item of data.items) {
        const row = await client.query<ReceiptItem>(
          `insert into receipt_items (receipt_id, product_id, description, quantity, unit_price, total)
           values ($1, $2, $3, $4, $5, $6)
           returning id, product_id, description, quantity, unit_price, total`,
          [
            savedReceipt.id,
            item.product_id,
            item.description,
            item.quantity,
            item.unit_price,
            item.quantity * item.unit_price,
          ],
        );
        if (row.rows[0]) items.push(toReceiptItem(row.rows[0]));
      }

      await client.query(
        "insert into activity_logs (action, entity_type, entity_id, metadata) values ($1, $2, $3, $4)",
        [
          "receipt_created",
          "receipt",
          savedReceipt.id,
          { invoice_number: savedReceipt.invoice_number, total: savedReceipt.total },
        ],
      );

      await client.query("commit");
      return { ...toReceipt(savedReceipt), items };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

export const listRecentReceipts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  const rows = await query<Receipt & { item_count: number }>(
    `select r.id, r.invoice_number, r.customer_name, r.subtotal, r.discount, r.vat_rate,
            r.vat_amount, r.total, r.cash_paid, r.cash_exchange, r.created_at,
            count(ri.id)::int as item_count
     from receipts r
     left join receipt_items ri on ri.receipt_id = r.id
     group by r.id
     order by r.created_at desc
     limit 5`,
  );
  return rows.map(toReceipt);
});

export const listAllReceipts = createServerFn({ method: "GET" }).handler(async () => {
  const { query } = await import("./db.server");
  const rows = await query<Receipt & { item_count: number }>(
    `select r.id, r.invoice_number, r.customer_name, r.subtotal, r.discount, r.vat_rate,
            r.vat_amount, r.total, r.cash_paid, r.cash_exchange, r.created_at,
            count(ri.id)::int as item_count
     from receipts r
     left join receipt_items ri on ri.receipt_id = r.id
     group by r.id
     order by r.created_at desc`,
  );
  return rows.map(toReceipt);
});

export type ReceiptDraftLine = {
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
};

// Single shared row, not per-user - a phone scanning items and a monitor
// watching the same page both read/write this so they stay in sync via
// polling (see refetchInterval on the client query).
export const getDraftReceipt = createServerFn({ method: "GET" }).handler(async () => {
  const { one } = await import("./db.server");
  const row = await one<{ items: ReceiptDraftLine[]; updated_at: string }>(
    "select items, updated_at from receipt_draft where id = 'default'",
  );
  return { items: row?.items ?? [], updated_at: row?.updated_at ?? null };
});

export const saveDraftReceipt = createServerFn({ method: "POST" })
  .validator((data: { items: ReceiptDraftLine[] }) => data)
  .handler(async ({ data }) => {
    const { one } = await import("./db.server");
    await one(
      `insert into receipt_draft (id, items, updated_at) values ('default', $1, now())
       on conflict (id) do update set items = excluded.items, updated_at = excluded.updated_at`,
      [JSON.stringify(data.items)],
    );
    return { ok: true };
  });

export const getReceipt = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<ReceiptWithItems | null> => {
    const { one, query } = await import("./db.server");
    const receipt = await one<Receipt>(
      `select id, invoice_number, customer_name, subtotal, discount, vat_rate, vat_amount,
              total, cash_paid, cash_exchange, created_at
       from receipts where id = $1`,
      [data.id],
    );
    if (!receipt) return null;
    const items = await query<ReceiptItem>(
      `select id, product_id, description, quantity, unit_price, total
       from receipt_items where receipt_id = $1 order by created_at`,
      [data.id],
    );
    return { ...toReceipt(receipt), items: items.map(toReceiptItem) };
  });
