import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "small" | "medium";
};

export default function Button({ children, className = "", variant = "primary", size = "medium", ...props }: ButtonProps) {
  return (
    <button className={`tt-button tt-button--${variant} tt-button--${size} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
