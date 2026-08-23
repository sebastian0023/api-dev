import { useState, type FormEvent } from "react";
import { api } from "../../api/client.js";

type Tool = "uuid" | "hash" | "base64" | "jwt";
type UuidVersion = "v4" | "v7";
type HashAlgorithm = "sha256" | "sha384" | "sha512";
type HashEncoding = "hex" | "base64";
type Base64Direction = "encode" | "decode";

interface HashResult {
  algorithm: string;
  encoding: string;
  hash: string;
}

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  metadata: { issuedAt: string | null; expiresAt: string | null; expired: boolean | null };
}

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: "uuid", label: "UUID" },
  { id: "hash", label: "Hash" },
  { id: "base64", label: "Base64" },
  { id: "jwt", label: "JWT" },
];

const UNREACHABLE = "Could not reach the API. Is it running on :3000?";

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "error" in err) {
    const inner = (err as { error?: { message?: string } }).error;
    if (inner?.message) return inner.message;
  }
  return "Something went wrong. Please try again.";
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "—";
}

export function DevToolsPanel() {
  const [tool, setTool] = useState<Tool>("uuid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [uuidVersion, setUuidVersion] = useState<UuidVersion>("v4");
  const [uuidCount, setUuidCount] = useState("5");
  const [uuids, setUuids] = useState<string[]>([]);
  const [copyLabel, setCopyLabel] = useState("Copy all");

  const [hashValue, setHashValue] = useState("hello world");
  const [hashAlgorithm, setHashAlgorithm] = useState<HashAlgorithm>("sha256");
  const [hashEncoding, setHashEncoding] = useState<HashEncoding>("hex");
  const [hashResult, setHashResult] = useState<HashResult | null>(null);

  const [base64Direction, setBase64Direction] = useState<Base64Direction>("encode");
  const [base64Value, setBase64Value] = useState("");
  const [base64Result, setBase64Result] = useState<string | null>(null);

  const [jwtToken, setJwtToken] = useState("");
  const [jwt, setJwt] = useState<DecodedJwt | null>(null);

  function selectTool(next: Tool) {
    setTool(next);
    setError(null);
  }

  async function handleGenerateUuids(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.POST("/api/v1/dev-tools/uuid", {
        body: { version: uuidVersion, count: Number(uuidCount) },
      });
      if (res.error || !res.data) {
        setError(errorMessage(res.error));
        return;
      }
      setUuids(res.data.data.values);
      setCopyLabel("Copy all");
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  async function copyUuids() {
    if (uuids.length === 0) return;
    try {
      await navigator.clipboard.writeText(uuids.join("\n"));
      setCopyLabel("Copied!");
    } catch {
      setError("Could not copy the values. Please copy them manually.");
    }
  }

  async function handleHash(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.POST("/api/v1/dev-tools/hash", {
        body: { value: hashValue, algorithm: hashAlgorithm, encoding: hashEncoding },
      });
      if (res.error || !res.data) {
        setError(errorMessage(res.error));
        return;
      }
      setHashResult(res.data.data);
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  async function handleBase64(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = { value: base64Value };
      const res =
        base64Direction === "encode"
          ? await api.POST("/api/v1/dev-tools/base64/encode", { body })
          : await api.POST("/api/v1/dev-tools/base64/decode", { body });
      if (res.error || !res.data) {
        setError(errorMessage(res.error));
        return;
      }
      setBase64Result(res.data.data.value);
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  async function handleDecodeJwt(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api.POST("/api/v1/dev-tools/jwt/decode", { body: { token: jwtToken.trim() } });
      if (res.error || !res.data) {
        setError(errorMessage(res.error));
        return;
      }
      setJwt(res.data.data);
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card devtools-card">
      <div className="card-header">
        <div>
          <h2>Developer tools</h2>
          <p className="card-description">Stateless UUID, hashing, Base64, and JWT utilities.</p>
        </div>
      </div>

      <div className="tabs" aria-label="Developer tool">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={tool === entry.id ? "tab tab-active" : "tab"}
            onClick={() => selectTool(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tool === "uuid" && (
        <>
          <form onSubmit={handleGenerateUuids} className="form">
            <div className="form-row">
              <label>
                Version
                <select value={uuidVersion} onChange={(event) => setUuidVersion(event.target.value as UuidVersion)}>
                  <option value="v4">v4 (random)</option>
                  <option value="v7">v7 (time-ordered)</option>
                </select>
              </label>
              <label>
                How many
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={uuidCount}
                  onChange={(event) => setUuidCount(event.target.value)}
                />
              </label>
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Generating…" : "Generate"}
            </button>
          </form>

          {uuids.length > 0 && (
            <div className="devtools-result">
              <ul className="devtools-list">
                {uuids.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
              <div className="result-actions">
                <button type="button" className="secondary-button" onClick={copyUuids}>
                  {copyLabel}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {tool === "hash" && (
        <>
          <form onSubmit={handleHash} className="form">
            <label>
              Text to hash
              <textarea
                value={hashValue}
                onChange={(event) => setHashValue(event.target.value)}
                required
                rows={5}
                spellCheck={false}
              />
            </label>
            <div className="form-row">
              <label>
                Algorithm
                <select
                  value={hashAlgorithm}
                  onChange={(event) => setHashAlgorithm(event.target.value as HashAlgorithm)}
                >
                  <option value="sha256">SHA-256</option>
                  <option value="sha384">SHA-384</option>
                  <option value="sha512">SHA-512</option>
                </select>
              </label>
              <label>
                Output encoding
                <select value={hashEncoding} onChange={(event) => setHashEncoding(event.target.value as HashEncoding)}>
                  <option value="hex">Hex</option>
                  <option value="base64">Base64</option>
                </select>
              </label>
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Hashing…" : "Hash"}
            </button>
          </form>

          {hashResult && (
            <div className="devtools-result">
              <pre className="devtools-output">{hashResult.hash}</pre>
              <dl className="meta">
                <dt>Algorithm</dt>
                <dd>{hashResult.algorithm}</dd>
                <dt>Encoding</dt>
                <dd>{hashResult.encoding}</dd>
              </dl>
            </div>
          )}
        </>
      )}

      {tool === "base64" && (
        <>
          <form onSubmit={handleBase64} className="form">
            <label>
              {base64Direction === "encode" ? "UTF-8 text" : "Base64 value"}
              <textarea
                value={base64Value}
                onChange={(event) => setBase64Value(event.target.value)}
                required
                rows={5}
                spellCheck={false}
                placeholder={base64Direction === "encode" ? "hello world" : "aGVsbG8gd29ybGQ="}
              />
            </label>
            <div className="form-row">
              <label>
                Direction
                <select
                  value={base64Direction}
                  onChange={(event) => {
                    setBase64Direction(event.target.value as Base64Direction);
                    setBase64Result(null);
                    setError(null);
                  }}
                >
                  <option value="encode">Encode</option>
                  <option value="decode">Decode</option>
                </select>
              </label>
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Working…" : base64Direction === "encode" ? "Encode" : "Decode"}
            </button>
          </form>

          {base64Result !== null && (
            <div className="devtools-result">
              <pre className="devtools-output">{base64Result}</pre>
            </div>
          )}
        </>
      )}

      {tool === "jwt" && (
        <>
          <p className="devtools-warning">
            Decoding only — the signature, issuer, and audience are <strong>not</strong> verified. Never trust a decoded
            token as proof of authenticity.
          </p>
          <form onSubmit={handleDecodeJwt} className="form">
            <label>
              Compact JWT
              <textarea
                value={jwtToken}
                onChange={(event) => setJwtToken(event.target.value)}
                required
                rows={5}
                spellCheck={false}
                placeholder="header.payload.signature"
              />
            </label>
            {error && <p className="error">{error}</p>}
            <button type="submit" disabled={busy}>
              {busy ? "Decoding…" : "Decode"}
            </button>
          </form>

          {jwt && (
            <div className="devtools-result">
              <h3 className="devtools-subheading">Header</h3>
              <pre className="devtools-output">{JSON.stringify(jwt.header, null, 2)}</pre>
              <h3 className="devtools-subheading">Payload</h3>
              <pre className="devtools-output">{JSON.stringify(jwt.payload, null, 2)}</pre>
              <dl className="meta">
                <dt>Issued at</dt>
                <dd>{formatTimestamp(jwt.metadata.issuedAt)}</dd>
                <dt>Expires at</dt>
                <dd>{formatTimestamp(jwt.metadata.expiresAt)}</dd>
                <dt>Expired</dt>
                <dd>{jwt.metadata.expired === null ? "Unknown (no exp claim)" : jwt.metadata.expired ? "Yes" : "No"}</dd>
              </dl>
            </div>
          )}
        </>
      )}
    </section>
  );
}
