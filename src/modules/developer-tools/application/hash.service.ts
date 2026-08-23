import type { Logger } from "../../../core/moduleContract.js";
import type { HashAlgorithm, HashOutputEncoding, HashStrategyRegistry } from "../../developer-tools/domain/hashStrategy.js";
import { MAX_TEXT_INPUT_BYTES, assertInputSize } from "./inputLimits.js";

export function createHashService(deps: { registry: HashStrategyRegistry; logger: Logger }) {
  const { registry, logger } = deps;

  async function hash(input: { value: string; algorithm: HashAlgorithm; encoding: HashOutputEncoding }) {
    assertInputSize("Hash", input.value, MAX_TEXT_INPUT_BYTES);
    const startedAt = Date.now();
    const value = await registry.resolve(input.algorithm).hash(input.value, input.encoding);
    logger.info("Developer tool completed", {
      tool: "hash",
      algorithm: input.algorithm,
      encoding: input.encoding,
      durationMs: Date.now() - startedAt,
    });
    return { algorithm: input.algorithm, encoding: input.encoding, hash: value };
  }

  return { hash };
}

export type HashService = ReturnType<typeof createHashService>;
