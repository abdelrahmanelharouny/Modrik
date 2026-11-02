#!/usr/bin/env node
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const scrypt = promisify(scryptCallback);
const rl = createInterface({ input: stdin, output: stdout });
try {
  const password = await rl.question("Admin password (input is hidden only by terminal settings): ");
  if (password.length < 14) {
    throw new Error("Use a password with at least 14 characters.");
  }
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  console.log("\nSet MODRIK_ADMIN_PASSWORD_HASH to this value:\n");
  console.log(`$scrypt$16384$8$1$${salt.toString("hex")}$${Buffer.from(derived).toString("hex")}`);
} finally {
  rl.close();
}
