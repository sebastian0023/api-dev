import type { RequestHandler } from "express";
import type { AuthService } from "./auth.service.js";
import type { RegisterBody, LoginBody, RefreshBody, LogoutBody, CreateApiKeyBody, IdParam } from "./auth.schemas.js";

function toUserResource(user: { id: string; email: string; createdAt: Date }) {
  return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
}

function toApiKeyResource(key: {
  id: string;
  name: string;
  scopes: string[];
  rateLimit: number;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    name: key.name,
    scopes: key.scopes,
    rateLimit: key.rateLimit,
    revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
  };
}

export function createAuthController(service: AuthService) {
  const register: RequestHandler = async (req, res) => {
    const body = req.validated.body as RegisterBody;
    const { user, tokens } = await service.register(body.email, body.password);
    res.ok({ user: toUserResource(user), tokens }, 201);
  };

  const login: RequestHandler = async (req, res) => {
    const body = req.validated.body as LoginBody;
    const { user, tokens } = await service.login(body.email, body.password);
    res.ok({ user: toUserResource(user), tokens });
  };

  const refresh: RequestHandler = async (req, res) => {
    const body = req.validated.body as RefreshBody;
    const { tokens } = await service.refresh(body.refreshToken);
    res.ok({ tokens });
  };

  const logout: RequestHandler = async (req, res) => {
    const body = req.validated.body as LogoutBody;
    await service.logout(body.refreshToken);
    res.ok({ success: true });
  };

  const createApiKey: RequestHandler = async (req, res) => {
    // req.user is guaranteed here — this route is registered with auth: true.
    const userId = req.user!.id;
    const body = req.validated.body as CreateApiKeyBody;
    const { apiKey, rawKey } = await service.createApiKey(userId, body);
    res.ok(
      {
        id: apiKey.id,
        name: apiKey.name,
        key: rawKey,
        scopes: apiKey.scopes,
        rateLimit: apiKey.rateLimit,
        createdAt: apiKey.createdAt.toISOString(),
      },
      201,
    );
  };

  const listApiKeys: RequestHandler = async (req, res) => {
    const userId = req.user!.id;
    const keys = await service.listApiKeys(userId);
    res.ok(keys.map(toApiKeyResource));
  };

  const revokeApiKey: RequestHandler = async (req, res) => {
    const userId = req.user!.id;
    const params = req.validated.params as IdParam;
    await service.revokeApiKey(userId, params.id);
    res.ok({ success: true });
  };

  return { register, login, refresh, logout, createApiKey, listApiKeys, revokeApiKey };
}

export type AuthController = ReturnType<typeof createAuthController>;
