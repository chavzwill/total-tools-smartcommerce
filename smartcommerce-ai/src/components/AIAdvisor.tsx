import { useMemo, useState } from "react";
import generatorImage from "../assets/generator-recommendation.png";
import { demoPrompts, getAdvisorResponse } from "../lib/advisor";

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
  const [prompt, setPrompt] = useState(demoPrompts[0]);
  const response = useMemo(() => getAdvisorResponse(prompt), [prompt]);
  const product = response.recommendedProducts[0];

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
          <button type="button" aria-label="Submit request">{"->"}</button>
        </div>
      </div>
      <div className="suggestion-chips" aria-label="Suggested requests">
        {consultantPrompts.map((item, index) => (
          <button className={index === 0 ? "active" : ""} key={item} onClick={() => setPrompt(index < demoPrompts.length ? demoPrompts[index] : item)}>{item}</button>
        ))}
      </div>
      {product && (
        <article className="ai-recommendation">
          <img src={generatorImage} alt="Portable site generator recommended by Total Tools AI" />
          <div className="recommendation-copy">
            <span className="recommendation-label">AI recommended</span>
            <h3>{product.name}</h3>
            <p>{response.needSummary}</p>
            <div className="recommendation-meta"><strong>${product.price.toLocaleString()}</strong><span>{product.stockStatus}</span></div>
          </div>
        </article>
      )}
      <footer className="consultant-footer">
        <span>{response.addOns.length} matched accessories</span>
        <a href="#products">View full recommendation {"->"}</a>
      </footer>
    </section>
  );
}
