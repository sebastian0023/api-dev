import type { ReactNode } from "react";

export interface CardProps {
  title?: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, description, headerActions, footer, children, className }: CardProps) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      {(title || description || headerActions) && (
        <div className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p className="card-description">{description}</p>}
          </div>
          {headerActions}
        </div>
      )}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </section>
  );
}
