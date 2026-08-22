import { useState, type FormEvent } from "react";

type Mode = "login" | "register";

export interface LoginFormProps {
  onLogin: (email: string, password: string) => Promise<boolean>;
  onRegister: (email: string, password: string) => Promise<boolean>;
  busy: boolean;
  error: string | null;
}

// Purely presentational — takes login/register as props rather than
// calling useAuth() itself, so it can be swapped for a different UI
// without touching the auth logic (or vice versa).
export function LoginForm({ onLogin, onRegister, busy, error }: LoginFormProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (mode === "login") await onLogin(email, password);
    else await onRegister(email, password);
  }

  return (
    <div className="card">
      <div className="tabs">
        <button
          type="button"
          className={mode === "login" ? "tab tab-active" : "tab"}
          onClick={() => setMode("login")}
        >
          Log in
        </button>
        <button
          type="button"
          className={mode === "register" ? "tab tab-active" : "tab"}
          onClick={() => setMode("register")}
        >
          Register
        </button>
      </div>
      <form onSubmit={handleSubmit} className="form">
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
