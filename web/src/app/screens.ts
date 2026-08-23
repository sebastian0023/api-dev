import type { ComponentType } from "react";
import { QrIcon, LinkIcon, DocumentIcon, GearIcon, WebhookIcon, KeyIcon } from "../components/Icons.js";

export type ScreenId = "qr" | "urls" | "pdf" | "dev-tools" | "webhooks" | "api-keys";

export interface ScreenDefinition {
  id: ScreenId;
  label: string;
  title: string;
  description: string;
  icon: ComponentType<{ width?: number; height?: number }>;
  group: "tools" | "footer";
}

// Single source of truth for navigation: the sidebar, breadcrumb, page
// header, and the narrow-viewport pill row all read from this one array,
// so adding a screen later is a one-line change here.
export const SCREENS: readonly ScreenDefinition[] = [
  {
    id: "qr",
    label: "QR codes",
    title: "QR codes",
    description: "Encode any payload as a scannable code and track scans by ID.",
    icon: QrIcon,
    group: "tools",
  },
  {
    id: "urls",
    label: "Short links",
    title: "Short links",
    description: "Shorten a destination URL and manage existing codes.",
    icon: LinkIcon,
    group: "tools",
  },
  {
    id: "pdf",
    label: "PDF render",
    title: "Convert to PDF",
    description: "Render HTML or a public HTTP(S) URL.",
    icon: DocumentIcon,
    group: "tools",
  },
  {
    id: "dev-tools",
    label: "Dev tools",
    title: "Developer tools",
    description: "Stateless UUID, hashing, Base64, and JWT-decode utilities.",
    icon: GearIcon,
    group: "tools",
  },
  {
    id: "webhooks",
    label: "Webhooks",
    title: "Webhooks",
    description: "Receive signed HTTP deliveries when events happen. Failures retry with backoff for 24 hours.",
    icon: WebhookIcon,
    group: "tools",
  },
  {
    id: "api-keys",
    label: "API keys",
    title: "API keys",
    description: "Create and manage keys for programmatic access to the API.",
    icon: KeyIcon,
    group: "footer",
  },
];

export const DEFAULT_SCREEN: ScreenId = "qr";

const SCREEN_IDS = new Set<string>(SCREENS.map((s) => s.id));

export function isScreenId(value: string): value is ScreenId {
  return SCREEN_IDS.has(value);
}

export function getScreen(id: ScreenId): ScreenDefinition {
  const found = SCREENS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown screen: ${id}`);
  return found;
}
