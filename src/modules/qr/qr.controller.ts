import type { RequestHandler } from "express";
import type { QrService } from "./qr.service.js";
import type { CreateQrBody, IdParam, ListQrQuery } from "./qr.schemas.js";

interface QrCodeRecordLike {
  id: string;
  payload: string;
  format: string;
  mode: string;
  size: number | null;
  errorCorrection: string | null;
  scanCount: number;
  createdAt: Date;
}

function toSummary(r: QrCodeRecordLike) {
  return {
    id: r.id,
    payload: r.payload,
    format: r.format,
    mode: r.mode,
    size: r.size,
    errorCorrection: r.errorCorrection,
    scanCount: r.scanCount,
    createdAt: r.createdAt.toISOString(),
  };
}

function toResource(r: QrCodeRecordLike, image: string) {
  return { ...toSummary(r), image };
}

export function createQrController(service: QrService) {
  const create: RequestHandler = async (req, res) => {
    const userId = req.user!.id;
    const body = req.validated.body as CreateQrBody;
    const { record, image } = await service.create(userId, body);
    res.ok(toResource(record, image), 201);
  };

  const getById: RequestHandler = async (req, res) => {
    const userId = req.user!.id;
    const params = req.validated.params as IdParam;
    const { record, image } = await service.getForUser(userId, params.id);
    res.ok(toResource(record, image));
  };

  const list: RequestHandler = async (req, res) => {
    const userId = req.user!.id;
    const query = req.validated.query as ListQrQuery;
    const records = await service.listForUser(userId, query.limit);
    res.ok(records.map(toSummary));
  };

  const scan: RequestHandler = async (req, res) => {
    const params = req.validated.params as IdParam;
    const destination = await service.scan(params.id);
    res.redirect(302, destination);
  };

  return { create, getById, list, scan };
}

export type QrController = ReturnType<typeof createQrController>;
