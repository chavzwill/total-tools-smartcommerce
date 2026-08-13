import { company } from "../styles/theme";

export type CommercePromotionType =
  | "product"
  | "rental"
  | "commercial"
  | "delivery"
  | "event";

export type CommercePromotion = {
  id: string;
  type: CommercePromotionType;
  eyebrow: string;
  headline: string;
  value?: string;
  detail?: string;
  eligibility?: string;
  startAt?: string;
  endAt?: string;
  primaryCta: string;
  primaryHref: string;
  secondaryCta?: string;
  secondaryHref?: string;
  imageUrl?: string;
  priority?: number;
  verified: boolean;
};

export type CommerceSignal = {
  id: string;
  eyebrow: string;
  headline: string;
  detail?: string;
  href?: string;
  cta?: string;
  routePrefix?: string;
};

const parsePromotions = (): CommercePromotion[] => {
  const raw = import.meta.env.VITE_SMARTCOMMERCE_PROMOTIONS_JSON;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is CommercePromotion => {
      if (!item || typeof item !== "object") return false;
      const promotion = item as Partial<CommercePromotion>;
      return Boolean(
        promotion.id &&
          promotion.type &&
          promotion.eyebrow &&
          promotion.headline &&
          promotion.primaryCta &&
          promotion.primaryHref &&
          promotion.verified === true
      );
    });
  } catch {
    return [];
  }
};

const isScheduled = (promotion: CommercePromotion, now = Date.now()) => {
  const start = promotion.startAt ? Date.parse(promotion.startAt) : Number.NaN;
  const end = promotion.endAt ? Date.parse(promotion.endAt) : Number.NaN;
  if (Number.isFinite(start) && now < start) return false;
  if (Number.isFinite(end) && now > end) return false;
  return true;
};

export const getVerifiedPromotions = () =>
  parsePromotions()
    .filter((promotion) => promotion.verified && isScheduled(promotion))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

export const commerceSignals: CommerceSignal[] = [
  {
    id: "locations",
    eyebrow: "Total Tools Jamaica",
    headline: `${company.branches.length} branch locations across Kingston and St. Ann`,
    detail: company.branches.map((branch) => branch.name).join(" · "),
    href: "/commercial",
    cta: "Contact a branch",
  },
  {
    id: "products",
    eyebrow: "Product discovery",
    headline: "Search products, categories, specifications, and availability in one place",
    href: "/products",
    cta: "Browse products",
    routePrefix: "/products",
  },
  {
    id: "rentals",
    eyebrow: "Rentals",
    headline: "Plan equipment by job, branch, dates, availability, and pickup or delivery",
    href: "/rentals",
    cta: "Plan a rental",
    routePrefix: "/rentals",
  },
  {
    id: "repairs",
    eyebrow: "Repairs",
    headline: "Start a repair request with equipment details, issue information, and photos",
    href: "/repairs",
    cta: "Start repair",
    routePrefix: "/repairs",
  },
  {
    id: "commercial",
    eyebrow: "Commercial",
    headline: "Give contractors and business customers a direct path to commercial support",
    href: "/commercial",
    cta: "Commercial support",
    routePrefix: "/commercial",
  },
  {
    id: "ai",
    eyebrow: "SmartCommerce AI",
    headline: "Describe the job when you do not know the exact product name",
    detail: "The assistant uses connected provider data when provider context is configured.",
    href: "/assistant",
    cta: "Ask SmartCommerce",
    routePrefix: "/assistant",
  },
];

export const hasPublishedPromotions = () => getVerifiedPromotions().length > 0;
