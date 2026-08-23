import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../../api/client.js";
import { errorMessage, UNREACHABLE } from "../../api/errors.js";
import { Card } from "../../components/Card.js";
import { Callout } from "../../components/Callout.js";
import { Disclosure } from "../../components/Disclosure.js";
import { StatusPill, toneForDeliveryStatus } from "../../components/StatusPill.js";
import { CheckIcon } from "../../components/Icons.js";

interface WebhookEventDefinition {
  name: string;
  description: string;
}

interface Endpoint {
  id: string;
  url: string;
  description: string | null;
  events: string[];
  active: boolean;
  createdAt: string;
}

interface Delivery {
  id: string;
  endpointId: string;
  eventType: string;
  status: "pending" | "delivering" | "succeeded" | "failed";
  attemptCount: number;
  lastError: string | null;
  createdAt: string;
}

const PENDING_STATUSES: ReadonlyArray<Delivery["status"]> = ["pending", "delivering"];

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

export function WebhooksPanel() {
  const [catalog, setCatalog] = useState<WebhookEventDefinition[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [url, setUrl] = useState("http://localhost:4000/hook");
  const [description, setDescription] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(["webhook.ping"]);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const loadDeliveries = useCallback(async () => {
    const res = await api.GET("/api/v1/webhooks/deliveries", { params: { query: { limit: 15 } } });
    if (res.data) setDeliveries(res.data.data as Delivery[]);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      const [eventsRes, endpointsRes] = await Promise.all([
        api.GET("/api/v1/webhooks/events"),
        api.GET("/api/v1/webhooks/endpoints"),
      ]);
      if (eventsRes.data) setCatalog(eventsRes.data.data as WebhookEventDefinition[]);
      if (endpointsRes.data) setEndpoints(endpointsRes.data.data as Endpoint[]);
      await loadDeliveries();
    } catch {
      setError(UNREACHABLE);
    }
  }, [loadDeliveries]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // A queued delivery settles a moment later in the background, so the log
  // refreshes itself while anything is still in flight — and stops as soon
  // as everything has settled rather than polling forever.
  const hasPending = deliveries.some((delivery) => PENDING_STATUSES.includes(delivery.status));
  const loadDeliveriesRef = useRef(loadDeliveries);
  loadDeliveriesRef.current = loadDeliveries;
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void loadDeliveriesRef.current(), 1_500);
    return () => clearInterval(timer);
  }, [hasPending]);

  function toggleEvent(name: string) {
    setSelectedEvents((current) =>
      current.includes(name) ? current.filter((event) => event !== name) : [...current, name],
    );
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNewSecret(null);
    setBusy(true);
    try {
      const res = await api.POST("/api/v1/webhooks/endpoints", {
        body: { url, events: selectedEvents, ...(description ? { description } : {}) },
      });
      if (res.error || !res.data) {
        setError(errorMessage(res.error));
        return;
      }
      setNewSecret(res.data.data.secret);
      setDescription("");
      await loadAll();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  async function runEndpointAction(action: () => Promise<{ error?: unknown }>) {
    setError(null);
    setBusy(true);
    try {
      const res = await action();
      if (res.error) {
        setError(errorMessage(res.error));
        return;
      }
      await loadAll();
    } catch {
      setError(UNREACHABLE);
    } finally {
      setBusy(false);
    }
  }

  const sendTest = (id: string) =>
    runEndpointAction(() => api.POST("/api/v1/webhooks/endpoints/{id}/test", { params: { path: { id } } }));

  const togglePaused = (endpoint: Endpoint) =>
    runEndpointAction(() =>
      api.PATCH("/api/v1/webhooks/endpoints/{id}", {
        params: { path: { id: endpoint.id } },
        body: { active: !endpoint.active },
      }),
    );

  const remove = (endpoint: Endpoint) => {
    if (!window.confirm(`Delete the endpoint for ${endpoint.url}?`)) return;
    void runEndpointAction(() =>
      api.DELETE("/api/v1/webhooks/endpoints/{id}", { params: { path: { id: endpoint.id } } }),
    );
  };

  const replay = (id: string) =>
    runEndpointAction(() => api.POST("/api/v1/webhooks/deliveries/{id}/replay", { params: { path: { id } } }));

  return (
    <Card>
      <form onSubmit={handleCreate} className="form">
        <label>
          Endpoint URL
          <input
            type="url"
            required
            aria-invalid={url.trim().length === 0}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://your-service.example/hooks"
          />
        </label>
        <fieldset className="events-fieldset">
          <legend>Events</legend>
          {catalog.map((event) => {
            const checked = selectedEvents.includes(event.name);
            return (
              <label
                key={event.name}
                className={checked ? "event-checkbox event-checkbox-checked" : "event-checkbox"}
                title={event.description}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleEvent(event.name)} />
                <span className="event-checkbox-box">{checked && <CheckIcon width={10} height={10} stroke="#ffffff" />}</span>
                <code>{event.name}</code>
              </label>
            );
          })}
        </fieldset>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy || selectedEvents.length === 0}>
          {busy ? "Working…" : "Register endpoint"}
        </button>
      </form>

      <Disclosure>
        <label>
          Description <span className="optional">(optional)</span>
          <input
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Staging receiver"
          />
        </label>
      </Disclosure>

      {newSecret && (
        <Callout
          title="Signing secret — shown once"
          description={
            <>
              Verify every delivery&apos;s <code>X-Webhook-Signature</code> header against this secret. We can&apos;t show it
              again.
            </>
          }
          value={newSecret}
          onCopyError={setError}
        />
      )}

      {endpoints.length > 0 && (
        <div className="section">
          <h3 className="subheading">Endpoints</h3>
          <ul className="endpoint-list">
            {endpoints.map((endpoint) => (
              <li key={endpoint.id} className="endpoint-row">
                <div className="endpoint-main">
                  <span className={endpoint.active ? "endpoint-status-dot" : "endpoint-status-dot endpoint-status-dot-paused"} />
                  <div>
                    <p className="endpoint-url">{endpoint.url}</p>
                    <div className="endpoint-chips">
                      {endpoint.events.map((event) => (
                        <span key={event} className="endpoint-chip">
                          {event}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="result-actions">
                  <button type="button" className="secondary-button" onClick={() => void sendTest(endpoint.id)} disabled={busy}>
                    Send test event
                  </button>
                  <button type="button" className="secondary-button" onClick={() => void togglePaused(endpoint)} disabled={busy}>
                    {endpoint.active ? "Pause" : "Resume"}
                  </button>
                  <button type="button" className="danger-button" onClick={() => remove(endpoint)} disabled={busy}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(endpoints.length > 0 || deliveries.length > 0) && (
        <div className="section">
          <div className="section-header">
            <h3 className="subheading">Recent deliveries</h3>
            {/* The log auto-refreshes only while something is in flight, so
                events triggered elsewhere (another tab, another card on this
                page) need a nudge rather than an endless poll. */}
            <button type="button" className="link-button" onClick={() => void loadDeliveries()}>
              Refresh
            </button>
          </div>
          {deliveries.length === 0 ? (
            <p className="card-description">No deliveries yet — send a test event.</p>
          ) : (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>When</th>
                    <th style={{ textAlign: "right" }}>Replay</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((delivery) => {
                    const pending = PENDING_STATUSES.includes(delivery.status);
                    return (
                      <tr key={delivery.id}>
                        <td>
                          <code>{delivery.eventType}</code>
                        </td>
                        <td>
                          <StatusPill tone={toneForDeliveryStatus(delivery.status)}>{delivery.status}</StatusPill>
                          {delivery.lastError && <span className="error-note">{delivery.lastError}</span>}
                        </td>
                        <td>{delivery.attemptCount}</td>
                        <td>{formatTime(delivery.createdAt)}</td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void replay(delivery.id)}
                            disabled={busy || pending}
                          >
                            Replay
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
