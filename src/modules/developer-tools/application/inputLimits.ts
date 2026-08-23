import { ToolInputTooLargeError } from "../../developer-tools/domain/developer-tools.errors.js";

export const MAX_TEXT_INPUT_BYTES = 1_048_576;
export const MAX_JWT_INPUT_BYTES = 32 * 1_024;

export function assertInputSize(tool: string, value: string, maxBytes: number): void {
  if (Buffer.byteLength(value, "utf8") > maxBytes) throw new ToolInputTooLargeError(tool, maxBytes);
}
