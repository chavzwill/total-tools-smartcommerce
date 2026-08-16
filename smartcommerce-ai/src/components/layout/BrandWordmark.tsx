type BrandWordmarkProps = {
  compact?: boolean;
};

export default function BrandWordmark({ compact = false }: BrandWordmarkProps) {
  return (
    <span className={`tt-clean-brand${compact ? " tt-clean-brand--compact" : ""}`} aria-label="Total Tools Jamaica">
      <span className="tt-clean-brand__symbol" aria-hidden="true">
        <span className="tt-clean-brand__bar" />
        <span className="tt-clean-brand__stem" />
      </span>
      <span className="tt-clean-brand__words">
        <strong>TOTAL TOOLS</strong>
        <small>JAMAICA</small>
      </span>
    </span>
  );
}
