import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { AuthRepository } from "./auth.repository.js";
import type { AuthPrincipal, CredentialVerifier } from "../../core/middleware/auth.js";
import type { EventBus } from "../../core/eventBus.js";
import { config } from "../../core/config.js";
import { hashPassword, verifyPassword, sha256, generateOpaqueToken } from "../../shared/utils/hash.js";
import { conflict, unauthorized, notFound } from "../../shared/http/errors.js";

// JWT-authenticated (human) sessions carry the wildcard scope — full
// access to their own resources. Only API keys carry a real, narrowed
// scope list (see moduleRouter.ts's requireScopes()).
const JWT_SESSION_SCOPE = "*";

interface AccessTokenClaims {
  sub: string;
  scopes: string[];
}

function signAccessToken(userId: string): { token: string; expiresIn: number } {
  const payload: AccessTokenClaims = { sub: userId, scopes: [JWT_SESSION_SCOPE] };
  const token = jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.JWT_ACCESS_TTL as jwt.SignOptions["expiresIn"],
  });
  const decoded = jwt.decode(token) as { exp?: number; iat?: number } | null;
  const expiresIn = decoded?.exp && decoded.iat ? decoded.exp - decoded.iat : 900;
  return { token, expiresIn };
}

export function createAuthService(deps: { repo: AuthRepository; eventBus: EventBus }) {
  const { repo, eventBus } = deps;

  async function issueTokenPair(userId: string, familyId: string = randomUUID()) {
    const { token: accessToken, expiresIn } = signAccessToken(userId);
    const refreshTokenRaw = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await repo.createRefreshToken({ userId, tokenHash: sha256(refreshTokenRaw), familyId, expiresAt });
    return { accessToken, refreshToken: refreshTokenRaw, expiresIn };
  }

  async function register(email: string, password: string) {
    const existing = await repo.findUserByEmail(email);
    if (existing) throw conflict("An account with this email already exists");

    const passwordHash = await hashPassword(password);
    const user = await repo.createUser(email, passwordHash);
    const tokens = await issueTokenPair(user.id);
    eventBus.emit("auth.user.registered", { userId: user.id, email: user.email });
    return { user, tokens };
  }

  async function login(email: string, password: string) {
    const user = await repo.findUserByEmail(email);
    if (!user) throw unauthorized("Invalid email or password");
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) throw unauthorized("Invalid email or password");
    const tokens = await issueTokenPair(user.id);
    return { user, tokens };
  }

  async function refresh(rawRefreshToken: string) {
    const tokenHash = sha256(rawRefreshToken);
    const record = await repo.findRefreshTokenByHash(tokenHash);
    if (!record) throw unauthorized("Invalid refresh token");

    if (record.revokedAt) {
      // Reuse of an already-rotated token — likely theft. Kill the whole
      // family so a stolen token can't be replayed even once more.
      await repo.revokeRefreshTokenFamily(record.familyId);
      throw unauthorized("Refresh token has already been used; all sessions in this family were revoked");
    }
    if (record.expiresAt < new Date()) throw unauthorized("Refresh token has expired");

    await repo.revokeRefreshToken(record.id);
    const tokens = await issueTokenPair(record.userId, record.familyId);
    return { userId: record.userId, tokens };
  }

  async function logout(rawRefreshToken: string) {
    const tokenHash = sha256(rawRefreshToken);
    const record = await repo.findRefreshTokenByHash(tokenHash);
    if (record && !record.revokedAt) {
      await repo.revokeRefreshToken(record.id);
    }
  }

  async function createApiKey(userId: string, opts: { name: string; scopes: string[]; rateLimit: number }) {
    const rawKey = `qra_${generateOpaqueToken()}`;
    const apiKey = await repo.createApiKey({
      userId,
      name: opts.name,
      keyHash: sha256(rawKey),
      scopes: opts.scopes,
      rateLimit: opts.rateLimit,
    });
    eventBus.emit("auth.apikey.created", { apiKeyId: apiKey.id, userId });
    return { apiKey, rawKey };
  }

  async function listApiKeys(userId: string) {
    return repo.listApiKeysByUser(userId);
  }

  async function revokeApiKey(userId: string, id: string) {
    const result = await repo.revokeApiKey(id, userId);
    if (result.count === 0) throw notFound("API key not found");
    eventBus.emit("auth.apikey.revoked", { apiKeyId: id, userId });
  }

  const verifier: CredentialVerifier = {
    async verifyBearer(token): Promise<AuthPrincipal | null> {
      try {
        const decoded = jwt.verify(token, config.JWT_ACCESS_SECRET) as AccessTokenClaims;
        return { id: decoded.sub, scopes: decoded.scopes, authType: "jwt" };
      } catch {
        return null;
      }
    },
    async verifyApiKey(rawKey): Promise<AuthPrincipal | null> {
      const apiKey = await repo.findApiKeyByHash(sha256(rawKey));
      if (!apiKey || apiKey.revokedAt) return null;
      return {
        id: apiKey.userId,
        scopes: apiKey.scopes,
        authType: "apikey",
        apiKeyId: apiKey.id,
        rateLimit: apiKey.rateLimit,
      };
    },
  };

  return { register, login, refresh, logout, createApiKey, listApiKeys, revokeApiKey, verifier };
}

export type AuthService = ReturnType<typeof createAuthService>;
