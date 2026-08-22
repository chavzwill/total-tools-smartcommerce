import { Building2, CreditCard, Landmark, Smartphone, Store } from "lucide-react";
import { paymentMethodsByGroup, type PaymentMethodDefinition } from "../../payments/paymentMethods";

function MethodIcon({ method }: { method: PaymentMethodDefinition }) {
  if (method.id === "pay-in-store") return <Store size={20} aria-hidden="true" />;
  if (method.id === "paypal") return <Landmark size={20} aria-hidden="true" />;
  if (method.id === "card") return <CreditCard size={20} aria-hidden="true" />;
  if (method.id === "click-to-pay") return <Building2 size={20} aria-hidden="true" />;
  return <Smartphone size={20} aria-hidden="true" />;
}

function MethodRow({ method }: { method: PaymentMethodDefinition }) {
  const waiting = method.capability !== "ready";
  return (
    <button
      type="button"
      className="sc-payment-method"
      disabled={waiting}
      aria-disabled={waiting}
      title={waiting ? "Requires merchant payment-provider configuration" : undefined}
    >
      <span className="sc-payment-method__icon"><MethodIcon method={method} /></span>
      <span className="sc-payment-method__copy">
        <strong>{method.label}</strong>
        <small>{method.description}</small>
      </span>
      <span className={`sc-payment-method__status${waiting ? " is-pending" : " is-ready"}`}>
        {waiting ? "Setup required" : "Available"}
      </span>
    </button>
  );
}

function Section({ title, subtitle, methods }: { title: string; subtitle: string; methods: readonly PaymentMethodDefinition[] }) {
  return (
    <section className="sc-payment-group">
      <div className="sc-payment-group__head">
        <div><strong>{title}</strong><span>{subtitle}</span></div>
      </div>
      <div className="sc-payment-group__methods">
        {methods.map((method) => <MethodRow key={method.id} method={method} />)}
      </div>
    </section>
  );
}

export default function PaymentMethodPanel() {
  return (
    <div className="sc-payment-panel" aria-label="Payment methods">
      <div className="sc-payment-panel__intro">
        <span>Payment options</span>
        <strong>Choose the fastest method available to you.</strong>
        <p>SmartCommerce will only enable a payment method after its real merchant processor, server verification and settlement flow are connected.</p>
      </div>

      <Section
        title="Express checkout"
        subtitle="Wallet and recognised-card methods intended to settle through the primary acquirer."
        methods={paymentMethodsByGroup("express")}
      />
      <Section
        title="Other online methods"
        subtitle="Additional payment rails that may reconcile separately."
        methods={[...paymentMethodsByGroup("wallet"), ...paymentMethodsByGroup("standard")]}
      />
      <Section
        title="Pay at branch"
        subtitle="Reserve online and settle through the store POS when operationally enabled."
        methods={paymentMethodsByGroup("offline")}
      />

      <div className="sc-payment-panel__integrity">
        <CreditCard size={19} aria-hidden="true" />
        <div><strong>No card data is collected by SmartCommerce today.</strong><span>A method becomes active only after provider onboarding and webhook/server-side payment confirmation are production-ready.</span></div>
      </div>
    </div>
  );
}
