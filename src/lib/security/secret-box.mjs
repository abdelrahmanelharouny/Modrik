import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function resolveKey(key = process.env.MODRIK_ENCRYPTION_KEY) {
  if (!key) throw new Error("MODRIK_ENCRYPTION_KEY is required before saving integration credentials");
  const bytes = /^[a-f0-9]{64}$/i.test(key)
    ? Buffer.from(key, "hex")
    : Buffer.from(key, "base64");
  if (bytes.length !== 32) {
    throw new Error("MODRIK_ENCRYPTION_KEY must be a 32-byte base64 value or 64-character hex value");
  }
  return bytes;
}

export function encryptSecret(plainText, key) {
  if (typeof plainText !== "string") throw new TypeError("Secret must be a string");
  if (!plainText) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveKey(key), iv);
  const ciphertext = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(":");
}

export function decryptSecret(storedValue, key) {
  if (typeof storedValue !== "string") throw new TypeError("Stored secret must be a string");
  if (!storedValue) return "";
  // Backward compatibility for credentials written before encryption was
  // introduced. They are readable but must be re-saved to become encrypted.
  if (!storedValue.startsWith("enc:")) return storedValue;
  if (!storedValue.startsWith(PREFIX)) throw new Error("Unsupported encrypted credential version");

  const parts = storedValue.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted credential");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Malformed encrypted credential payload");
  }
  const decipher = createDecipheriv("aes-256-gcm", resolveKey(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}
