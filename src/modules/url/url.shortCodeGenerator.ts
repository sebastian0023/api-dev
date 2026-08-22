/** Generates a candidate code for a shortened URL. */
export interface ShortCodeGenerator {
  generate(): string;
}
