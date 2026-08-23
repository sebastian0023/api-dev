import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { BrowserManager } from "../../src/modules/pdf/infrastructure/browserManager.js";
import { ChromiumPdfRenderer } from "../../src/modules/pdf/infrastructure/chromiumPdfRenderer.js";
import { DestinationPolicy } from "../../src/shared/net/destinationPolicy.js";

const logger = { info() {}, warn() {}, error() {} };
const options = {
  format: "A4" as const,
  landscape: false,
  printBackground: true,
  margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
};

class LocalTestDestinationPolicy extends DestinationPolicy {
  override async assertAllowed(_value: URL | string): Promise<void> {}
}

function createRenderer() {
  const manager = new BrowserManager({ maxConcurrent: 2, maxQueued: 2, queueTimeoutMs: 1_000, renderTimeoutMs: 15_000 });
  return {
    manager,
    renderer: new ChromiumPdfRenderer(manager, new LocalTestDestinationPolicy(), logger, 10_000),
  };
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

test("Chromium renderer produces non-empty PDF bytes from HTML and a deterministic local URL", async () => {
  const { manager, renderer } = createRenderer();
  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    res.end("<html><body><h1>PDF Test</h1></body></html>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  try {
    const htmlPdf = await renderer.renderHtml({ html: "<html><body><h1>HTML Test</h1></body></html>", options });
    const urlPdf = await renderer.renderUrl({ url: `http://127.0.0.1:${address.port}/`, options });
    assert.ok(htmlPdf.subarray(0, 5).equals(Buffer.from("%PDF-")));
    assert.ok(urlPdf.subarray(0, 5).equals(Buffer.from("%PDF-")));
    assert.ok(htmlPdf.length > 100);
    assert.ok(urlPdf.length > 100);
  } finally {
    await manager.close();
    await closeServer(server);
  }
});
