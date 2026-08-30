import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey() {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be set to 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext token string using AES-256-GCM.
 * Returns a string in the format "ivHex:authTagHex:ciphertextHex".
 * Returns the original value unchanged if null/undefined/empty.
 */
export function encryptToken(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV (recommended for GCM)
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a value previously encrypted with encryptToken().
 * If the value does not match the "ivHex:authTagHex:ciphertextHex" format,
 * it is returned as-is (backward compat for plain-text tokens during migration).
 * Returns the original value unchanged if null/undefined/empty.
 */
export function decryptToken(value) {
  if (!value) return value;
  const parts = value.split(":");
  if (parts.length !== 3) return value; // plaintext — not yet encrypted
  const [ivHex, authTagHex, encHex] = parts;
  try {
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    // Value matched the encrypted format but failed authentication — it may be
    // tampered or corrupted. Return null so callers handle the failure explicitly
    // rather than using a compromised/garbage value as if it were a valid token.
    return null;
  }
}

/**
 * Decrypts fbLongLivedToken and fbPageAccessToken in-place on a lean user object.
 * Safe to call even if fields are absent or already plaintext.
 */
export function decryptUserTokens(user) {
  if (!user) return user;
  if (user.fbLongLivedToken) user.fbLongLivedToken = decryptToken(user.fbLongLivedToken);
  if (user.fbPageAccessToken) user.fbPageAccessToken = decryptToken(user.fbPageAccessToken);
  return user;
}
