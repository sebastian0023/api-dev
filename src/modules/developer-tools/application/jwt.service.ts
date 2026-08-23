import type { Logger } from "../../../core/moduleContract.js";
import type { JwtDecoder } from "../../developer-tools/domain/jwtDecoder.js";
import { MAX_JWT_INPUT_BYTES, assertInputSize } from "./inputLimits.js";

export function createJwtService(deps: { decoder: JwtDecoder; logger: Logger }) {
  const { decoder, logger } = deps;

  function decode(token: string) {
    assertInputSize("JWT", token, MAX_JWT_INPUT_BYTES);
    const startedAt = Date.now();
    const decoded = decoder.decode(token);
    logger.info("Developer tool completed", { tool: "jwt-decode", durationMs: Date.now() - startedAt });
    return decoded;
  }

  return { decode };
}

export type JwtService = ReturnType<typeof createJwtService>;
