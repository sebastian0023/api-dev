import { useEffect, useState, type FormEvent } from "react";
import { authorizedFetch } from "../../api/client.js";
import { Card } from "../../components/Card.js";
import { SegmentedControl } from "../../components/SegmentedControl.js";

type Source = "html" | "url";
type PdfFormat = "A4" | "Letter" | "Legal";

const DEFAULT_HTML = `<!doctype html>
<html>
  <body>
    <h1>Hello from API Dev Platform</h1>
    <p>This document was generated in the browser.</p>
  </body>
</html>`;

interface ApiErrorBody {
  error?: { message?: string };
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.error?.message) return body.error.message;
  } catch {
    // A proxy or network failure may not have a JSON response.
  }
  return `PDF generation failed (${response.status}).`;
}

export function PdfConverter() {
  const [source, setSource] = useState<Source>("html");
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [url, setUrl] = useState("https://example.com");
  const [format, setFormat] = useState<PdfFormat>("A4");
  const [landscape, setLandscape] = useState(false);
  const [printBackground, setPrintBackground] = useState(true);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const body = {
        ...(source === "html" ? { html } : { url }),
        options: { format, landscape, printBackground },
      };
      const response = await authorizedFetch(`/api/v1/pdf/${source}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(await responseError(response));
        return;
      }

      const pdf = await response.blob();
      if (pdf.size === 0) {
        setError("The API returned an empty PDF.");
        return;
      }
      setPdfUrl(URL.createObjectURL(pdf));
    } catch {
      setError("Could not reach the API. Is it running on :3000?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SegmentedControl
        aria-label="PDF source type"
        value={source}
        onChange={setSource}
        options={[
          { value: "html", label: "HTML" },
          { value: "url", label: "URL" },
        ]}
      />
      <form onSubmit={handleSubmit} className="form">
        {source === "html" ? (
          <label>
            HTML document
            <textarea value={html} onChange={(event) => setHtml(event.target.value)} required rows={10} spellCheck={false} />
          </label>
        ) : (
          <label>
            Public URL
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" required />
          </label>
        )}
        <div className="form-row pdf-options">
          <label>
            Page size
            <select value={format} onChange={(event) => setFormat(event.target.value as PdfFormat)}>
              <option value="A4">A4</option>
              <option value="Letter">Letter</option>
              <option value="Legal">Legal</option>
            </select>
          </label>
          <label className="check-label">
            <input type="checkbox" checked={landscape} onChange={(event) => setLandscape(event.target.checked)} />
            Landscape
          </label>
          <label className="check-label">
            <input type="checkbox" checked={printBackground} onChange={(event) => setPrintBackground(event.target.checked)} />
            Print backgrounds
          </label>
        </div>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "Rendering PDF…" : "Generate PDF"}
        </button>
      </form>

      {pdfUrl && (
        <div className="pdf-result">
          <div className="result-actions">
            <a className="secondary-button" href={pdfUrl} target="_blank" rel="noreferrer">
              Open preview
            </a>
            <a className="secondary-button" href={pdfUrl} download="document.pdf">
              Download PDF
            </a>
          </div>
          <iframe className="pdf-preview" src={pdfUrl} title="Generated PDF preview" />
        </div>
      )}
    </Card>
  );
}
