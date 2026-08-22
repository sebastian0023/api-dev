import assert from "node:assert/strict";
import test from "node:test";
import { RenderGate } from "../../src/modules/pdf/infrastructure/browserManager.js";
import { PdfCapacityExceededError, PdfRenderAbortedError } from "../../src/modules/pdf/domain/pdf.errors.js";

test("bounded render gate queues work, enforces capacity, and handles aborts", async () => {
  const gate = new RenderGate(1, 1, 1_000);
  const releaseFirst = await gate.acquire();
  const queued = gate.acquire();
  await assert.rejects(() => gate.acquire(), PdfCapacityExceededError);
  releaseFirst();
  const releaseSecond = await queued;
  releaseSecond();

  const controller = new AbortController();
  const releaseThird = await gate.acquire();
  const aborted = gate.acquire(controller.signal);
  controller.abort();
  await assert.rejects(() => aborted, PdfRenderAbortedError);
  releaseThird();
});
