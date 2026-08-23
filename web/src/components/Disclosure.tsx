import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./Icons.js";

export interface DisclosureProps {
  label?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function Disclosure({ label = "More options", defaultOpen = false, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="disclosure">
      <button
        type="button"
        className="disclosure-trigger"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDownIcon width={13} height={13} />
        {label}
      </button>
      {open && <div className="disclosure-content">{children}</div>}
    </div>
  );
}
