import { Bot, PackageSearch, Send, Sparkles, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import Container from "../components/shared/Container";
import mascot from "../assets/brand/mascot-illustrated.jpeg";
import {
  advisorPrompts,
  getAdvisorResponse,
  type AdvisorUiResult,
} from "../lib/advisor";
import { routeHref } from "../lib/router";
import type { CommerceProduct } from "../platform";
import type { AssistantConversationTurn } from "../backend";

const prompts = [
  "I need a generator for my farm.",
  "I need an excavator tomorrow.",
  "My pressure washer stopped working.",
  "I have a picture of a fitting I need.",
];

type Props = {
  initialPrompt?: string;
  onAdd: (id: string, quantity?: number) => void;
};

function productImage(product: CommerceProduct) {
  return [...(product.images || [])].sort((a, b) => (a.position || 0) - (b.position || 0))[0]?.url;
}

function productPrice(product: CommerceProduct) {
  for (const pricing of product.pricing || []) {
    const value = pricing.salePrice ?? pricing.listPrice ?? pricing.commercialPrice;
    if (value === undefined) continue;
    const currency = pricing.currency || "JMD";
    try {
      return new Intl.NumberFormat("en-JM", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
    } catch {
      return `${currency} ${value.toLocaleString("en-JM")}`;
    }
  }
  return "Price confirmed in product details";
}

export default function AssistantPage({ initialPrompt = "", onAdd }: Props) {
  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [response, setResponse] = useState<AdvisorUiResult | null>(null);
  const [history, setHistory] = useState<AssistantConversationTurn[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const submitPrompt = async (nextPrompt: string) => {
    const clean = nextPrompt.trim();
    if (!clean) return;
    setStatus("loading");
    setError("");
    const context = history.slice(-6);
    const result = await getAdvisorResponse(clean, context);

    if (!result.success) {
      setStatus("error");
      setError(result.error.message);
      return;
    }

    setStatus("idle");
    setResponse(result.data);
    setHistory((current) => [
      ...current,
      { role: "user", content: clean },
      { role: "assistant", content: result.data.summary },
    ].slice(-6) as AssistantConversationTurn[]);
  };

  useEffect(() => {
    if (initialPrompt.trim()) void submitPrompt(initialPrompt);
  }, [initialPrompt]);

  return (
    <div className="demo-page sc-assistant-next">
      <section className="sc-assistant-next__hero">
        <Container>
          <span><Sparkles size={15} /> SmartCommerce AI</span>
          <h1>Tell us the job. Get a useful next move.</h1>
          <p>Ask in normal language. Recommendations are limited to products, rentals and actions returned by the connected SmartCommerce provider.</p>
        </Container>
      </section>

      <Container size="wide" className="sc-assistant-next__layout">
        <aside className="sc-assistant-next__guide">
          <img src={mascot} alt="Total Tools SmartCommerce assistant" />
          <div>
            <span>Try asking</span>
            <h2>You do not need to know the product name.</h2>
            <p>Describe the job, the problem, the size, the power requirement, or what you are trying to achieve.</p>
          </div>
          <div className="sc-assistant-next__prompts">
            {prompts.map((item, index) => (
              <button
                type="button"
                key={item}
                onClick={() => {
                  const next = advisorPrompts[index] || item;
                  setPrompt(next);
                  setHistory([]);
                  void getAdvisorResponse(next, []).then((result) => {
                    if (!result.success) {
                      setStatus("error");
                      setError(result.error.message);
                      return;
                    }
                    setStatus("idle");
                    setResponse(result.data);
                    setHistory([
                      { role: "user", content: next },
                      { role: "assistant", content: result.data.summary },
                    ]);
                  });
                  setStatus("loading");
                  setError("");
                }}
              >
                {item}
              </button>
            ))}
          </div>
          <a className="sc-assistant-next__photo" href={routeHref("/product-match")}><PackageSearch size={17} /> Identify something from a photo</a>
        </aside>

        <section className="sc-assistant-next__workspace">
          <form
            className="sc-assistant-next__composer"
            onSubmit={(event) => {
              event.preventDefault();
              void submitPrompt(prompt);
            }}
          >
            <label htmlFor="smartcommerce-assistant-input">What are you trying to do?</label>
            <div>
              <input
                id="smartcommerce-assistant-input"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Eg. I need a generator for a 3 bedroom house"
              />
              <button disabled={status === "loading" || !prompt.trim()}>
                <Send size={18} /> {status === "loading" ? "Working…" : "Ask"}
              </button>
            </div>
          </form>

          <article className={`sc-assistant-next__answer ${status === "error" ? "is-error" : ""}`} aria-live="polite">
            <header><Bot size={21} /><span>{status === "loading" ? "Checking connected options" : "SmartCommerce recommendation"}</span></header>
            {status === "loading" ? <div className="sc-assistant-next__loading"><span /><span /><span /></div> : null}
            {status === "error" ? <><h2>SmartCommerce could not complete that request.</h2><p>{error}</p></> : null}
            {status !== "error" && status !== "loading" ? (
              response ? <><h2>{response.summary}</h2>{!response.products.length && !response.rentals.length ? <p>No connected product or rental result was returned. Try adding a specification, size, use case, or date.</p> : null}</> : <><h2>Start with the job, not the catalogue.</h2><p>SmartCommerce will return actionable connected options here instead of a generic text-only answer.</p></>
            ) : null}
          </article>

          {response?.products.length ? (
            <section className="sc-assistant-next__results" aria-labelledby="assistant-products-title">
              <div className="sc-assistant-next__section-heading"><div><span>Products</span><h2 id="assistant-products-title">Options you can act on now</h2></div><a href={routeHref("/products")}>Browse all products</a></div>
              <div className="sc-assistant-next__product-grid">
                {response.products.map((product) => (
                  <article key={product.id} className="sc-assistant-product">
                    <a href={routeHref(`/product/${product.id}`)} className="sc-assistant-product__image">{productImage(product) ? <img src={productImage(product)} alt={product.name} /> : <PackageSearch size={30} aria-hidden="true" />}</a>
                    <div>
                      <span>{product.brand || product.sku || "Connected catalogue"}</span>
                      <a href={routeHref(`/product/${product.id}`)}><h3>{product.name}</h3></a>
                      <strong>{productPrice(product)}</strong>
                      <div className="sc-assistant-product__actions">
                        {product.purchasable ? <button type="button" onClick={() => onAdd(String(product.id), 1)}>Add to cart</button> : null}
                        <a href={routeHref(`/product/${product.id}`)}>View details</a>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {response?.rentals.length ? (
            <section className="sc-assistant-next__results" aria-labelledby="assistant-rentals-title">
              <div className="sc-assistant-next__section-heading"><div><span>Rentals</span><h2 id="assistant-rentals-title">Equipment that matches the request</h2></div><a href={routeHref("/rentals")}>Browse rental fleet</a></div>
              <div className="sc-assistant-next__rental-grid">
                {response.rentals.map((rental) => (
                  <article key={rental.id} className="sc-assistant-rental">
                    <Wrench size={20} aria-hidden="true" />
                    <div><span>Rental option</span><h3>{rental.name || rental.id}</h3></div>
                    <a href={routeHref(`/rental/${rental.id}`)}>Check dates & availability</a>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          {response?.nextActions.length ? (
            <section className="sc-assistant-next__followups" aria-label="Suggested follow-up questions">
              <span>Keep going</span>
              <div>{response.nextActions.map((next) => <button type="button" key={next} onClick={() => { setPrompt(next); void submitPrompt(next); }}>{next}</button>)}</div>
            </section>
          ) : null}
        </section>
      </Container>
    </div>
  );
}