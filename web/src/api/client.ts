import createClient, { type Middleware } from "openapi-fetch";
import type { paths } from "./schema.js";

const ACCESS_TOKEN_KEY = "api-dev.accessToken";
const REFRESH_TOKEN_KEY = "api-dev.refreshToken";
const EMAIL_KEY = "api-dev.email";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Email captured from the login/register response — the access token itself carries no email claim. */
export function getEmail(): string | null {
  return localStorage.getItem(EMAIL_KEY);
}

// NOTE: tokens live in localStorage for this demo screen, which is
// readable by any script on the page (XSS-exposed). A production app
// should keep the refresh token in an httpOnly cookie instead; that's
// deliberately out of scope here to keep the demo self-contained without
// cookie/CORS plumbing.
export function setTokens(tokens: { accessToken: string; refreshToken: string } | null): void {
  if (!tokens) {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

/** Full session helper for login/register: stores tokens plus the account email for the topbar chip. */
export function setSession(
  session: { tokens: { accessToken: string; refreshToken: string }; email: string } | null,
): void {
  if (!session) {
    setTokens(null);
    localStorage.removeItem(EMAIL_KEY);
    return;
  }
  setTokens(session.tokens);
  localStorage.setItem(EMAIL_KEY, session.email);
}

/** Authenticated fetch for binary endpoints such as PDF generation. */
export async function authorizedFetch(path: string, init: RequestInit): Promise<Response> {
  const makeRequest = () => {
    const headers = new Headers(init.headers);
    const token = getAccessToken();
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetch(path, { ...init, headers });
  };

  const response = await makeRequest();
  if (response.status !== 401) return response;

  const refreshed = await refreshAccessToken();
  return refreshed ? makeRequest() : response;
}

export const api = createClient<paths>({ baseUrl: "/" });

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch("/api/v1/auth/refresh", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    setTokens(null);
    return false;
  }
  const body = (await res.json()) as { data: { tokens: { accessToken: string; refreshToken: string } } };
  setTokens(body.data.tokens);
  return true;
}

// Injects the bearer token on every request, and transparently retries
// once through /auth/refresh on a 401 before giving up.
const authMiddleware: Middleware = {
  async onRequest({ request }) {
    const token = getAccessToken();
    if (token) request.headers.set("authorization", `Bearer ${token}`);
    return request;
  },
  async onResponse({ request, response }) {
    if (response.status !== 401) return response;

    refreshInFlight ??= refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
    const refreshed = await refreshInFlight;
    if (!refreshed) return response;

    const token = getAccessToken();
    const retryRequest = request.clone();
    retryRequest.headers.set("authorization", `Bearer ${token}`);
    return fetch(retryRequest);
  },
};

api.use(authMiddleware);
