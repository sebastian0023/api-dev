import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import type { QrRepository } from "./qr.repository.js";
import type { EventBus } from "../../core/eventBus.js";
import { config } from "../../core/config.js";
import { notFound } from "../../shared/http/errors.js";

type Format = "png" | "svg";
type ErrorCorrection = "L" | "M" | "Q" | "H";

export interface CreateQrInput {
  payload: string;
  format: Format;
  size?: number;
  errorCorrection?: ErrorCorrection;
  mode: "static" | "redirect";
}

interface QrCodeRecord {
  id: string;
  userId: string;
  payload: string;
  format: string;
  mode: string;
  size: number | null;
  errorCorrection: string | null;
  scanCount: number;
  createdAt: Date;
}

async function renderImage(payload: string, format: Format, size?: number, errorCorrection?: ErrorCorrection) {
  const options = { width: size, errorCorrectionLevel: errorCorrection ?? "M" } as const;

  if (format === "svg") {
    return QRCode.toString(payload, { ...options, type: "svg" });
  }

  // Returned inline as a base64 data URL rather than a stored-asset URL:
  // no filesystem/S3 dependency and it drops straight into <img src>, at
  // the cost of ~33% payload inflation over raw binary and no CDN
  // caching. Swap for a StorageAdapter + GET /:id/image if QR volume or
  // bandwidth ever makes that tradeoff worth it.
  return QRCode.toDataURL(payload, options);
}

function redirectTargetFor(id: string): string {
  return `${config.PUBLIC_URL}/api/v1/qr/${id}/scan`;
}

function encodedPayloadFor(record: Pick<QrCodeRecord, "id" | "mode" | "payload">): string {
  return record.mode === "redirect" ? redirectTargetFor(record.id) : record.payload;
}

export function createQrService(deps: { repo: QrRepository; eventBus: EventBus }) {
  const { repo, eventBus } = deps;

  async function create(userId: string, input: CreateQrInput) {
    // Generated up front so a 'redirect' QR can encode a link back to its
    // own /:id/scan endpoint before the row exists.
    const id = randomUUID();
    const image = await renderImage(
      encodedPayloadFor({ id, mode: input.mode, payload: input.payload }),
      input.format,
      input.size,
      input.errorCorrection,
    );

    const record = await repo.create({
      id,
      userId,
      payload: input.payload,
      format: input.format,
      mode: input.mode,
      size: input.size,
      errorCorrection: input.errorCorrection,
    });

    eventBus.emit("qr.code.created", { qrCodeId: record.id, userId });
    return { record, image };
  }

  async function getForUser(userId: string, id: string) {
    const existing = await repo.findByIdForUser(id, userId);
    if (!existing) throw notFound("QR code not found");

    // Per spec: increment scanCount here for redirect-style QRs. Note this
    // means the owner viewing their own metadata also counts as a "scan" —
    // GET /:id/scan is the endpoint that reflects real-world scans.
    const record = existing.mode === "redirect" ? await repo.incrementScanCount(id) : existing;

    const image = await renderImage(
      encodedPayloadFor(record),
      record.format as Format,
      record.size ?? undefined,
      (record.errorCorrection as ErrorCorrection | null) ?? undefined,
    );

    return { record, image };
  }

  async function listForUser(userId: string, limit: number) {
    return repo.listByUser(userId, limit);
  }

  async function scan(id: string): Promise<string> {
    const record = await repo.findById(id);
    if (!record || record.mode !== "redirect") throw notFound("QR code not found");
    await repo.incrementScanCount(id);
    return record.payload;
  }

  return { create, getForUser, listForUser, scan };
}

export type QrService = ReturnType<typeof createQrService>;
