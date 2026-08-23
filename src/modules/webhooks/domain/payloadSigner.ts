export interface SignedPayload {
  /** Unix seconds the signature was produced at, echoed in the header. */
  timestamp: number;
  /** Header value, e.g. `t=1710000000,v1=<hex>`. */
  signature: string;
}

export interface PayloadSigner {
  sign(input: { body: string; secret: string; timestamp?: number }): SignedPayload;
}
