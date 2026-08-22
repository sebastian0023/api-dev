import { randomInt } from "node:crypto";
import type { ShortCodeGenerator } from "./url.shortCodeGenerator.js";

const BASE62_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

export class Base62ShortCodeGenerator implements ShortCodeGenerator {
  constructor(private readonly length: number) {}

  generate(): string {
    let value = "";
    for (let index = 0; index < this.length; index += 1) {
      value += BASE62_ALPHABET[randomInt(0, BASE62_ALPHABET.length)];
    }
    return value;
  }
}

export { BASE62_ALPHABET };
