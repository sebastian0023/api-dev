import { v4 as uuidv4, v7 as uuidv7 } from "uuid";
import type { UuidGenerator } from "../../domain/uuidGenerator.js";

export class UuidV4Generator implements UuidGenerator {
  readonly version = "v4" as const;

  generate(): string {
    return uuidv4();
  }
}

export class UuidV7Generator implements UuidGenerator {
  readonly version = "v7" as const;

  generate(): string {
    return uuidv7();
  }
}
