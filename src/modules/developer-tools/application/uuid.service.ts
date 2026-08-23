import type { Logger } from "../../../core/moduleContract.js";
import type { UuidGeneratorRegistry, UuidVersion } from "../../developer-tools/domain/uuidGenerator.js";

export function createUuidService(deps: { registry: UuidGeneratorRegistry; logger: Logger }) {
  const { registry, logger } = deps;

  function generate(input: { version: UuidVersion; count: number }) {
    const startedAt = Date.now();
    const generator = registry.resolve(input.version);
    const values = Array.from({ length: input.count }, () => generator.generate());
    logger.info("Developer tool completed", { tool: "uuid", version: input.version, durationMs: Date.now() - startedAt });
    return { version: input.version, count: input.count, values };
  }

  return { generate };
}

export type UuidService = ReturnType<typeof createUuidService>;
