/*
  Anonymous player identity: a random player id in an HMAC-signed, HttpOnly cookie.
  The browser cannot read or forge it. The signing secret lives only in the server env.
*/

export const COOKIE_NAME = "lp_session";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
const encoder = new TextEncoder();

function toBase64Url(buffer) {
  let binary = "";
  new Uint8Array(buffer).forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function importKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createToken(secret, playerId) {
  const signature = await crypto.subtle.sign("HMAC", await importKey(secret), encoder.encode(playerId));
  return `${playerId}.${toBase64Url(signature)}`;
}

/** Returns the player id when the signature is valid (constant-time check), otherwise null. */
export async function verifyToken(secret, token) {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const playerId = token.slice(0, dot);
  try {
    const valid = await crypto.subtle.verify("HMAC", await importKey(secret), fromBase64Url(token.slice(dot + 1)), encoder.encode(playerId));
    return valid ? playerId : null;
  } catch {
    return null;
  }
}

export function readCookie(header, name) {
  for (const part of (header || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return null;
}

export function sessionCookie(token, secure) {
  return `${COOKIE_NAME}=${token}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
