export type StatusTone = "success" | "danger" | "warning";

export interface StatusPillProps {
  tone: StatusTone;
  children: React.ReactNode;
}

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={`status-pill status-pill-${tone}`}>
      <span className="status-pill-dot" />
      {children}
    </span>
  );
}

const DELIVERY_TONE: Record<string, StatusTone> = {
  succeeded: "success",
  failed: "danger",
  pending: "warning",
  delivering: "warning",
};

export function toneForDeliveryStatus(status: string): StatusTone {
  return DELIVERY_TONE[status] ?? "warning";
}
