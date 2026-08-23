import { useState, type FormEvent } from "react";
import { SegmentedControl } from "../../components/SegmentedControl.js";
import { LogoIcon } from "../../components/Icons.js";

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
    <div className="auth-page">
      <div className="auth-column">
        <div className="auth-brand">
          <div className="auth-brand-row">
            <div className="sidebar-brand-mark">
              <LogoIcon />
            </div>
            <span className="sidebar-brand-name">API Dev Platform</span>
          </div>
          <p className="auth-subtitle">Sign in to your workspace</p>
        </div>

        <div className="card auth-card">
          <SegmentedControl
            aria-label="Sign in or register"
            value={mode}
            onChange={setMode}
            options={[
              { value: "login", label: "Log in" },
              { value: "register", label: "Register" },
            ]}
          />
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
              <span className="field-hint">At least 8 characters</span>
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
            </button>
          </form>
        </div>
        <p className="auth-footer">
          Trouble signing in? <a href="mailto:support@example.com">Contact support</a>
        </p>
      </div>
    </div>
  );
}
