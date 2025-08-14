/**
 * db-check-advisory-lock
 *
 * Inspect Postgres advisory lock used by Prisma Migrate.
 * Prisma prints a lock id like: pg_advisory_lock(72707369)
 *
 * Usage:
 *   npm --workspace apps/api run db:lock -- --lockId=72707369
 */

import "dotenv/config";
import { Client } from "pg";

function getArg(name: string, def?: string) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((a) => a.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : def;
}

async function main() {
  const lockStr = getArg("lockId");
  if (!lockStr) {
    console.error("Missing --lockId=<bigint> (example: --lockId=72707369)");
    process.exit(1);
  }

  const lockId = Number(lockStr);
  if (!Number.isFinite(lockId)) {
    console.error(`Invalid lock id: ${lockStr}`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const client = new Client({
    connectionString: url,
    statement_timeout: 10000,
  });
  await client.connect();

  // Advisory locks are in pg_locks with locktype = 'advisory'. For BIGINT locks,
  // the lock key is split into classid/objid.
  // In Postgres the two-int form is derived from the bigint; Prisma logs the bigint.
  // We'll search by reconstructing bigint from classid/objid for matching rows.

  const sql = `
    with advisory as (
      select
        l.pid,
        l.granted,
        l.mode,
        l.classid,
        l.objid,
        l.objsubid,
        -- reconstruct signed 64-bit from the two 32-bit fields
        ((l.classid::bigint << 32) + l.objid::bigint) as lock_key,
        a.usename,
        a.application_name,
        a.client_addr,
        a.state,
        a.query_start,
        left(a.query, 200) as query
      from pg_locks l
      left join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory'
    )
    select *
    from advisory
    where lock_key = $1
    order by granted desc, pid;
  `;

  const res = await client.query(sql, [lockId]);

  if (res.rows.length === 0) {
    console.log(`No rows found for advisory lock ${lockId}.`);
    console.log(
      "If Prisma is still timing out, it may be using a different lock id or the lock is being acquired/released quickly."
    );
  } else {
    console.log(`Found ${res.rows.length} advisory lock row(s) for ${lockId}:`);
    for (const r of res.rows) {
      console.log(
        JSON.stringify(
          {
            pid: r.pid,
            granted: r.granted,
            mode: r.mode,
            usename: r.usename,
            application_name: r.application_name,
            client_addr: r.client_addr,
            state: r.state,
            query_start: r.query_start,
            query: r.query,
          },
          null,
          2
        )
      );
    }
  }

  await client.end();
}

main().catch((e) => {
  console.error("db-check-advisory-lock failed:", e);
  process.exit(1);
});
