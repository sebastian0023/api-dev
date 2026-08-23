import { SCREENS, type ScreenId } from "./screens.js";
import { MenuIcon } from "../components/Icons.js";

export interface TopbarProps {
  active: ScreenId;
  email: string | null;
  onLogout: () => void;
  onToggleSidebar: () => void;
}

function initialsFor(email: string | null): string {
  if (!email) return "?";
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]/).filter(Boolean);
  const chars = parts.length > 1 ? [parts[0]?.[0], parts[1]?.[0]] : [local[0], local[1]];
  return chars.filter(Boolean).join("").toUpperCase() || "?";
}

export function Topbar({ active, email, onLogout, onToggleSidebar }: TopbarProps) {
  const screen = SCREENS.find((s) => s.id === active)!;

  return (
    <header className="topbar">
      <div className="mobile-topbar">
        <button type="button" className="topbar-icon-button" onClick={onToggleSidebar} aria-label="Toggle menu">
          <MenuIcon />
        </button>
        <span className="sidebar-brand-name">{screen.label}</span>
      </div>

      <div className="topbar-breadcrumb">
        <span>Tools</span>
        <span className="topbar-breadcrumb-sep">/</span>
        <span className="topbar-breadcrumb-current">{screen.label}</span>
      </div>

      <div className="topbar-actions">
        {email && <span className="topbar-chip">{email}</span>}
        <button type="button" className="topbar-icon-button" onClick={onLogout} title="Log out" aria-label="Log out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </button>
        <div className="topbar-avatar">{initialsFor(email)}</div>
      </div>
    </header>
  );
}
