import { TextDecoder } from "node:util";
import type { EncodingStrategy } from "../../domain/encodingStrategy.js";
import { InvalidBase64Error } from "../../domain/developer-tools.errors.js";

const UTF8_DECODER = new TextDecoder("utf-8", { fatal: true });
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export class Base64EncodingStrategy implements EncodingStrategy {
  readonly name = "base64";

  encode(value: string): string {
    return Buffer.from(value, "utf8").toString("base64");
  }

  decode(value: string): string {
    if (!BASE64_PATTERN.test(value)) throw new InvalidBase64Error();
    const bytes = Buffer.from(value, "base64");
    if (bytes.toString("base64") !== value) throw new InvalidBase64Error();
    try {
      return UTF8_DECODER.decode(bytes);
    } catch {
      throw new InvalidBase64Error("Base64 value must decode to valid UTF-8 text");
    }
  }
}
