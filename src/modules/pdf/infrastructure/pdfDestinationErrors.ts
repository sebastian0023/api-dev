import type { DestinationErrorFactory } from "../../../shared/net/destinationPolicy.js";
import { PdfBlockedDestinationError, PdfInvalidUrlError, PdfRenderError } from "../../pdf/domain/pdf.errors.js";

/**
 * Maps the shared SSRF policy's failures onto this module's documented
 * error codes (PDF_INVALID_URL / PDF_BLOCKED_DESTINATION / …), so moving
 * the policy into shared/ changed nothing observable about the PDF API.
 */
export const pdfDestinationErrors: DestinationErrorFactory = {
  invalidUrl: (message) => new PdfInvalidUrlError(message),
  blocked: (message) => new PdfBlockedDestinationError(message),
  unresolvable: (message) => new PdfRenderError(message ?? "Could not resolve URL destination"),
};
