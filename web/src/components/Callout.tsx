import { useState, type ReactNode } from "react";
import { AlertIcon, CopyIcon } from "./Icons.js";

export interface CalloutProps {
  title: ReactNode;
  description: ReactNode;
  value: string;
  onCopyError?: (message: string) => void;
}

/** Amber "shown once" box for secrets/keys the API never returns again. */
export function Callout({ title, description, value, onCopyError }: CalloutProps) {
  const [copyLabel, setCopyLabel] = useState("Copy");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyLabel("Copied!");
    } catch {
      onCopyError?.("Could not copy the value. Please copy it manually.");
    }
  }

  return (
    <div className="callout">
      <AlertIcon width={16} height={16} className="callout-icon" />
      <div className="callout-body">
        <div className="callout-title">{title}</div>
        <p className="callout-text">{description}</p>
        <div className="callout-value-row">
          <code className="callout-value">{value}</code>
          <button type="button" className="callout-copy" onClick={() => void copy()}>
            <CopyIcon width={13} height={13} />
            {copyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
