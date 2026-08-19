export const GUEST_CART_CHANGED_EVENT = "smartcommerce:guest-cart-changed";
export const CART_FEEDBACK_EVENT = "smartcommerce:cart-feedback";

export type CartFeedbackDetail = {
  message: string;
  tone: "success" | "error";
};
