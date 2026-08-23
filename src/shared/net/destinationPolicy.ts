import { lookup } from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { ApiError } from "../http/errors.js";

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

export class InvalidDestinationUrlError extends ApiError {
  constructor(message = "URL must be a valid HTTP or HTTPS URL without embedded credentials") {
    super(400, "INVALID_DESTINATION_URL", message);
  }
}

export class BlockedDestinationError extends ApiError {
  constructor(message = "URL resolves to a blocked destination") {
    super(403, "BLOCKED_DESTINATION", message);
  }
}

export class UnresolvableDestinationError extends ApiError {
  constructor(message = "Could not resolve URL destination") {
    super(502, "UNRESOLVABLE_DESTINATION", message);
  }
}

/**
 * Every consumer of this policy already has its own documented error
 * vocabulary (PDF_BLOCKED_DESTINATION, WEBHOOKS_BLOCKED_DESTINATION, ...),
 * and callers branch on those concrete types — the pdf renderer, for one,
 * decides whether a Playwright subrequest failure was a block or an
 * unrelated fault via `instanceof`. Injecting the constructors keeps one
 * audited SSRF implementation without flattening those vocabularies into a
 * single shared error type.
 */
export interface DestinationErrorFactory {
  invalidUrl(message?: string): Error;
  blocked(message?: string): Error;
  unresolvable(message?: string): Error;
}

const defaultErrors: DestinationErrorFactory = {
  invalidUrl: (message) => new InvalidDestinationUrlError(message),
  blocked: (message) => new BlockedDestinationError(message),
  unresolvable: (message) => new UnresolvableDestinationError(message),
};

export interface DestinationPolicyOptions {
  errors?: DestinationErrorFactory;
  /**
   * Escape hatch for local development only: skips the public-address
   * checks so a service can deliver to 127.0.0.1 / a compose-network host.
   * Protocol and embedded-credential rules still apply. Never enable this
   * where callers can supply arbitrary destinations.
   */
  allowPrivate?: boolean;
}

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
 * Shared SSRF boundary for every outbound request built from a
 * caller-supplied URL — pdf navigations and browser subrequests, webhook
 * deliveries. Every DNS answer must be public; allowing a mixed answer set
 * would make round-robin and rebinding attacks possible without another
 * request.
 */
export class DestinationPolicy {
  private readonly errors: DestinationErrorFactory;
  private readonly allowPrivate: boolean;

  constructor(
    private readonly resolve: DnsResolver = systemDnsResolver,
    options: DestinationPolicyOptions = {},
  ) {
    this.errors = options.errors ?? defaultErrors;
    this.allowPrivate = options.allowPrivate ?? false;
  }

  parseAndValidate(value: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw this.errors.invalidUrl();
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") throw this.errors.invalidUrl();
    if (url.username || url.password) throw this.errors.invalidUrl();
    return url;
  }

  async assertAllowed(value: URL | string): Promise<void> {
    const url = typeof value === "string" ? this.parseAndValidate(value) : value;
    if (url.protocol !== "http:" && url.protocol !== "https:") throw this.errors.invalidUrl();
    if (url.username || url.password) throw this.errors.invalidUrl();
    const hostname = hostnameWithoutBrackets(url.hostname);
    if (!hostname) throw this.errors.blocked();
    if (this.allowPrivate) return;

    if (hostname === "localhost" || hostname.endsWith(".localhost") || METADATA_HOSTS.has(hostname)) {
      throw this.errors.blocked();
    }

    if (ipaddr.isValid(hostname)) {
      if (!isPublicAddress(hostname)) throw this.errors.blocked();
      return;
    }

    let records: ResolvedAddress[];
    try {
      records = await this.resolve(hostname);
    } catch {
      throw this.errors.unresolvable();
    }
    if (records.length === 0 || records.some((record) => !isPublicAddress(record.address))) {
      throw this.errors.blocked();
    }
  }
}
