export interface EncodingStrategy {
  readonly name: string;
  encode(value: string): string;
  decode(value: string): string;
}
