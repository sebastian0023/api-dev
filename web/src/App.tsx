import { useState, type FormEvent } from "react";
import { api } from "./api/client.js";
import { useAuth, LoginForm } from "./features/auth/index.js";
import { PdfConverter } from "./features/pdf/PdfConverter.js";
import { DevToolsPanel } from "./features/dev-tools/index.js";

interface QrResult {
  id: string;
  format: "png" | "svg";
  scanCount: number;
  image: string;
}

interface ShortUrlResult {
  id: string;
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  clickCount: number;
  active: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
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
  const [longUrl, setLongUrl] = useState("https://example.com/a/long/path");
  const [expiresAt, setExpiresAt] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlBusy, setUrlBusy] = useState(false);
  const [shortUrlResult, setShortUrlResult] = useState<ShortUrlResult | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");

  function handleLogout() {
    logout();
    setResult(null);
    setShortUrlResult(null);
  }

  async function handleCreateShortUrl(e: FormEvent) {
    e.preventDefault();
    setUrlError(null);
    setUrlBusy(true);
    try {
      const res = await api.POST("/api/v1/urls", {
        body: {
          url: longUrl,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        },
      });
      if (res.error || !res.data) {
        setUrlError(errorMessage(res.error));
        return;
      }
      setShortUrlResult(res.data.data);
      setLookupCode(res.data.data.shortCode);
      setCopyLabel("Copy");
    } catch {
      setUrlError("Could not reach the API. Is it running on :3000?");
    } finally {
      setUrlBusy(false);
    }
  }

  async function handleLookupShortUrl(e: FormEvent) {
    e.preventDefault();
    const shortCode = lookupCode.trim();
    if (!shortCode) return;
    setUrlError(null);
    setLookupBusy(true);
    try {
      const res = await api.GET("/api/v1/urls/{shortCode}", { params: { path: { shortCode } } });
      if (res.error || !res.data) {
        setUrlError(errorMessage(res.error));
        return;
      }
      setShortUrlResult(res.data.data);
      setCopyLabel("Copy");
    } catch {
      setUrlError("Could not reach the API. Is it running on :3000?");
    } finally {
      setLookupBusy(false);
    }
  }

  async function handleDeleteShortUrl() {
    if (!shortUrlResult || !window.confirm(`Delete ${shortUrlResult.shortCode}?`)) return;
    setUrlError(null);
    setUrlBusy(true);
    try {
      const res = await api.DELETE("/api/v1/urls/{shortCode}", {
        params: { path: { shortCode: shortUrlResult.shortCode } },
      });
      if (res.error || !res.response.ok) {
        setUrlError(errorMessage(res.error));
        return;
      }
      setShortUrlResult(null);
      setLookupCode("");
    } catch {
      setUrlError("Could not reach the API. Is it running on :3000?");
    } finally {
      setUrlBusy(false);
    }
  }

  async function copyShortUrl() {
    if (!shortUrlResult) return;
    try {
      await navigator.clipboard.writeText(shortUrlResult.shortUrl);
      setCopyLabel("Copied!");
    } catch {
      setUrlError("Could not copy the short URL. Please copy it manually.");
    }
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
        <p className="subtitle">Modular monolith demo — auth + qr + url + pdf + dev-tools</p>
      </header>

      {!isAuthenticated ? (
        <LoginForm onLogin={login} onRegister={register} busy={authBusy} error={authError} />
      ) : (
        <div className="dashboard">
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

          <div className="card">
            <div className="card-header">
              <h2>Shorten a URL</h2>
              <button type="button" className="link-button" onClick={handleLogout}>
                Log out
              </button>
            </div>
            <form onSubmit={handleCreateShortUrl} className="form">
              <label>
                Destination URL
                <input
                  type="url"
                  required
                  value={longUrl}
                  onChange={(e) => setLongUrl(e.target.value)}
                  placeholder="https://example.com/a/long/path"
                />
              </label>
              <label>
                Expiration <span className="optional">(optional)</span>
                <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </label>
              {urlError && <p className="error">{urlError}</p>}
              <button type="submit" disabled={urlBusy}>
                {urlBusy ? "Shortening…" : "Create short URL"}
              </button>
            </form>

            <form onSubmit={handleLookupShortUrl} className="lookup-form">
              <label>
                Manage an existing code
                <div className="inline-form">
                  <input
                    type="text"
                    value={lookupCode}
                    onChange={(e) => setLookupCode(e.target.value)}
                    placeholder="a8Df92Q"
                    pattern="[0-9A-Za-z]+"
                  />
                  <button type="submit" className="secondary-button" disabled={lookupBusy}>
                    {lookupBusy ? "Loading…" : "Load"}
                  </button>
                </div>
              </label>
            </form>

            {shortUrlResult && (
              <div className="short-url-result">
                <p className="short-url-value">{shortUrlResult.shortUrl}</p>
                <div className="result-actions">
                  <button type="button" className="secondary-button" onClick={copyShortUrl}>
                    {copyLabel}
                  </button>
                  <a className="secondary-button" href={shortUrlResult.shortUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                  <button type="button" className="danger-button" onClick={handleDeleteShortUrl} disabled={urlBusy}>
                    Delete
                  </button>
                </div>
                <dl className="meta">
                  <dt>Code</dt>
                  <dd>{shortUrlResult.shortCode}</dd>
                  <dt>Clicks</dt>
                  <dd>{shortUrlResult.clickCount}</dd>
                  <dt>Destination</dt>
                  <dd>{shortUrlResult.originalUrl}</dd>
                  <dt>Expires</dt>
                  <dd>{shortUrlResult.expiresAt ? new Date(shortUrlResult.expiresAt).toLocaleString() : "Never"}</dd>
                </dl>
              </div>
            )}
          </div>

          <PdfConverter />

          <DevToolsPanel />
        </div>
      )}
    </div>
  );
}
