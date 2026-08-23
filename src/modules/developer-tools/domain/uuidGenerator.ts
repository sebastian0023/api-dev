import { DuplicateUuidGeneratorError, UnsupportedUuidVersionError } from "./developer-tools.errors.js";

export const UUID_VERSIONS = ["v4", "v7"] as const;
export type UuidVersion = (typeof UUID_VERSIONS)[number];

export interface UuidGenerator {
  readonly version: UuidVersion;
  generate(): string;
}

export class UuidGeneratorRegistry {
  private readonly generators = new Map<UuidVersion, UuidGenerator>();

  register(generator: UuidGenerator): void {
    if (this.generators.has(generator.version)) throw new DuplicateUuidGeneratorError(generator.version);
    this.generators.set(generator.version, generator);
  }

  resolve(version: string): UuidGenerator {
    const generator = this.generators.get(version as UuidVersion);
    if (!generator) throw new UnsupportedUuidVersionError(version);
    return generator;
  }

  supportedVersions(): readonly UuidVersion[] {
    return [...this.generators.keys()].sort();
  }
}
