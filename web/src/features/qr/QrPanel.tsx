import { useState, type FormEvent } from "react";
import { api } from "../../api/client.js";
import { errorMessage, UNREACHABLE } from "../../api/errors.js";
import { Card } from "../../components/Card.js";
import { SegmentedControl } from "../../components/SegmentedControl.js";
import { Disclosure } from "../../components/Disclosure.js";
import { AlertIcon } from "../../components/Icons.js";

interface QrResult {
  id: string;
  format: "png" | "svg";
  scanCount: number;
  image: string;
}

const ERROR_CORRECTION_OPTIONS = [
  { value: "L" as const, label: "L" },
  { value: "M" as const, label: "M" },
  { value: "Q" as const, label: "Q" },
  { value: "H" as const, label: "H" },
];

export function QrPanel() {
  const [payload, setPayload] = useState("https://example.com");
  const [format, setFormat] = useState<"png" | "svg">("png");
  const [size, setSize] = useState("300");
  const [errorCorrection, setErrorCorrection] = useState<"L" | "M" | "Q" | "H">("M");
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [result, setResult] = useState<QrResult | null>(null);
  const [copyLabel, setCopyLabel] = useState("Copy payload");

  const payloadInvalid = payload.trim().length === 0;

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
      setCopyLabel("Copy payload");
    } catch {
      setQrError(UNREACHABLE);
    } finally {
      setQrBusy(false);
    }
  }

  async function copyPayload() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopyLabel("Copied!");
    } catch {
      setQrError("Could not copy the payload. Please copy it manually.");
    }
  }

  return (
    <Card>
      <form onSubmit={handleGenerateQr} className="form">
        <label>
          Payload
          <input
            type="text"
            required
            aria-invalid={payloadInvalid}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            placeholder="https://example.com or any text"
          />
          {payloadInvalid && (
            <p className="field-error">
              <AlertIcon width={12} height={12} />
              Payload is required.
            </p>
          )}
        </label>

        <div>
          <label style={{ marginBottom: 6, display: "block" }}>Format</label>
          <SegmentedControl
            aria-label="QR format"
            value={format}
            onChange={setFormat}
            options={[
              { value: "png", label: "PNG" },
              { value: "svg", label: "SVG" },
            ]}
          />
        </div>

        {qrError && <p className="error">{qrError}</p>}
        <button type="submit" disabled={qrBusy || payloadInvalid}>
          {qrBusy ? "Generating…" : "Generate"}
        </button>
      </form>

      <Disclosure>
        <div className="form-row">
          <label>
            Size (px)
            <input type="number" min={64} max={2000} value={size} onChange={(e) => setSize(e.target.value)} />
          </label>
          <div>
            <label style={{ marginBottom: 6, display: "block" }}>Error correction</label>
            <SegmentedControl
              aria-label="Error correction level"
              value={errorCorrection}
              onChange={setErrorCorrection}
              options={ERROR_CORRECTION_OPTIONS}
            />
          </div>
        </div>
      </Disclosure>

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
          <div className="result-actions">
            {result.format === "png" && (
              <a className="secondary-button" href={result.image} download={`qr-${result.id}.png`}>
                Download
              </a>
            )}
            <button type="button" className="secondary-button" onClick={() => void copyPayload()}>
              {copyLabel}
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
