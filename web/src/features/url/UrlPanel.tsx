import { useState, type FormEvent } from "react";
import { api } from "../../api/client.js";
import { errorMessage, UNREACHABLE } from "../../api/errors.js";
import { Card } from "../../components/Card.js";
import { AlertIcon } from "../../components/Icons.js";

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

export function UrlPanel() {
  const [longUrl, setLongUrl] = useState("https://example.com/a/long/path");
  const [expiresAt, setExpiresAt] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlBusy, setUrlBusy] = useState(false);
  const [shortUrlResult, setShortUrlResult] = useState<ShortUrlResult | null>(null);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [copyLabel, setCopyLabel] = useState("Copy");

  const longUrlInvalid = longUrl.trim().length === 0;

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
      setUrlError(UNREACHABLE);
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
      setUrlError(UNREACHABLE);
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
      setUrlError(UNREACHABLE);
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

  return (
    <Card>
      <form onSubmit={handleCreateShortUrl} className="form">
        <label>
          Destination URL
          <input
            type="url"
            required
            aria-invalid={longUrlInvalid}
            value={longUrl}
            onChange={(e) => setLongUrl(e.target.value)}
            placeholder="https://example.com/a/long/path"
          />
          {longUrlInvalid && (
            <p className="field-error">
              <AlertIcon width={12} height={12} />
              Destination URL is required.
            </p>
          )}
        </label>
        <label>
          Expiration <span className="optional">(optional)</span>
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        {urlError && <p className="error">{urlError}</p>}
        <button type="submit" disabled={urlBusy || longUrlInvalid}>
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
            <button type="button" className="secondary-button" onClick={() => void copyShortUrl()}>
              {copyLabel}
            </button>
            <a className="secondary-button" href={shortUrlResult.shortUrl} target="_blank" rel="noreferrer">
              Open
            </a>
            <button type="button" className="danger-button" onClick={() => void handleDeleteShortUrl()} disabled={urlBusy}>
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
    </Card>
  );
}
