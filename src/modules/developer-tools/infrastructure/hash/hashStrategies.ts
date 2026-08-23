import { createHash } from "node:crypto";
import type { HashAlgorithm, HashOutputEncoding, HashStrategy } from "../../domain/hashStrategy.js";

abstract class NodeCryptoHashStrategy implements HashStrategy {
  abstract readonly algorithm: HashAlgorithm;

  async hash(value: string, outputEncoding: HashOutputEncoding): Promise<string> {
    return createHash(this.algorithm).update(value, "utf8").digest(outputEncoding);
  }
}

export class Sha256HashStrategy extends NodeCryptoHashStrategy {
  readonly algorithm = "sha256" as const;
}

export class Sha384HashStrategy extends NodeCryptoHashStrategy {
  readonly algorithm = "sha384" as const;
}

export class Sha512HashStrategy extends NodeCryptoHashStrategy {
  readonly algorithm = "sha512" as const;
}
