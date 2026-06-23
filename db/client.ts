import { Pool, types } from "pg";

// Postgres returns BIGINT (int8) and NUMERIC as strings by default; our app
// uses them as JS numbers (ids, counts, averages). Parse them as numbers.
types.setTypeParser(20, (v: string) => parseInt(v, 10)); // int8 / bigint
types.setTypeParser(1700, (v: string) => parseFloat(v)); // numeric / decimal

// Postgres (Supabase) connection. Uses DATABASE_URL (Transaction pooler).
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new Pool({ connectionString, max: 8, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

// Convert SQLite-style "?" placeholders to Postgres "$1, $2, ...".
function toPg(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function q<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const res = await getPool().query(toPg(sql), params);
  return res.rows as T[];
}

export async function one<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export async function run(sql: string, params: any[] = []): Promise<void> {
  await getPool().query(toPg(sql), params);
}
