import { useState, type ReactNode } from "react";
import { SCREENS, getScreen, type ScreenId } from "./screens.js";
import { useNav, screenHref } from "./useNav.js";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";

export interface AppShellProps {
  email: string | null;
  onLogout: () => void;
  renderScreen: (id: ScreenId) => ReactNode;
}

export function AppShell({ email, onLogout, renderScreen }: AppShellProps) {
  const { screen, navigate } = useNav();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const activeScreen = getScreen(screen);

  function handleNavigate(id: ScreenId) {
    navigate(id);
    setSidebarOpen(false);
  }

  return (
    <div className={sidebarOpen ? "app-shell sidebar-open" : "app-shell"}>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setSidebarOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 30, background: "transparent", border: "none", cursor: "default" }}
        />
      )}
      <Sidebar active={screen} onNavigate={handleNavigate} />
      <div className="app-main">
        <Topbar active={screen} email={email} onLogout={onLogout} onToggleSidebar={() => setSidebarOpen((v) => !v)} />
        <nav className="mobile-nav-pills" aria-label="Screens">
          {SCREENS.map((s) => (
            <a
              key={s.id}
              href={screenHref(s.id)}
              className={s.id === screen ? "mobile-nav-pill mobile-nav-pill-active" : "mobile-nav-pill"}
              onClick={(e) => {
                e.preventDefault();
                handleNavigate(s.id);
              }}
            >
              {s.label}
            </a>
          ))}
        </nav>
        <div className="screen">
          <div className="screen-header">
            <h1>{activeScreen.title}</h1>
            <p>{activeScreen.description}</p>
          </div>
          {renderScreen(screen)}
        </div>
      </div>
    </div>
  );
}
