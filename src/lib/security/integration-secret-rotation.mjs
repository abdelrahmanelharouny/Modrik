import { decryptSecret, encryptSecret } from "./secret-box.mjs";

function parseConfig(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Integration config must be a JSON object");
  }
  return parsed;
}

/**
 * Re-encrypt one serialized Integration.config value.
 * If it is already encrypted with the destination key, leave it unchanged so
 * the operation is safe to re-run after a partially completed rotation.
 */
export function rotateIntegrationConfig(rawConfig, oldKey, newKey) {
  const config = parseConfig(rawConfig);
  if (typeof config.token !== "string" || config.token.length === 0) {
    return { config: rawConfig, changed: false };
  }

  let plaintext;
  if (config.token.startsWith("enc:")) {
    if (!config.token.startsWith("enc:v1:")) {
      throw new Error("Unsupported encrypted credential version");
    }
    try {
      plaintext = decryptSecret(config.token, oldKey);
    } catch (oldKeyError) {
      if (oldKeyError instanceof Error && oldKeyError.message === "Unsupported encrypted credential version") throw oldKeyError;
      try {
        decryptSecret(config.token, newKey);
        return { config: rawConfig, changed: false };
      } catch {
        throw new Error("Integration token cannot be decrypted with either supplied key", { cause: oldKeyError });
      }
    }
  } else {
    plaintext = config.token;
  }

  const rotated = { ...config, token: encryptSecret(plaintext, newKey) };
  return { config: JSON.stringify(rotated), changed: true };
}
