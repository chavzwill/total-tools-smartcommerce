import type { ReactNode } from "react";

type BadgeProps = {
  children: ReactNode;
  tone?: "green" | "gold" | "neutral";
};

export default function Badge({ children, tone = "green" }: BadgeProps) {
  return <span className={`tt-badge tt-badge--${tone}`}>{children}</span>;
}
