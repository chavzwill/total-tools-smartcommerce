import type { ReactNode } from "react";

type IconProps = { label: string; href: string; children: ReactNode };

function SocialLink({ label, href, children }: IconProps) {
  return <a href={href} target="_blank" rel="noreferrer" aria-label={label} title={label}>{children}</a>;
}

export default function SocialIcons() {
  return <div className="tt-footer__social" aria-label="Social media">
    <SocialLink label="Facebook" href="https://www.facebook.com"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 8h3V4h-3c-3.3 0-5 2-5 5v2H6v4h3v7h4v-7h3.3l.7-4h-4V9c0-.7.3-1 1-1Z" /></svg></SocialLink>
    <SocialLink label="Instagram" href="https://www.instagram.com"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" className="fill-icon" /></svg></SocialLink>
    <SocialLink label="WhatsApp" href="https://wa.me/18768345300"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.6a8 8 0 0 1-11.8 7l-4.2 1.1 1.1-4.1A8 8 0 1 1 20 11.6Z" /><path d="M8.5 7.8c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.5l.7 1.7c.1.3.1.5-.1.7l-.5.6c-.2.2-.2.4 0 .7.8 1.4 1.8 2.4 3.3 3 .3.1.5.1.7-.1l.8-1c.2-.2.4-.3.7-.2l1.7.8c.3.1.5.3.5.5 0 .3-.2 1.4-.8 1.9-.6.6-1.4.8-2.3.6-1.2-.2-2.7-.8-4.5-2.4-2.3-2-3.7-4.5-3.8-5.5 0-.6.2-1.1.5-1.4Z" /></svg></SocialLink>
    <SocialLink label="YouTube" href="https://www.youtube.com"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 7.2a2.8 2.8 0 0 0-2-2C17.2 4.7 12 4.7 12 4.7s-5.2 0-7 .5a2.8 2.8 0 0 0-2 2C2.5 9 2.5 12 2.5 12s0 3 .5 4.8a2.8 2.8 0 0 0 2 2c1.8.5 7 .5 7 .5s5.2 0 7-.5a2.8 2.8 0 0 0 2-2c.5-1.8.5-4.8.5-4.8s0-3-.5-4.8Z" /><path d="m10 15.5 5-3.5-5-3.5Z" className="fill-icon" /></svg></SocialLink>
    <SocialLink label="LinkedIn" href="https://www.linkedin.com"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v11M5 5v.1M10 20V9m0 5c0-3 2-5 4.7-5 2.8 0 4.3 1.9 4.3 5v6m-9-6v6" /></svg></SocialLink>
  </div>;
}
