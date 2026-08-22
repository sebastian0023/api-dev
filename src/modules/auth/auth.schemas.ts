import { z } from "zod";

export const RegisterBody = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});
export type RegisterBody = z.infer<typeof RegisterBody>;

export const LoginBody = RegisterBody;
export type LoginBody = z.infer<typeof LoginBody>;

export const RefreshBody = z.object({
  refreshToken: z.string().min(20),
});
export type RefreshBody = z.infer<typeof RefreshBody>;

export const LogoutBody = RefreshBody;
export type LogoutBody = z.infer<typeof LogoutBody>;

export const CreateApiKeyBody = z.object({
  name: z.string().min(1).max(100).default("default"),
  scopes: z.array(z.string()).default([]),
  rateLimit: z.coerce.number().int().positive().max(100_000).default(100),
});
export type CreateApiKeyBody = z.infer<typeof CreateApiKeyBody>;

export const IdParam = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof IdParam>;

export const AuthUserResource = z.object({
  id: z.uuid(),
  email: z.email(),
  createdAt: z.iso.datetime(),
});

export const AuthTokensResource = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().describe("Access token lifetime, in seconds"),
});

export const AuthSessionResource = z.object({
  user: AuthUserResource,
  tokens: AuthTokensResource,
});

export const RefreshResultResource = z.object({
  tokens: AuthTokensResource,
});

export const ApiKeyCreatedResource = z.object({
  id: z.uuid(),
  name: z.string(),
  key: z.string().meta({ description: "Raw API key — shown once, never retrievable again." }),
  scopes: z.array(z.string()),
  rateLimit: z.number().int(),
  createdAt: z.iso.datetime(),
});

export const ApiKeyResource = z.object({
  id: z.uuid(),
  name: z.string(),
  scopes: z.array(z.string()),
  rateLimit: z.number().int(),
  revokedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const ApiKeyListResource = z.array(ApiKeyResource);
