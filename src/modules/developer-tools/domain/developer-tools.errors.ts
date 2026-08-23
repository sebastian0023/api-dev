import { ApiError } from "../../../shared/http/errors.js";

export class UnsupportedUuidVersionError extends ApiError {
  constructor(version: string) {
    super(422, "DEVTOOLS_UNSUPPORTED_UUID_VERSION", `Unsupported UUID version: ${version}`);
  }
}

export class DuplicateUuidGeneratorError extends ApiError {
  constructor(version: string) {
    super(500, "DEVTOOLS_DUPLICATE_UUID_GENERATOR", `UUID generator already registered for version: ${version}`);
  }
}

export class UnsupportedHashAlgorithmError extends ApiError {
  constructor(algorithm: string) {
    super(422, "DEVTOOLS_UNSUPPORTED_HASH_ALGORITHM", `Unsupported hash algorithm: ${algorithm}`);
  }
}

export class DuplicateHashStrategyError extends ApiError {
  constructor(algorithm: string) {
    super(500, "DEVTOOLS_DUPLICATE_HASH_STRATEGY", `Hash strategy already registered for algorithm: ${algorithm}`);
  }
}

export class InvalidBase64Error extends ApiError {
  constructor(message = "Value must be canonical Base64-encoded UTF-8 text") {
    super(400, "DEVTOOLS_INVALID_BASE64", message);
  }
}

export class InvalidJwtStructureError extends ApiError {
  constructor(message = "JWT must use compact header.payload.signature serialization") {
    super(400, "DEVTOOLS_INVALID_JWT_STRUCTURE", message);
  }
}

export class InvalidJwtEncodingError extends ApiError {
  constructor(message = "JWT contains an invalid Base64URL segment") {
    super(400, "DEVTOOLS_INVALID_JWT_ENCODING", message);
  }
}

export class InvalidJwtJsonError extends ApiError {
  constructor(message = "JWT header and payload must be JSON objects") {
    super(400, "DEVTOOLS_INVALID_JWT_JSON", message);
  }
}

export class ToolInputTooLargeError extends ApiError {
  constructor(tool: string, maxBytes: number) {
    super(413, "DEVTOOLS_INPUT_TOO_LARGE", `${tool} input exceeds the ${maxBytes}-byte limit`);
  }
}
