import { ApiError } from "../../shared/http/errors.js";

export class InvalidShortUrlError extends ApiError {
  constructor() {
    super(422, "UNPROCESSABLE_ENTITY", "URL must be a valid http or https URL");
    this.name = "InvalidShortUrlError";
  }
}

export class InvalidExpirationError extends ApiError {
  constructor() {
    super(422, "UNPROCESSABLE_ENTITY", "expiresAt must be in the future");
    this.name = "InvalidExpirationError";
  }
}

export class ShortUrlNotFoundError extends ApiError {
  constructor() {
    super(404, "NOT_FOUND", "Short URL not found");
    this.name = "ShortUrlNotFoundError";
  }
}

export class ShortUrlExpiredError extends ApiError {
  constructor() {
    super(410, "GONE", "Short URL has expired");
    this.name = "ShortUrlExpiredError";
  }
}

export class ShortCodeGenerationError extends ApiError {
  constructor() {
    super(503, "SHORT_CODE_GENERATION_FAILED", "Unable to generate a unique short code");
    this.name = "ShortCodeGenerationError";
  }
}

/** Expected persistence race: another request inserted the generated code first. */
export class ShortCodeCollisionError extends Error {
  constructor() {
    super("Short code already exists");
    this.name = "ShortCodeCollisionError";
  }
}
