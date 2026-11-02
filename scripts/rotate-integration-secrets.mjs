import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "../src/lib/security/secret-box.mjs";

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
    try {
      plaintext = decryptSecret(config.token, oldKey);
    } catch (oldKeyError) {
      try {
        decryptSecret(config.token, newKey);
        return { config: rawConfig, changed: false };
      } catch {
        throw new Error("Integration token cannot be decrypted with either supplied key", { cause: oldKeyError });
      }
    }
  } else {
    // Legacy plaintext credentials are migrated into authenticated ciphertext
    // as part of the same controlled rotation.
    plaintext = config.token;
  }

  const rotated = { ...config, token: encryptSecret(plaintext, newKey) };
  return { config: JSON.stringify(rotated), changed: true };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const oldKey = process.env.MODRIK_ENCRYPTION_KEY_OLD;
  const newKey = process.env.MODRIK_ENCRYPTION_KEY_NEW;
  if (!oldKey || !newKey || oldKey === newKey) {
    throw new Error("Set distinct MODRIK_ENCRYPTION_KEY_OLD and MODRIK_ENCRYPTION_KEY_NEW values");
  }

  // Validate both keys before touching the database.
  encryptSecret("rotation-key-check", oldKey);
  encryptSecret("rotation-key-check", newKey);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.integration.findMany({
      where: { kind: { in: ["github", "jira"] } },
      select: { id: true, config: true, kind: true },
      orderBy: { id: "asc" },
    });
    const changes = rows.map((row) => ({
      id: row.id,
      original: row.config,
      ...rotateIntegrationConfig(row.config, oldKey, newKey),
    })).filter((row) => row.changed);

    if (!apply) {
      process.stdout.write(`Dry run: ${rows.length} integration records inspected; ${changes.length} require re-encryption. No database writes performed. Re-run with --apply after backup and maintenance window approval.\\n`);
      return;
    }

    await prisma.$transaction(async (tx) => {
      for (const row of changes) {
        const updated = await tx.integration.updateMany({
          where: { id: row.id, config: row.original },
          data: { config: row.config },
        });
        if (updated.count !== 1) {
          throw new Error(`Integration ${row.id} changed during rotation; transaction aborted`);
        }
      }
    });
    process.stdout.write(`Rotation complete: ${changes.length} integration records re-encrypted. Keep the old key available for rollback until post-rotation verification is complete.\\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`Secret rotation failed: ${error instanceof Error ? error.message : "unknown error"}\\n`);
    process.exitCode = 1;
  });
}
