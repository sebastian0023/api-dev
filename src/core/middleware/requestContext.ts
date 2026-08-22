import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      requestId: string;
    }
    interface Response {
      /** Sends { data, error: null, meta: { requestId } } — the required response envelope. */
      ok(data: unknown, status?: number): Response;
    }
  }
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header("x-request-id");
  const requestId = inbound && inbound.length > 0 ? inbound : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  res.ok = function ok(data: unknown, status = 200) {
    return this.status(status).json({ data, error: null, meta: { requestId } });
  };

  next();
}
