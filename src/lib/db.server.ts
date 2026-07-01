import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Point it to your local PostgreSQL database.");
  }

  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  return pool;
}

export async function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const result = await getPool().query<T>(text, values);
  return result.rows;
}

export async function one<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}

export function emptyToNull(value: unknown) {
  if (typeof value !== "string") return value ?? null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}
