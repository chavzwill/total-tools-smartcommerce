import { CheckCircle2, ShoppingCart, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CART_FEEDBACK_EVENT } from "../../App";
import { go } from "../../lib/router";

type Feedback = { message: string; tone: "success" | "error" };

export default function CommerceToast() {
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const detail = (event as CustomEvent<Partial<Feedback>>).detail;
      if (!detail?.message) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      setFeedback({ message: detail.message, tone: detail.tone === "error" ? "error" : "success" });
      timerRef.current = window.setTimeout(() => setFeedback(null), 4200);
    };
    window.addEventListener(CART_FEEDBACK_EVENT, onFeedback);
    return () => {
      window.removeEventListener(CART_FEEDBACK_EVENT, onFeedback);
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  if (!feedback) return null;
  const success = feedback.tone === "success";

  return (
    <div className={`sc-commerce-toast ${success ? "is-success" : "is-error"}`} role={success ? "status" : "alert"} aria-live={success ? "polite" : "assertive"}>
      {success ? <CheckCircle2 size={20} aria-hidden="true" /> : <XCircle size={20} aria-hidden="true" />}
      <span><strong>{success ? "Added" : "Couldn’t add item"}</strong><small>{feedback.message}</small></span>
      {success ? <button type="button" onClick={() => { setFeedback(null); go("/cart"); }}><ShoppingCart size={16} /> View cart</button> : null}
    </div>
  );
}
