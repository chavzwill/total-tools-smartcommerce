import { AlertTriangle, CheckCircle2, Download, FileText, Landmark, Loader2, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Container from "../components/shared/Container";
import { listCommercialAccounts, type CommercialAccountSummary } from "../services/commercialAccountClient";
import {
  commercialStatementCsvUrl,
  getCommercialAccountingStatement,
  type CommercialAccountingStatement,
} from "../services/commercialAccountingClient";
import { routeHref } from "../lib/router";

function formatMinor(value: number | string | null | undefined, currency = "JMD") {
  const amount = Number(value || 0) / 100;
  return new Intl.NumberFormat("en-JM", { style: "currency", currency }).format(amount);
}

function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1));
  return { start: start.toISOString(), end: end.toISOString() };
}

function labelType(type: string) {
  return type.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

export default function CommercialAccountingPage() {
  const [accounts, setAccounts] = useState<CommercialAccountSummary[]>([]);
  const [accountId, setAccountId] = useState("");
  const [periodOffset, setPeriodOffset] = useState(0);
  const [data, setData] = useState<CommercialAccountingStatement | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "signed-out" | "error">("loading");
  const [message, setMessage] = useState("");
  const period = useMemo(() => monthRange(periodOffset), [periodOffset]);

  useEffect(() => {
    let active = true;
    listCommercialAccounts()
      .then(({ accounts: found }) => {
        if (!active) return;
        setAccounts(found);
        const requested = new URLSearchParams(window.location.hash.split("?")[1] || "").get("accountId") || "";
        const selected = found.find((account) => account.id === requested)?.id || found[0]?.id || "";
        setAccountId(selected);
        setState("ready");
      })
      .catch((error: Error & { status?: number }) => {
        if (!active) return;
        setState(error.status === 401 ? "signed-out" : "error");
        setMessage(error.message);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!accountId || state !== "ready") {
      setData(null);
      return;
    }
    let active = true;
    setMessage("");
    getCommercialAccountingStatement(accountId, period.start, period.end)
      .then((statement) => { if (active) setData(statement); })
      .catch((error: Error) => { if (active) { setData(null); setMessage(error.message); } });
    return () => { active = false; };
  }, [accountId, period.start, period.end, state]);

  if (state === "loading") {
    return <div className="demo-page sc-commercial-accounting"><Container><div className="sc-commercial-accounting__loading"><Loader2 size={22} /> Loading commercial account…</div></Container></div>;
  }

  if (state === "signed-out") {
    return <div className="demo-page sc-commercial-accounting"><Container><section className="sc-commercial-accounting__empty"><Landmark size={32} /><h1>Sign in to view commercial accounting.</h1><p>Statements, transactions and credit controls are available only to authorised commercial account members.</p><a href={routeHref("/account?intent=commercial")}>Sign in or create account</a></section></Container></div>;
  }

  if (!accounts.length) {
    return <div className="demo-page sc-commercial-accounting"><Container><section className="sc-commercial-accounting__empty"><Landmark size={32} /><h1>No commercial account yet.</h1><p>Apply for a commercial account first. Financial history becomes available once the organisation and your authority are verified.</p><a href={routeHref("/commercial#commercial-account")}>Commercial accounts</a></section></Container></div>;
  }

  const controls = data?.financialControls;
  const summary = data?.statement.summary;
  const reconciliation = data?.statement.reconciliation;
  const receivables = data?.receivables;
  const reconciled = summary?.coverage === "provider_reconciled";
  const currency = (reconciled ? summary?.officialCurrency : null) || controls?.creditCurrency || data?.statement.entries[0]?.currency || receivables?.invoices[0]?.currency || "JMD";
  const periodLabel = new Date(period.start).toLocaleDateString("en-JM", { month: "long", year: "numeric", timeZone: "UTC" });
  const refundEntries = data?.statement.entries.filter((entry) => entry.entry_type === "refund") || [];
  const pendingRefundEntries = refundEntries.filter((entry) => entry.source_coverage !== "provider_synced");
  const verifiedRefundEntries = refundEntries.filter((entry) => entry.source_coverage === "provider_synced");

  return (
    <div className="demo-page sc-commercial-accounting">
      <section className="sc-commercial-accounting__hero">
        <Container>
          <span>Commercial finance</span>
          <h1>Account, transactions and statements.</h1>
          <p>A clean financial workspace for approved Total Tools commercial accounts.</p>
        </Container>
      </section>

      <Container className="sc-commercial-accounting__body">
        <div className="sc-commercial-accounting__toolbar">
          <label>
            Account
            <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.display_name}</option>)}
            </select>
          </label>
          <label>
            Statement period
            <select value={periodOffset} onChange={(event) => setPeriodOffset(Number(event.target.value))}>
              <option value={0}>This month</option>
              <option value={-1}>Last month</option>
              <option value={-2}>2 months ago</option>
              <option value={-3}>3 months ago</option>
            </select>
          </label>
          {data ? <a className="sc-commercial-accounting__download" href={commercialStatementCsvUrl(accountId, period.start, period.end)}><Download size={17} /> Download CSV</a> : null}
        </div>

        {message ? <p className="sc-flow-status is-error" role="status">{message}</p> : null}

        {data ? <>
          <section className="sc-commercial-accounting__summary" aria-label="Commercial account summary">
            <article><WalletCards size={22} /><span>Approved credit</span><strong>{controls?.creditEnabled && controls.creditLimitMinor ? formatMinor(controls.creditLimitMinor, controls.creditCurrency || "JMD") : "Not enabled"}</strong><small>{controls?.paymentTermsCode ? `Terms ${controls.paymentTermsCode}` : "No approved payment terms"}</small></article>
            <article><ReceiptText size={22} /><span>{periodLabel} charges</span><strong>{formatMinor(summary?.debitMinor, currency)}</strong><small>{summary?.totalEntries || 0} ledger entr{summary?.totalEntries === 1 ? "y" : "ies"}</small></article>
            <article><Landmark size={22} /><span>{periodLabel} credits</span><strong>{formatMinor(summary?.creditMinor, currency)}</strong><small>Payments, refunds, credits and adjustments</small></article>
            <article><ShieldCheck size={22} /><span>{reconciled ? "Official closing balance" : "SmartCommerce activity net"}</span><strong>{reconciled && summary?.officialBalanceMinor !== null ? formatMinor(summary?.officialBalanceMinor, currency) : formatMinor(summary?.activityNetMinor, currency)}</strong><small>{reconciled ? "Provider-reconciled statement period" : "Awaiting provider reconciliation"}</small></article>
          </section>

          <div className={`sc-commercial-accounting__disclosure ${reconciled ? "is-complete" : ""}`}><FileText size={18} /><p>{data.disclosure}</p></div>

          {refundEntries.length ? <div className={`sc-commercial-accounting__disclosure ${pendingRefundEntries.length ? "is-warning" : "is-complete"}`}>
            {pendingRefundEntries.length ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            <p>{pendingRefundEntries.length ? <><strong>{pendingRefundEntries.length} refund entr{pendingRefundEntries.length === 1 ? "y is" : "ies are"} still awaiting provider verification.</strong> They are recorded in SmartCommerce but are not presented as externally reconciled until matching provider/accounting evidence arrives.</> : <><strong>Refund verification complete for this statement period.</strong> {verifiedRefundEntries.length} refund entr{verifiedRefundEntries.length === 1 ? "y is" : "ies are"} provider-synced.</>}</p>
          </div> : null}

          {receivables ? <section className="sc-commercial-accounting__statement">
            <header><div><span>Receivables</span><h2>What is outstanding now</h2></div><strong>{formatMinor(receivables.totalOutstandingMinor, currency)}</strong></header>
            <div className="sc-commercial-accounting__summary" aria-label="Accounts receivable aging">
              <article><span>Current</span><strong>{formatMinor(receivables.currentMinor, currency)}</strong><small>Not yet overdue</small></article>
              <article><span>1–30 days</span><strong>{formatMinor(receivables.overdue1To30Minor, currency)}</strong><small>Overdue</small></article>
              <article><span>31–60 days</span><strong>{formatMinor(receivables.overdue31To60Minor, currency)}</strong><small>Overdue</small></article>
              <article><span>61–90 days</span><strong>{formatMinor(receivables.overdue61To90Minor, currency)}</strong><small>Overdue</small></article>
              <article><span>90+ days</span><strong>{formatMinor(receivables.overdue90PlusMinor, currency)}</strong><small>Overdue</small></article>
            </div>
            {receivables.invoices.length ? <div className="sc-commercial-accounting__entries">
              {receivables.invoices.map((invoice) => <article key={invoice.id} className="sc-commercial-accounting__entry">
                <div className="sc-commercial-accounting__entry-main"><span>{invoice.dueAt ? `Due ${new Date(invoice.dueAt).toLocaleDateString("en-JM", { day: "2-digit", month: "short", year: "numeric" })}` : "Due date unavailable"}</span><strong>{invoice.description}</strong><small>Invoice {invoice.reference}{invoice.purchaseOrderReference ? ` · PO ${invoice.purchaseOrderReference}` : ""}</small></div>
                <div className="sc-commercial-accounting__entry-status"><span>{invoice.daysOverdue > 0 ? `${invoice.daysOverdue} days overdue` : "Current"}</span><small>{invoice.status}</small></div>
                <strong className="is-debit">{formatMinor(invoice.outstandingMinor, invoice.currency)}</strong>
              </article>)}
            </div> : <div className="sc-commercial-accounting__empty-period"><ReceiptText size={28} /><strong>No provider-reported outstanding invoices.</strong><p>Receivables appear only when the connected accounting source supplies an invoice outstanding balance.</p></div>}
          </section> : null}

          <section className="sc-commercial-accounting__statement">
            <header><div><span>Statement</span><h2>{periodLabel}</h2></div><strong>{data.account.displayName}</strong></header>
            {reconciliation ? <div className="sc-commercial-accounting__disclosure is-complete"><ShieldCheck size={18} /><p><strong>Reconciled by provider.</strong> Opening balance {formatMinor(reconciliation.openingBalanceMinor, reconciliation.currency)} · closing balance {formatMinor(reconciliation.closingBalanceMinor, reconciliation.currency)} · reference {reconciliation.providerReference}.</p></div> : null}
            {data.statement.entries.length ? <div className="sc-commercial-accounting__entries">
              {data.statement.entries.map((entry) => {
                const debit = Number(entry.debit_minor || 0);
                const credit = Number(entry.credit_minor || 0);
                const isRefund = entry.entry_type === "refund";
                const providerVerified = entry.source_coverage === "provider_synced";
                return <article key={entry.id} className="sc-commercial-accounting__entry">
                  <div className="sc-commercial-accounting__entry-main"><span>{new Date(entry.occurred_at).toLocaleDateString("en-JM", { day: "2-digit", month: "short", year: "numeric" })}</span><strong>{entry.description}</strong><small>{labelType(entry.entry_type)} · {entry.reference}{entry.purchase_order_reference ? ` · PO ${entry.purchase_order_reference}` : ""}</small></div>
                  <div className="sc-commercial-accounting__entry-status"><span>{isRefund ? (providerVerified ? "Refund verified" : "Refund verification pending") : entry.status}</span><small>{isRefund ? (providerVerified ? "Provider/accounting evidence matched" : "SmartCommerce record only") : entry.source}</small></div>
                  <strong className={credit > 0 ? "is-credit" : "is-debit"}>{credit > 0 ? `−${formatMinor(credit, entry.currency)}` : formatMinor(debit, entry.currency)}</strong>
                </article>;
              })}
            </div> : <div className="sc-commercial-accounting__empty-period"><ReceiptText size={28} /><strong>No financial activity in this period.</strong><p>Provider/accounting transactions will appear here as they are synchronized.</p></div>}
          </section>
        </> : accountId && !message ? <div className="sc-commercial-accounting__loading"><Loader2 size={20} /> Loading statement…</div> : null}
      </Container>
    </div>
  );
}
