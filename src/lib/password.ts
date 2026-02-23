import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const normalized = password.trim();
  if (normalized.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const derived = (await scryptAsync(normalized, salt, KEYLEN)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, salt, hashHex] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !hashHex) return false;

  const incoming = (await scryptAsync(password.trim(), salt, KEYLEN)) as Buffer;
  const expected = Buffer.from(hashHex, "hex");
  if (incoming.length !== expected.length) return false;
  return crypto.timingSafeEqual(incoming, expected);
}

