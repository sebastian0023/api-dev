import { DuplicateHashStrategyError, UnsupportedHashAlgorithmError } from "./developer-tools.errors.js";

export const HASH_ALGORITHMS = ["sha256", "sha384", "sha512"] as const;
export const HASH_OUTPUT_ENCODINGS = ["hex", "base64"] as const;
export type HashAlgorithm = (typeof HASH_ALGORITHMS)[number];
export type HashOutputEncoding = (typeof HASH_OUTPUT_ENCODINGS)[number];

export interface HashStrategy {
  readonly algorithm: HashAlgorithm;
  hash(value: string, outputEncoding: HashOutputEncoding): Promise<string>;
}

export class HashStrategyRegistry {
  private readonly strategies = new Map<HashAlgorithm, HashStrategy>();

  register(strategy: HashStrategy): void {
    if (this.strategies.has(strategy.algorithm)) throw new DuplicateHashStrategyError(strategy.algorithm);
    this.strategies.set(strategy.algorithm, strategy);
  }

  resolve(algorithm: string): HashStrategy {
    const strategy = this.strategies.get(algorithm as HashAlgorithm);
    if (!strategy) throw new UnsupportedHashAlgorithmError(algorithm);
    return strategy;
  }

  supportedAlgorithms(): readonly HashAlgorithm[] {
    return [...this.strategies.keys()].sort();
  }
}
