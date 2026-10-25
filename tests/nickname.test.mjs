import { test } from "node:test";
import assert from "node:assert/strict";
import { validateNickname } from "../public/assets/js/nickname.js";

test("acepta un nickname válido y limpia espacios", () => {
  assert.deepEqual(validateNickname("  Lucas   R  "), { ok: true, value: "Lucas R" });
});

test("rechaza muy corto y muy largo", () => {
  assert.equal(validateNickname("ab").ok, false);
  assert.equal(validateNickname("a".repeat(17)).ok, false);
});

test("rechaza HTML y caracteres raros (XSS en ranking público)", () => {
  assert.equal(validateNickname("<script>x</script>").ok, false);
  assert.equal(validateNickname("a\"onload=1").ok, false);
});

test("rechaza palabras bloqueadas aunque lleven tildes o símbolos", () => {
  assert.equal(validateNickname("Admín").ok, false);
  assert.equal(validateNickname("el_pelotudo").ok, false);
});

test("acepta tildes y ñ", () => {
  assert.equal(validateNickname("Ñandú_92").ok, true);
});
