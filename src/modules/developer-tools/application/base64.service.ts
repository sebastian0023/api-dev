import type { Logger } from "../../../core/moduleContract.js";
import type { EncodingStrategy } from "../../developer-tools/domain/encodingStrategy.js";
import { MAX_TEXT_INPUT_BYTES, assertInputSize } from "./inputLimits.js";

export function createBase64Service(deps: { strategy: EncodingStrategy; logger: Logger }) {
  const { strategy, logger } = deps;

  function encode(value: string) {
    assertInputSize("Base64", value, MAX_TEXT_INPUT_BYTES);
    const startedAt = Date.now();
    const encoded = strategy.encode(value);
    logger.info("Developer tool completed", { tool: "base64-encode", durationMs: Date.now() - startedAt });
    return { encoding: strategy.name, value: encoded };
  }

  function decode(value: string) {
    assertInputSize("Base64", value, MAX_TEXT_INPUT_BYTES);
    const startedAt = Date.now();
    const decoded = strategy.decode(value);
    logger.info("Developer tool completed", { tool: "base64-decode", durationMs: Date.now() - startedAt });
    return { encoding: "utf8", value: decoded };
  }

  return { encode, decode };
}

export type Base64Service = ReturnType<typeof createBase64Service>;
