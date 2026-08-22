import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";
import { config } from "../../src/core/config.js";
import { createPdfService, normalizePdfOptions } from "../../src/modules/pdf/application/pdf.service.js";
import { PdfBlockedDestinationError, PdfRenderError, PdfTooLargeError } from "../../src/modules/pdf/domain/pdf.errors.js";
import type { PdfRenderer } from "../../src/modules/pdf/domain/pdfRenderer.js";
import { DestinationPolicy } from "../../src/modules/pdf/infrastructure/destinationPolicy.js";

const logger = { info() {}, warn() {}, error() {} };
const publicPolicy = new DestinationPolicy(async () => [{ address: "8.8.8.8", family: 4 }]);

function service(renderer: PdfRenderer) {
  return createPdfService({ renderer, destinationPolicy: publicPolicy, logger });
}

test("normalizes renderer-neutral PDF defaults and valid margin overrides", () => {
  assert.deepEqual(normalizePdfOptions(undefined), {
    format: config.PDF_DEFAULT_FORMAT,
    landscape: false,
    printBackground: true,
    margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
  });
  assert.deepEqual(normalizePdfOptions({ format: "Legal", landscape: true, margin: { top: "12mm" } }), {
    format: "Legal",
    landscape: true,
    printBackground: true,
    margin: { top: "12mm", right: "0mm", bottom: "0mm", left: "0mm" },
  });
});

test("delegates HTML and URL rendering with normalized values and preserves PDF bytes", async () => {
  const calls: unknown[] = [];
  const pdf = Buffer.from("%PDF-test");
  const renderer: PdfRenderer = {
    async renderHtml(input) {
      calls.push(input);
      return pdf;
    },
    async renderUrl(input) {
      calls.push(input);
      return pdf;
    },
  };
  const pdfService = service(renderer);
  assert.strictEqual(await pdfService.renderHtml({ html: "<h1>Hello</h1>" }), pdf);
  assert.strictEqual(await pdfService.renderUrl({ url: "https://example.test/report" }), pdf);
  assert.equal(calls.length, 2);
  assert.equal((calls[1] as { url: string }).url, "https://example.test/report");
});

test("rejects oversized HTML, blocked URLs, and unexpected renderer failures", async () => {
  const renderer: PdfRenderer = {
    async renderHtml() {
      throw new Error("chromium exploded");
    },
    async renderUrl() {
      throw new Error("chromium exploded");
    },
  };
  const pdfService = service(renderer);
  await assert.rejects(() => pdfService.renderHtml({ html: "x".repeat(config.PDF_HTML_MAX_BYTES + 1) }), PdfTooLargeError);

  const blocked = createPdfService({
    renderer,
    destinationPolicy: new DestinationPolicy(async () => [{ address: "127.0.0.1", family: 4 }]),
    logger,
  });
  await assert.rejects(() => blocked.renderUrl({ url: "https://public-name.test" }), PdfBlockedDestinationError);
  await assert.rejects(() => pdfService.renderHtml({ html: "<p>ok</p>" }), PdfRenderError);
});
