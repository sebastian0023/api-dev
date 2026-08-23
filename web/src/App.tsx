import { useAuth, LoginForm } from "./features/auth/index.js";
import { AppShell } from "./app/AppShell.js";
import type { ScreenId } from "./app/screens.js";
import { QrPanel } from "./features/qr/index.js";
import { UrlPanel } from "./features/url/index.js";
import { PdfConverter } from "./features/pdf/PdfConverter.js";
import { DevToolsPanel } from "./features/dev-tools/index.js";
import { WebhooksPanel } from "./features/webhooks/index.js";
import { ApiKeysPanel } from "./features/api-keys/index.js";

function renderScreen(id: ScreenId) {
  switch (id) {
    case "qr":
      return <QrPanel />;
    case "urls":
      return <UrlPanel />;
    case "pdf":
      return <PdfConverter />;
    case "dev-tools":
      return <DevToolsPanel />;
    case "webhooks":
      return <WebhooksPanel />;
    case "api-keys":
      return <ApiKeysPanel />;
  }
}

export default function App() {
  const { isAuthenticated, email, busy: authBusy, error: authError, login, register, logout } = useAuth();

  if (!isAuthenticated) {
    return <LoginForm onLogin={login} onRegister={register} busy={authBusy} error={authError} />;
  }

  return <AppShell email={email} onLogout={logout} renderScreen={renderScreen} />;
}
