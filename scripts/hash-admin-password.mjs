#!/usr/bin/env node
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import { stdin, stdout } from "node:process";

const scrypt = promisify(scryptCallback);

function readPassword() {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal.");
  }
  return new Promise((resolve, reject) => {
    let password = "";
    stdout.write("Admin password (hidden): ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const finish = (error) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
      if (error) reject(error);
      else resolve(password);
    };
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") return finish(new Error("Password entry cancelled."));
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u007f" || character === "\b") password = password.slice(0, -1);
        else if (character >= " ") password += character;
      }
    };
    stdin.on("data", onData);
  });
}

try {
  const password = await readPassword();
  if (password.length < 14) throw new Error("Use a password with at least 14 characters.");
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  console.log("\nSet MODRIK_ADMIN_PASSWORD_HASH to this value:\n");
  console.log(\`$scrypt$16384$8$1$\${salt.toString("hex")}$\${Buffer.from(derived).toString("hex")}\`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
