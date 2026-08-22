import type { NextFunction, Request, Response } from "express";
import { ZodError, z } from "zod";
import { ApiError } from "../../shared/http/errors.js";
import { Prisma } from "../../generated/prisma/client.js";

// Express identifies error-handling middleware by arity (fn.length === 4),
// so `next` must stay a declared parameter even though it's unused here —
// this is always the terminal handler.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = res.locals.requestId as string | undefined;

  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      data: null,
      error: { code: err.code, message: err.message, details: err.details },
      meta: { requestId },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({
      data: null,
      error: {
        code: "UNPROCESSABLE_ENTITY",
        message: "Validation failed",
        details: z.treeifyError(err),
      },
      meta: { requestId },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      res.status(409).json({
        data: null,
        error: {
          code: "CONFLICT",
          message: "Resource already exists",
          details: { fields: err.meta?.target },
        },
        meta: { requestId },
      });
      return;
    }
    if (err.code === "P2025") {
      res.status(404).json({
        data: null,
        error: { code: "NOT_FOUND", message: "Resource not found" },
        meta: { requestId },
      });
      return;
    }
  }

  console.error(`[unhandled error] ${req.method} ${req.originalUrl}:`, err);
  res.status(500).json({
    data: null,
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    meta: { requestId },
  });
}
