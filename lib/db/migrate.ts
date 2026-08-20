import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

config({
  path: ".env.local",
});

// Fallback to .env (this project uses .env in dev).
if (!process.env.POSTGRES_URL) {
  config({ path: ".env" });
}

async function ensureDatabase(): Promise<void> {
  const rawUrl = process.env.POSTGRES_URL;
  if (!rawUrl) return;

  const url = new URL(rawUrl);
  const database = url.pathname.slice(1);

  const adminUrl = new URL(rawUrl);
  adminUrl.pathname = "/postgres";

  const conn = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const rows =
      await conn`SELECT 1 FROM pg_database WHERE datname = ${database}`;
    if (rows.length === 0) {
      await conn.unsafe(`CREATE DATABASE "${database}"`);
      console.log(`[startup] created database "${database}"`);
    }
  } finally {
    await conn.end({ timeout: 5 });
  }
}

const runMigrate = async () => {
  const url = process.env.POSTGRES_URL;

  if (!url) {
    console.warn("POSTGRES_URL is not defined, skipping migrations.");
    return;
  }

  await ensureDatabase();

  const connection = postgres(url, { max: 1 });
  const db = drizzle(connection);

  console.log("⏳ Running migrations...");

  const start = Date.now();
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  const end = Date.now();

  await connection.end({ timeout: 5 });
  console.log("✅ Migrations completed in", end - start, "ms");
};

runMigrate().catch((err) => {
  console.error("❌ Migration failed");
  console.error(err);
  process.exit(1);
});
