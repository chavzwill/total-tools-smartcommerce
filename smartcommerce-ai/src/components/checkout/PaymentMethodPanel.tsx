import { Building2, CreditCard, Landmark, Loader2, ShieldCheck, Smartphone, Store } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { currentVerifiedQuoteContext } from "../../lib/customerCommerce";
import {
  paymentMethods,
  type PaymentMethodDefinition,
  type PaymentMethodGroup,
  type PaymentMethodId,
} from "../../payments/paymentMethods";
import { prepareStandardPaymentAttempt, type PaymentAttemptResponse } from "../../services/paymentAttemptClient";

type ServerCapability = {
  id: PaymentMethodId;
  enabled: boolean;
  reason?: string;
};

type CapabilityResponse = {
  currency?: string;
  capabilities?: ServerCapability[];
  policy?: {
    capabilityMeansExecutable?: boolean;
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

function MethodRow({ method, disabled, busy, explanation, onSelect }: {
  method: ResolvedMethod;
  disabled: boolean;
  busy: boolean;
  explanation?: string;
  onSelect: (method: PaymentMethodId) => void;
}) {
  const actionable = method.providerEnabled && !disabled;
  const status = busy ? "Preparing…" : actionable ? "Available" : method.providerEnabled ? "Unavailable here" : "Setup required";
  const reason = explanation || (!method.providerEnabled ? method.providerReason || "Requires merchant payment-provider configuration." : undefined);

  return (
    <button
      type="button"
      className="sc-payment-method"
      disabled={!actionable || busy}
      aria-disabled={!actionable || busy}
      title={reason}
      onClick={actionable && !busy ? () => onSelect(method.id) : undefined}
    >
      <span className="sc-payment-method__icon"><MethodIcon method={method} /></span>
      <span className="sc-payment-method__copy">
        <strong>{method.label}</strong>
        <small>{method.description}</small>
        {!actionable && reason ? <em>{reason}</em> : null}
      </span>
      <span className={`sc-payment-method__status${actionable ? " is-ready" : " is-pending"}`}>
        {busy ? <><Loader2 size={14} aria-hidden="true" /> Preparing</> : status}
      </span>
    </button>
  );
}

function Section({ title, subtitle, methods, disabledReason, busyMethod, onSelect }: {
  title: string;
  subtitle: string;
  methods: readonly ResolvedMethod[];
  disabledReason?: string;
  busyMethod?: PaymentMethodId | null;
  onSelect: (method: PaymentMethodId) => void;
}) {
  if (!methods.length) return null;
  return (
    <section className="sc-payment-group">
      <div className="sc-payment-group__head">
        <div><strong>{title}</strong><span>{subtitle}</span></div>
      </div>
      <div className="sc-payment-group__methods">
        {methods.map((method) => (
          <MethodRow
            key={method.id}
            method={method}
            disabled={Boolean(disabledReason)}
            busy={busyMethod === method.id}
            explanation={method.providerEnabled ? disabledReason : undefined}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

export default function PaymentMethodPanel({ onSelect }: Props) {
  const [capabilities, setCapabilities] = useState<ServerCapability[] | null>(null);
  const [capabilityError, setCapabilityError] = useState("");
  const [busyMethod, setBusyMethod] = useState<PaymentMethodId | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [prepared, setPrepared] = useState<PaymentAttemptResponse | null>(null);
  const quoteContext = currentVerifiedQuoteContext();

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function loadCapabilities() {
      try {
        const currency = /^[A-Z]{3}$/.test(quoteContext.currency) ? quoteContext.currency : "JMD";
        const response = await fetch(`/api/payment-capabilities?currency=${encodeURIComponent(currency)}`, {
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
  }, [quoteContext.currency]);

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
  const contextBlock = quoteContext.mode === "guest"
    ? "Online payment for guest checkout is not enabled until the secure guest-payment identity contract is complete."
    : !quoteContext.quoteId
      ? "A verified checkout quote is required before payment can start."
      : undefined;

  async function selectMethod(method: PaymentMethodId) {
    if (contextBlock || busyMethod) return;
    setBusyMethod(method);
    setPaymentError("");
    setPrepared(null);
    try {
      const result = await prepareStandardPaymentAttempt({ quoteId: quoteContext.quoteId, paymentMethod: method });
      setPrepared(result);
      onSelect?.(method);
      if (result.launch?.ready && result.launch.url) {
        window.location.assign(result.launch.url);
      }
    } catch (error: any) {
      setPaymentError(error?.message || "Payment could not be prepared. No charge was attempted.");
    } finally {
      setBusyMethod(null);
    }
  }

  return (
    <div className="sc-payment-panel" aria-label="Payment methods">
      <div className="sc-payment-panel__intro">
        <span>Payment options</span>
        <strong>Choose the fastest method available to you.</strong>
        <p>SmartCommerce verifies payment capability for this order’s currency on the server and will not enable a method until its provider adapter, merchant rail, and confirmation flow are executable.</p>
      </div>

      {capabilities === null ? <div className="sc-payment-panel__loading" role="status"><Loader2 size={17} aria-hidden="true" /> Checking payment availability…</div> : null}
      {capabilityError ? <p className="sc-payment-panel__error" role="alert">{capabilityError}</p> : null}
      {paymentError ? <p className="sc-payment-panel__error" role="alert">{paymentError}</p> : null}
      {prepared ? <div className="sc-payment-panel__integrity" role="status"><ShieldCheck size={19} aria-hidden="true" /><div><strong>Payment attempt prepared safely.</strong><span>{prepared.launch?.ready ? "Opening the verified provider checkout. Payment is still pending until SmartCommerce receives verified settlement evidence." : prepared.launch?.reason || "No charge was attempted because the provider launch adapter is not connected."}</span></div></div> : null}

      <Section
        title="Express checkout"
        subtitle="Wallet and recognised-card methods intended to settle through the primary acquirer."
        methods={methodsFor("express")}
        disabledReason={contextBlock}
        busyMethod={busyMethod}
        onSelect={selectMethod}
      />
      <Section
        title="Other online methods"
        subtitle="Additional payment rails that may reconcile separately."
        methods={[...methodsFor("wallet"), ...methodsFor("standard")]}
        disabledReason={contextBlock}
        busyMethod={busyMethod}
        onSelect={selectMethod}
      />
      <Section
        title="Pay at branch"
        subtitle="Reserve online and settle through the store POS when operationally enabled."
        methods={methodsFor("offline")}
        disabledReason={contextBlock}
        busyMethod={busyMethod}
        onSelect={selectMethod}
      />

      <div className="sc-payment-panel__integrity">
        <CreditCard size={19} aria-hidden="true" />
        <div><strong>Payment status comes from verified server evidence.</strong><span>A browser redirect or success screen never marks an order paid. SmartCommerce requires a verified provider webhook/query or verified POS confirmation.</span></div>
      </div>
    </div>
  );
}
