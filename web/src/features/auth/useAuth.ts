import { useCallback, useState } from "react";
import { api, getAccessToken, setTokens } from "../../api/client.js";

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "error" in err) {
    const inner = (err as { error?: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  return "Something went wrong. Please try again.";
}

export interface UseAuthResult {
  isAuthenticated: boolean;
  busy: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

// Structural, not the exact openapi-fetch response type: login and register
// return the same envelope shape, but calling api.POST with a *union* of
// the two literal paths (instead of each literal directly) collapses its
// inferred response type to `never` — a known openapi-fetch rough edge.
// Keeping this loose lets both call sites below share one result handler.
interface AuthApiResponse {
  data?: { data: { tokens: { accessToken: string; refreshToken: string; expiresIn: number } } };
  error?: unknown;
}

// All auth state/logic in one hook, called once at the top of the app.
// UI components (LoginForm) just receive the pieces they need as props —
// see index.ts for the module's full exported surface.
export function useAuth(): UseAuthResult {
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getAccessToken()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuthResponse = useCallback(async (resultPromise: Promise<AuthApiResponse>) => {
    setError(null);
    setBusy(true);
    try {
      const res = await resultPromise;
      if (res.error || !res.data) {
        setError(errorMessage(res.error));
        return false;
      }
      setTokens(res.data.data.tokens);
      setIsAuthenticated(true);
      return true;
    } catch {
      setError("Could not reach the API. Is it running?");
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const login = useCallback(
    (email: string, password: string) =>
      handleAuthResponse(api.POST("/api/v1/auth/login", { body: { email, password } })),
    [handleAuthResponse],
  );

  const register = useCallback(
    (email: string, password: string) =>
      handleAuthResponse(api.POST("/api/v1/auth/register", { body: { email, password } })),
    [handleAuthResponse],
  );

  const logout = useCallback(() => {
    setTokens(null);
    setIsAuthenticated(false);
  }, []);

  return { isAuthenticated, busy, error, login, register, logout };
}
