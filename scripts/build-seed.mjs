// Usage: node scripts/build-seed.mjs <songs.json> <out.sql> [--allow-test] [--start YYYY-MM-DD]
import { readFileSync, writeFileSync } from "node:fs";
import { buildSeed } from "./seed-lib.mjs";
import { argentinaDate } from "../server/dates.js";

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith("--"));
const [input, output] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--start" && args[i - 1] !== "--days");
const startIndex = args.indexOf("--start");
let start = startIndex >= 0 ? args[startIndex + 1] : undefined;
if (start === "today") start = argentinaDate();
const daysIndex = args.indexOf("--days");
const expectedDays = daysIndex >= 0 ? Number(args[daysIndex + 1]) : undefined;

if (!input || !output) {
  console.error("Uso: node scripts/build-seed.mjs <songs.json> <out.sql> [--allow-test] [--start YYYY-MM-DD|today] [--days N]");
  process.exit(2);
}

const data = JSON.parse(readFileSync(input, "utf8"));
const artists = JSON.parse(readFileSync(new URL("../public/assets/data/artists.json", import.meta.url), "utf8"));
const { errors, sql } = buildSeed(data, artists, { allowTest: flags.includes("--allow-test"), start, expectedDays });

if (errors.length) {
  console.error(`No se generó ${output}. Errores:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
writeFileSync(output, sql, "utf8");
console.log(`OK: ${output} (${data.songs.length} canciones desde ${start || data.startDate}).`);
