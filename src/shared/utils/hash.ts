import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

// Passwords are low-entropy and user-chosen — slow, salted hashing is
// required to resist offline guessing.
const BCRYPT_ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// API keys and refresh tokens are 32 bytes of CSPRNG output, not
// user-chosen secrets: bcrypt's slow stretching defends against guessing
// low-entropy input, which doesn't apply here (the entropy IS the secret);
// it would also make lookup-by-hash unindexable, and would add ~100ms of
// bcrypt work to every authenticated request. A fast, deterministic hash
// keyed for O(1) lookup is the correct tool.
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function generateOpaqueToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}
