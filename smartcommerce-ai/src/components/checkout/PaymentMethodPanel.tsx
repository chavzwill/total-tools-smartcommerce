import { Building2, CreditCard, Landmark, Loader2, Smartphone, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  paymentMethods,
  type PaymentMethodDefinition,
  type PaymentMethodGroup,
  type PaymentMethodId,
} from "../../payments/paymentMethods";

type ServerCapability = {
  id: PaymentMethodId;
  enabled: boolean;
  reason?: string;
};

type CapabilityResponse = {
  capabilities?: ServerCapability[];
  policy?: {
    browserRedirectIsProofOfPayment?: boolean;
    paymentConfirmationRequired?: boolean;
    confirmationSources?: string[];
  };
};

type ResolvedMethod = PaymentMethodDefinition & {
  providerEnabled: boolean;
  providerReason?: string;
};

type Props = {
  onSelect?: (method: PaymentMethodId) => void;
};

function MethodIcon({ method }: { method: PaymentMethodDefinition }) {
  if (method.id === "pay-in-store") return <Store size={20} aria-hidden="true" />;
  if (method.id === "paypal") return <Landmark size={20} aria-hidden="true" />;
  if (method.id === "card") return <CreditCard size={20} aria-hidden="true" />;
  if (method.id === "click-to-pay") return <Building2 size={20} aria-hidden="true" />;
  return <Smartphone size={20} aria-hidden="true" />;
}

function MethodRow({ method, onSelect }: { method: ResolvedMethod; onSelect?: (method: PaymentMethodId) => void }) {
  const adapterReady = Boolean(onSelect);
  const actionable = method.providerEnabled && adapterReady;
  const status = actionable ? "Available" : method.providerEnabled ? "Provider ready" : "Setup required";
  const explanation = method.providerEnabled
    ? adapterReady
      ? undefined
      : "Merchant capability is configured, but the SmartCommerce checkout adapter is not connected yet."
    : method.providerReason || "Requires merchant payment-provider configuration.";

  return (
    <button
      type="button"
      className="sc-payment-method"
      disabled={!actionable}
      aria-disabled={!actionable}
      title={explanation}
      onClick={actionable ? () => onSelect?.(method.id) : undefined}
    >
      <span className="sc-payment-method__icon"><MethodIcon method={method} /></span>
      <span className="sc-payment-method__copy">
        <strong>{method.label}</strong>
        <small>{method.description}</small>
        {!actionable && explanation ? <em>{explanation}</em> : null}
      </span>
      <span className={`sc-payment-method__status${actionable ? " is-ready" : " is-pending"}`}>
        {status}
      </span>
    </button>
  );
}

function Section({ title, subtitle, methods, onSelect }: {
  title: string;
  subtitle: string;
  methods: readonly ResolvedMethod[];
  onSelect?: (method: PaymentMethodId) => void;
}) {
  if (!methods.length) return null;
  return (
    <section className="sc-payment-group">
      <div className="sc-payment-group__head">
        <div><strong>{title}</strong><span>{subtitle}</span></div>
      </div>
      <div className="sc-payment-group__methods">
        {methods.map((method) => <MethodRow key={method.id} method={method} onSelect={onSelect} />)}
      </div>
    </section>
  );
}

export default function PaymentMethodPanel({ onSelect }: Props) {
  const [capabilities, setCapabilities] = useState<ServerCapability[] | null>(null);
  const [capabilityError, setCapabilityError] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadCapabilities() {
      try {
        const response = await fetch("/api/payment-capabilities", {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Payment capability service is unavailable.");
        const payload = await response.json() as CapabilityResponse;
        if (!active) return;
        setCapabilities(Array.isArray(payload.capabilities) ? payload.capabilities : []);
        setCapabilityError("");
      } catch (error: any) {
        if (!active || error?.name === "AbortError") return;
        setCapabilities([]);
        setCapabilityError("Payment availability could not be verified. No online payment method has been enabled.");
      }
    }

    void loadCapabilities();
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const resolvedMethods = useMemo<ResolvedMethod[]>(() => {
    const byId = new Map((capabilities || []).map((item) => [item.id, item]));
    return paymentMethods.map((method) => {
      const server = byId.get(method.id);
      return {
        ...method,
        providerEnabled: Boolean(server?.enabled),
        providerReason: server?.reason,
      };
    });
  }, [capabilities]);

  const methodsFor = (group: PaymentMethodGroup) => resolvedMethods.filter((method) => method.group === group);

  return (
    <div className="sc-payment-panel" aria-label="Payment methods">
      <div className="sc-payment-panel__intro">
        <span>Payment options</span>
        <strong>Choose the fastest method available to you.</strong>
        <p>SmartCommerce verifies payment capability on the server and will not enable a method until both the merchant rail and its confirmation flow are production-ready.</p>
      </div>

      {capabilities === null ? <div className="sc-payment-panel__loading" role="status"><Loader2 size={17} aria-hidden="true" /> Checking payment availability…</div> : null}
      {capabilityError ? <p className="sc-payment-panel__error" role="alert">{capabilityError}</p> : null}

      <Section
        title="Express checkout"
        subtitle="Wallet and recognised-card methods intended to settle through the primary acquirer."
        methods={methodsFor("express")}
        onSelect={onSelect}
      />
      <Section
        title="Other online methods"
        subtitle="Additional payment rails that may reconcile separately."
        methods={[...methodsFor("wallet"), ...methodsFor("standard")]}
        onSelect={onSelect}
      />
      <Section
        title="Pay at branch"
        subtitle="Reserve online and settle through the store POS when operationally enabled."
        methods={methodsFor("offline")}
        onSelect={onSelect}
      />

      <div className="sc-payment-panel__integrity">
        <CreditCard size={19} aria-hidden="true" />
        <div><strong>Payment status comes from verified server evidence.</strong><span>A browser redirect or success screen never marks an order paid. SmartCommerce requires a verified provider webhook/query or verified POS confirmation.</span></div>
      </div>
    </div>
  );
}
