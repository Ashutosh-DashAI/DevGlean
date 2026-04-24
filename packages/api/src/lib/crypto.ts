import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { env } from "../env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getKeyBuffer(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, "hex");
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Returns a string in format: iv:encrypted:authTag (all hex encoded)
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const key = getKeyBuffer();
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

/**
 * Decrypts a string encrypted with the encrypt() function.
 * Expects input in format: iv:encrypted:authTag (all hex encoded)
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext format");
  }

  const [ivHex, encryptedHex, authTagHex] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = getKeyBuffer();

  if (authTag.length !== TAG_LENGTH) {
    throw new Error("Invalid auth tag length");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

/**
 * Computes SHA-256 hash of input string
 */
export function sha256(input: string): string {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(input);
  return hash.digest("hex");
}

/**
 * Generates a cryptographically secure random hex string
 */
export function generateSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("hex");
}
