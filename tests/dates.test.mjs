import { test } from "node:test";
import assert from "node:assert/strict";
import { argentinaDate, isoWeekKey, addDays } from "../server/dates.js";

test("argentinaDate: 02:59 UTC todavía es el día anterior en Argentina", () => {
  assert.equal(argentinaDate(new Date("2026-10-26T02:59:59Z")), "2026-10-25");
  assert.equal(argentinaDate(new Date("2026-10-26T03:00:00Z")), "2026-10-26");
});

test("la semana cambia el lunes 00:00 hora argentina (no domingo 23:59)", () => {
  const sundayLastSecond = argentinaDate(new Date("2026-10-26T02:59:59Z")); // domingo 23:59:59 ART
  const mondayFirstSecond = argentinaDate(new Date("2026-10-26T03:00:00Z")); // lunes 00:00:00 ART
  assert.equal(isoWeekKey(sundayLastSecond), "2026-W43");
  assert.equal(isoWeekKey(mondayFirstSecond), "2026-W44");
});

test("isoWeekKey: casos de borde de fin y principio de año", () => {
  assert.equal(isoWeekKey("2026-01-01"), "2026-W01");
  assert.equal(isoWeekKey("2024-12-30"), "2025-W01");
  assert.equal(isoWeekKey("2027-01-03"), "2026-W53");
});

test("addDays cruza meses y años", () => {
  assert.equal(addDays("2026-10-25", 7), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
