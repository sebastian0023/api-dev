import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "../../api/client.js";
import { errorMessage, UNREACHABLE } from "../../api/errors.js";
import { Card } from "../../components/Card.js";
import { Callout } from "../../components/Callout.js";

interface ApiKey {
  id: string;
  name: string;
  scopes: string[];
  rateLimit: number;
  revokedAt: string | null;
  createdAt: string;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString();
}

export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("default");
  const [scopesInput, setScopesInput] = useState("");
  const [rateLimit, setRateLimit] = useState("100");
  const [newKey, setNewKey] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const res = await api.GET("/api/v1/auth/api-keys");
      if (res.data) setKeys(res.data.data as ApiKey[]);
    } catch {
      setError(UNREACHABLE);
    }
  }, []);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNewKey(null);
    setBusy(true);
    try {
      const scopes = scopesInput
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.POST("/api/v1/auth/api-keys", {
        body: { name: name || "default", scopes, rateLimit: rateLimit ? Number(rateLimit) : undefined },
      });
      if (res.error || !res.data) {
        setError(errorMessage(res.error));
        return;
      }
      setNewKey(res.data.data.key);
      setName("default");
      setScopesInput("");
      await loadKeys();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(key: ApiKey) {
    if (!window.confirm(`Revoke the key "${key.name}"?`)) return;
    setError(null);
    setBusy(true);
    try {
      const res = await api.DELETE("/api/v1/auth/api-keys/{id}", { params: { path: { id: key.id } } });
      if (res.error) {
        setError(errorMessage(res.error));
        return;
      }
      await loadKeys();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleCreate} className="form">
        <div className="form-row">
          <label>
            Name
            <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="default" />
          </label>
          <label>
            Rate limit <span className="optional">(req/min)</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={rateLimit}
              onChange={(event) => setRateLimit(event.target.value)}
            />
          </label>
        </div>
        <label>
          Scopes <span className="optional">(comma-separated, optional)</span>
          <input
            type="text"
            value={scopesInput}
            onChange={(event) => setScopesInput(event.target.value)}
            placeholder="qr:read, qr:write, url:read"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Working…" : "Create API key"}
        </button>
      </form>

      {newKey && (
        <Callout
          title="API key — shown once"
          description="Store it now; this value cannot be retrieved again. Send it as a Bearer token or in the X-API-Key header."
          value={newKey}
          onCopyError={setError}
        />
      )}

      {keys.length > 0 && (
        <div className="section">
          <h3 className="subheading">Your keys</h3>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Scopes</th>
                  <th>Rate limit</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => (
                  <tr key={key.id}>
                    <td>{key.name}</td>
                    <td>
                      <div className="scope-chip-row">
                        {key.scopes.length === 0 ? (
                          <span className="scope-chip">none</span>
                        ) : (
                          key.scopes.map((scope) => (
                            <span key={scope} className="scope-chip">
                              {scope}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td>{key.rateLimit}/min</td>
                    <td>{formatDate(key.createdAt)}</td>
                    <td>{key.revokedAt ? "Revoked" : "Active"}</td>
                    <td>
                      {!key.revokedAt && (
                        <button type="button" className="danger-button" onClick={() => void revoke(key)} disabled={busy}>
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
