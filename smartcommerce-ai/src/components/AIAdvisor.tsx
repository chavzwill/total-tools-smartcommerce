import { useState } from "react";
import generatorImage from "../assets/generator-recommendation.png";
import { advisorPrompts, getAdvisorResponse, type AdvisorUiResult } from "../lib/advisor";

type AIAdvisorProps = { variant?: "hero" | "section" };

const consultantPrompts = [
  "Need a generator for my farm",
  "Find this from a picture",
  "Book a concrete mixer",
  "Repair my pressure washer",
  "Need garbage bags",
  "Need safety gear"
];

export default function AIAdvisor({ variant = "section" }: AIAdvisorProps) {
  const [prompt, setPrompt] = useState(advisorPrompts[0]);
  const [response, setResponse] = useState<AdvisorUiResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const product = response?.products[0];

  const submitPrompt = async (nextPrompt = prompt) => {
    setStatus("loading");
    setError("");
    const result = await getAdvisorResponse(nextPrompt);

    if (!result.success) {
      setStatus("error");
      setResponse(null);
      setError(result.error.message);
      return;
    }

    setStatus("idle");
    setResponse(result.data);
  };

  return (
    <section className={variant === "hero" ? "consultant" : "advisor-section"} id="advisor" aria-label="Total Tools AI Advisor">
      <header className="consultant-header">
        <div className="ai-mark" aria-hidden="true">AI</div>
        <div><span>Total Tools intelligence</span><h2>Meet Total Tools AI</h2></div>
        <div className="advisor-status">Ready</div>
      </header>
      <div className="consultant-question">
        <label htmlFor="advisor-prompt">What are you working on today?</label>
        <div className="prompt-field">
          <textarea id="advisor-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} />
          <button type="button" aria-label="Submit request" onClick={() => void submitPrompt()}>
            {status === "loading" ? "..." : "->"}
          </button>
        </div>
      </div>
      <div className="suggestion-chips" aria-label="Suggested requests">
        {consultantPrompts.map((item, index) => (
          <button
            className={index === 0 ? "active" : ""}
            key={item}
            onClick={() => {
              const nextPrompt = index < advisorPrompts.length ? advisorPrompts[index] : item;
              setPrompt(nextPrompt);
              void submitPrompt(nextPrompt);
            }}
          >
            {item}
          </button>
        ))}
      </div>
      {status === "error" && (
        <p role="status">Assistant unavailable: {error}. Verify provider connectivity and retry.</p>
      )}
      {response && !response.products.length && !response.rentals.length && (
        <p role="status">{response.summary}</p>
      )}
      {product && (
        <article className="ai-recommendation">
          <img src={generatorImage} alt="Portable site generator recommended by Total Tools AI" />
          <div className="recommendation-copy">
            <span className="recommendation-label">AI recommended</span>
            <h3>{product.name}</h3>
            <p>{response.summary}</p>
            <div className="recommendation-meta">
              <strong>
                $
                {(
                  product.pricing?.find((value) => value.salePrice !== undefined)
                    ?.salePrice ??
                  product.pricing?.find((value) => value.listPrice !== undefined)
                    ?.listPrice ??
                  0
                ).toLocaleString()}
              </strong>
              <span>{product.active ? "Active" : "Inactive"}</span>
            </div>
          </div>
        </article>
      )}
      <footer className="consultant-footer">
        <span>
          {response
            ? `${response.products.length + response.rentals.length} matched recommendations`
            : "No recommendations yet"}
        </span>
        <a href="#products">View full recommendation {"->"}</a>
      </footer>
    </section>
  );
}
