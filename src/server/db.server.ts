import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | undefined;

function shouldUseSsl(connectionString: string) {
  return (
    connectionString.includes("supabase.co") ||
    connectionString.includes("supabase.com") ||
    connectionString.includes("sslmode=require")
  );
}

function withoutSslQueryParams(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing. Add your Supabase PostgreSQL connection string.");
  }

  const connectionString = process.env.DATABASE_URL;

  pool ??= new Pool({
    connectionString: withoutSslQueryParams(connectionString),
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined,
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
