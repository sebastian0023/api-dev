import type { Db } from "../../core/db.js";

// The only file in this module allowed to touch AuthUser / ApiKey /
// RefreshToken via Prisma. No other module may import this file.
export function createAuthRepository(db: Db) {
  return {
    createUser: (email: string, passwordHash: string) => db.authUser.create({ data: { email, passwordHash } }),
    findUserByEmail: (email: string) => db.authUser.findUnique({ where: { email } }),
    findUserById: (id: string) => db.authUser.findUnique({ where: { id } }),

    createRefreshToken: (data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date }) =>
      db.refreshToken.create({ data }),
    findRefreshTokenByHash: (tokenHash: string) => db.refreshToken.findUnique({ where: { tokenHash } }),
    revokeRefreshToken: (id: string) =>
      db.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } }),
    revokeRefreshTokenFamily: (familyId: string) =>
      db.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } }),

    createApiKey: (data: { userId: string; name: string; keyHash: string; scopes: string[]; rateLimit: number }) =>
      db.apiKey.create({ data }),
    findApiKeyByHash: (keyHash: string) => db.apiKey.findUnique({ where: { keyHash } }),
    listApiKeysByUser: (userId: string) => db.apiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    revokeApiKey: (id: string, userId: string) =>
      db.apiKey.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
