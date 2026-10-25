/*
  Nickname rules. Shown publicly in the ranking, so keep them strict.
  The server will re-validate the same rules in Stage 2.
*/

const ALLOWED = /^[\p{L}\p{N}_ .-]+$/u;
const BLOCKED = ["admin", "moderador", "puta", "puto", "mierda", "pelotudo", "hitler"];

export function validateNickname(raw) {
  if (typeof raw !== "string") return { ok: false, error: "Nickname inválido." };
  const value = raw.trim().replace(/\s+/g, " ");
  if (value.length < 3) return { ok: false, error: "Mínimo 3 caracteres." };
  if (value.length > 16) return { ok: false, error: "Máximo 16 caracteres." };
  if (!ALLOWED.test(value)) return { ok: false, error: "Solo letras, números, espacio, punto, guion y guion bajo." };
  const flat = value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  if (BLOCKED.some((word) => flat.includes(word))) return { ok: false, error: "Ese nickname no está permitido." };
  return { ok: true, value };
}
