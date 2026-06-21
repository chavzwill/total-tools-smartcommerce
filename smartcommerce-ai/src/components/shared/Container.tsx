import type { HTMLAttributes, ReactNode } from "react";

type ContainerProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  size?: "default" | "wide";
};

export default function Container({ children, className = "", size = "default", ...props }: ContainerProps) {
  return (
    <div className={`tt-container tt-container--${size} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
