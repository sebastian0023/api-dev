import { useState, type FormEvent } from "react";
import { api } from "./api/client.js";
import { useAuth, LoginForm } from "./features/auth/index.js";

interface QrResult {
  id: string;
  format: "png" | "svg";
  scanCount: number;
  image: string;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "error" in err) {
    const inner = (err as { error?: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  return "Something went wrong. Please try again.";
}

export default function App() {
  const { isAuthenticated, busy: authBusy, error: authError, login, register, logout } = useAuth();

  const [payload, setPayload] = useState("https://example.com");
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [size, setSize] = useState("300");
  const [errorCorrection, setErrorCorrection] = useState<"L" | "M" | "Q" | "H">("M");
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [result, setResult] = useState<QrResult | null>(null);

  function handleLogout() {
    logout();
    setResult(null);
  }

  async function handleGenerateQr(e: FormEvent) {
    e.preventDefault();
    setQrError(null);
    setQrBusy(true);
    try {
      const res = await api.POST("/api/v1/qr", {
        body: {
          payload,
          format,
          size: size ? Number(size) : undefined,
          errorCorrection,
          mode: "static",
        },
      });
      if (res.error || !res.data) {
        setQrError(errorMessage(res.error));
        return;
      }
      const qr = res.data.data;
      setResult({ id: qr.id, format: qr.format, scanCount: qr.scanCount, image: qr.image });
    } catch {
      setQrError("Could not reach the API. Is it running on :3000?");
    } finally {
      setQrBusy(false);
    }
  }

  return (
    <div className="page">
      <header className="header">
        <h1>API Dev Platform</h1>
        <p className="subtitle">Modular monolith demo — auth + qr</p>
      </header>

      {!isAuthenticated ? (
        <LoginForm onLogin={login} onRegister={register} busy={authBusy} error={authError} />
      ) : (
        <div className="card">
          <div className="card-header">
            <h2>Generate a QR code</h2>
            <button type="button" className="link-button" onClick={handleLogout}>
              Log out
            </button>
          </div>
          <form onSubmit={handleGenerateQr} className="form">
            <label>
              Payload
              <input
                type="text"
                required
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder="https://example.com or any text"
              />
            </label>
            <div className="form-row">
              <label>
                Format
                <select value={format} onChange={(e) => setFormat(e.target.value as "png" | "svg")}>
                  <option value="png">PNG</option>
                  <option value="svg">SVG</option>
                </select>
              </label>
              <label>
                Size (px)
                <input
                  type="number"
                  min={64}
                  max={2000}
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                />
              </label>
              <label>
                Error correction
                <select
                  value={errorCorrection}
                  onChange={(e) => setErrorCorrection(e.target.value as "L" | "M" | "Q" | "H")}
                >
                  <option value="L">L</option>
                  <option value="M">M</option>
                  <option value="Q">Q</option>
                  <option value="H">H</option>
                </select>
              </label>
            </div>
            {qrError && <p className="error">{qrError}</p>}
            <button type="submit" disabled={qrBusy}>
              {qrBusy ? "Generating…" : "Generate"}
            </button>
          </form>

          {result && (
            <div className="result">
              {result.format === "png" ? (
                <img src={result.image} alt={`Generated QR code for ${payload}`} className="qr-image" />
              ) : (
                <div className="qr-image qr-svg" dangerouslySetInnerHTML={{ __html: result.image }} />
              )}
              <dl className="meta">
                <dt>ID</dt>
                <dd>{result.id}</dd>
                <dt>Scans</dt>
                <dd>{result.scanCount}</dd>
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
