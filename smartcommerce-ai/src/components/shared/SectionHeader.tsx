import Badge from "./Badge";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  align?: "left" | "center";
};

export default function SectionHeader({ eyebrow, title, description, align = "left" }: SectionHeaderProps) {
  return (
    <header className={`tt-section-header tt-section-header--${align}`}>
      <Badge tone="gold">{eyebrow}</Badge>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </header>
  );
}
