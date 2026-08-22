import type { RequestHandler } from "express";
import type { PdfService } from "./application/pdf.service.js";
import type { RenderHtmlPdfBody, RenderUrlPdfBody } from "./pdf.schemas.js";

function abortWhenClientDisconnects(req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once("aborted", abort);
  res.once("close", abort);
  return {
    signal: controller.signal,
    cleanup: () => {
      req.off("aborted", abort);
      res.off("close", abort);
    },
  };
}

export function createPdfController(service: PdfService) {
  const html: RequestHandler = async (req, res) => {
    const body = req.validated.body as RenderHtmlPdfBody;
    const abort = abortWhenClientDisconnects(req, res);
    try {
      const pdf = await service.renderHtml({ ...body, signal: abort.signal });
      abort.cleanup();
      res.status(200).set("Content-Type", "application/pdf").set("Content-Disposition", 'inline; filename="document.pdf"').send(pdf);
    } finally {
      abort.cleanup();
    }
  };

  const url: RequestHandler = async (req, res) => {
    const body = req.validated.body as RenderUrlPdfBody;
    const abort = abortWhenClientDisconnects(req, res);
    try {
      const pdf = await service.renderUrl({ ...body, signal: abort.signal });
      abort.cleanup();
      res.status(200).set("Content-Type", "application/pdf").set("Content-Disposition", 'inline; filename="document.pdf"').send(pdf);
    } finally {
      abort.cleanup();
    }
  };

  return { html, url };
}

export type PdfController = ReturnType<typeof createPdfController>;
