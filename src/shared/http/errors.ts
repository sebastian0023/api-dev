export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Authentication required") =>
  new ApiError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Insufficient scope") => new ApiError(403, "FORBIDDEN", message);

export const notFound = (message = "Resource not found") => new ApiError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown) =>
  new ApiError(409, "CONFLICT", message, details);

export const unprocessable = (message: string, details?: unknown) =>
  new ApiError(422, "UNPROCESSABLE_ENTITY", message, details);

export const tooManyRequests = (message = "Rate limit exceeded") =>
  new ApiError(429, "TOO_MANY_REQUESTS", message);

export const internal = (message = "Internal server error") => new ApiError(500, "INTERNAL_ERROR", message);
