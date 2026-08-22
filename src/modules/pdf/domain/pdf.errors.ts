import { ApiError } from "../../../shared/http/errors.js";

export class PdfInvalidUrlError extends ApiError {
  constructor(message = "URL must be a valid HTTP or HTTPS URL without embedded credentials") {
    super(400, "PDF_INVALID_URL", message);
  }
}

export class PdfBlockedDestinationError extends ApiError {
  constructor(message = "URL resolves to a blocked destination") {
    super(403, "PDF_BLOCKED_DESTINATION", message);
  }
}

export class PdfTooLargeError extends ApiError {
  constructor(message = "HTML input exceeds the configured size limit") {
    super(413, "PDF_TOO_LARGE", message);
  }
}

export class PdfCapacityExceededError extends ApiError {
  constructor(message = "PDF rendering capacity is temporarily exhausted") {
    super(503, "PDF_CAPACITY_EXCEEDED", message);
  }
}

export class PdfRendererUnavailableError extends ApiError {
  constructor(message = "PDF renderer is temporarily unavailable") {
    super(503, "PDF_RENDERER_UNAVAILABLE", message);
  }
}

export class PdfNavigationTimeoutError extends ApiError {
  constructor(message = "PDF rendering timed out") {
    super(504, "PDF_NAVIGATION_TIMEOUT", message);
  }
}

export class PdfRenderError extends ApiError {
  constructor(message = "PDF rendering failed") {
    super(500, "PDF_RENDER_FAILED", message);
  }
}

export class PdfRenderAbortedError extends Error {
  constructor() {
    super("PDF rendering was cancelled by the client");
    this.name = "PdfRenderAbortedError";
  }
}
