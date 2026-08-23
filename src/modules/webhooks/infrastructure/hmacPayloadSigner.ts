import { createHmac, timingSafeEqual } from "node:crypto";
import type { PayloadSigner, SignedPayload } from "../../webhooks/domain/payloadSigner.js";

/**
 * Stripe-style scheme: the signature covers `<timestamp>.<body>`, not the
 * body alone, so a receiver can reject a captured payload that is replayed
 * later by checking the timestamp's age. The header carries a versioned
 * scheme (`v1=`) so the algorithm can be rotated without breaking parsers.
 */
export class HmacPayloadSigner implements PayloadSigner {
  sign(input: { body: string; secret: string; timestamp?: number }): SignedPayload {
    const timestamp = input.timestamp ?? Math.floor(Date.now() / 1_000);
    const digest = createHmac("sha256", input.secret).update(`${timestamp}.${input.body}`, "utf8").digest("hex");
    return { timestamp, signature: `t=${timestamp},v1=${digest}` };
  }
}

/**
 * The verification a subscriber performs, kept next to the signer so the
 * two can never drift — the tests assert against this, and the README
 * documents the same three lines for other languages.
 */
export function verifySignature(input: { header: string; body: string; secret: string }): boolean {
  const parts = new Map(
    input.header.split(",").map((piece) => {
      const index = piece.indexOf("=");
      return index === -1 ? ["", piece] : [piece.slice(0, index).trim(), piece.slice(index + 1).trim()];
    }),
  );
  const timestamp = parts.get("t");
  const provided = parts.get("v1");
  if (!timestamp || !provided) return false;

  const expected = createHmac("sha256", input.secret).update(`${timestamp}.${input.body}`, "utf8").digest("hex");
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (providedBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(providedBytes, expectedBytes);
}
