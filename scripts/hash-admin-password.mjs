#!/usr/bin/env node
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { stdin, stdout } from "node:process";

const scrypt = promisify(scryptCallback);

function readPassword(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
    throw new Error("Run this command from an interactive terminal so the password is not echoed or stored in shell history.");
  }
  return new Promise((resolve, reject) => {
    let password = "";
    stdout.write(label);
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
        else if (character >= " " && password.length < 1024) password += character;
      }
    };
    stdin.on("data", onData);
  });
}

try {
  const password = await readPassword("Admin password (hidden): ");
  const confirmation = await readPassword("Confirm password (hidden): ");
  if (password.length < 14) throw new Error("Use a password with at least 14 characters.");
  const left = Buffer.from(password);
  const right = Buffer.from(confirmation);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new Error("Passwords do not match.");
  }

  const N = 32768;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, {
    N, r, p, maxmem: 128 * 1024 * 1024,
  });
  const value = "$scrypt$" + N + "$" + r + "$" + p + "$" +
    salt.toString("hex") + "$" + Buffer.from(derived).toString("hex");
  stdout.write("\nMODRIK_ADMIN_PASSWORD_HASH=" + value + "\n");
  stdout.write("Store it in the deployment secret manager. Do not commit it.\n");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
