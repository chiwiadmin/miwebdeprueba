// Minimal Cloudflare D1 look-alike over node:sqlite, so tests run the REAL schema and SQL.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { buildSeed } from "../../scripts/seed-lib.mjs";

export const SEED_START = "2026-10-25";
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

export function createTestDb({ seed = true } = {}) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(read("../../db/schema.sql"));
  if (seed) {
    const songs = JSON.parse(read("../../db/songs.example.json"));
    const artists = JSON.parse(read("../../public/assets/data/artists.json"));
    const { sql, errors } = buildSeed(songs, artists, { allowTest: true, start: SEED_START });
    if (errors.length) throw new Error(errors.join("; "));
    sqlite.exec(sql);
  }

  const d1 = {
    // D1's batch() is atomic: all statements commit together or none do.
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(statement.runSync()); // no awaits: atomic, like D1
        sqlite.exec("COMMIT");
        return results;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        runSync() { return { meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }; },
        async run() { return statement.runSync(); }
      };
      return statement;
    }
  };
  return { sqlite, d1 };
}
