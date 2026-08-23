export type JwtJsonObject = Record<string, unknown>;

export interface DecodedJwt {
  header: JwtJsonObject;
  payload: JwtJsonObject;
  metadata: {
    issuedAt: string | null;
    expiresAt: string | null;
    expired: boolean | null;
  };
}

export interface JwtDecoder {
  decode(token: string): DecodedJwt;
}
