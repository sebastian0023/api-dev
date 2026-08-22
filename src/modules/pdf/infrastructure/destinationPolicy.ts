import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { PdfBlockedDestinationError, PdfInvalidUrlError, PdfRenderError } from "../../pdf/domain/pdf.errors.js";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type DnsResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const METADATA_HOSTS = new Set(["metadata.google.internal", "metadata.aws.internal"]);

export const systemDnsResolver: DnsResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records.map((record) => ({ address: record.address, family: record.family as 4 | 6 }));
};

function hostnameWithoutBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
}

function isPublicAddress(address: string): boolean {
  const parsed = ipaddr.parse(address);
  if (parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()) {
    return isPublicAddress(parsed.toIPv4Address().toString());
  }
  return parsed.range() === "unicast";
}

/**
 * SSRF boundary for both top-level navigations and browser subrequests.
 * Every DNS answer must be public; allowing a mixed answer set would make
 * round-robin and rebinding attacks possible without another browser request.
 */
export class DestinationPolicy {
  constructor(private readonly resolve: DnsResolver = systemDnsResolver) {}

  parseAndValidate(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new PdfInvalidUrlError();
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new PdfInvalidUrlError();
    if (url.username || url.password) throw new PdfInvalidUrlError();
    return url;
  }

  async assertAllowed(value: URL | string): Promise<void> {
    const url = typeof value === "string" ? this.parseAndValidate(value) : value;
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new PdfInvalidUrlError();
    if (url.username || url.password) throw new PdfInvalidUrlError();
    const hostname = hostnameWithoutBrackets(url.hostname);
    if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || METADATA_HOSTS.has(hostname)) {
      throw new PdfBlockedDestinationError();
    }

    if (ipaddr.isValid(hostname)) {
      if (!isPublicAddress(hostname)) throw new PdfBlockedDestinationError();
      return;
    }

    let records: ResolvedAddress[];
    try {
      records = await this.resolve(hostname);
    } catch {
      throw new PdfRenderError("Could not resolve URL destination");
    }
    if (records.length === 0 || records.some((record) => !isPublicAddress(record.address))) {
      throw new PdfBlockedDestinationError();
    }
  }
}
