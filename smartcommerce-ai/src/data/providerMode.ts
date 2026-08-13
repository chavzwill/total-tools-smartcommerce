export const hasConfiguredCommerceProvider = () => Boolean(import.meta.env.VITE_SMARTCOMMERCE_BUSINESS_ID && import.meta.env.VITE_SMARTCOMMERCE_PROVIDER_ID);

export const getCommerceDataMode = () => hasConfiguredCommerceProvider() ? "connected" as const : "preview" as const;
