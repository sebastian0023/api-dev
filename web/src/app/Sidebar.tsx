import { SCREENS, type ScreenId } from "./screens.js";
import { screenHref } from "./useNav.js";
import { LogoIcon } from "../components/Icons.js";

export interface SidebarProps {
  active: ScreenId;
  onNavigate: (id: ScreenId) => void;
}

function NavLink({ id, active, onNavigate }: { id: ScreenId; active: ScreenId; onNavigate: (id: ScreenId) => void }) {
  const screen = SCREENS.find((s) => s.id === id)!;
  const Icon = screen.icon;
  const isActive = id === active;
  return (
    <a
      href={screenHref(id)}
      className={isActive ? "sidebar-link sidebar-link-active" : "sidebar-link"}
      onClick={(e) => {
        e.preventDefault();
        onNavigate(id);
      }}
    >
      <Icon />
      {screen.label}
    </a>
  );
}

export function Sidebar({ active, onNavigate }: SidebarProps) {
  const toolScreens = SCREENS.filter((s) => s.group === "tools");
  const footerScreens = SCREENS.filter((s) => s.group === "footer");

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">
          <LogoIcon />
        </div>
        <span className="sidebar-brand-name">API Dev Platform</span>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-nav-label">Tools</div>
        {toolScreens.map((screen) => (
          <NavLink key={screen.id} id={screen.id} active={active} onNavigate={onNavigate} />
        ))}
      </nav>

      <div className="sidebar-footer">
        {footerScreens.map((screen) => (
          <NavLink key={screen.id} id={screen.id} active={active} onNavigate={onNavigate} />
        ))}
        <a href="/docs" target="_blank" rel="noreferrer" className="sidebar-link">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h10" />
          </svg>
          Docs
        </a>
      </div>
    </aside>
  );
}
