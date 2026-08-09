import { Bot, Send, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import Container from "../components/shared/Container";
import mascot from "../assets/brand/mascot-illustrated.jpeg";
import {
  advisorPrompts,
  getAdvisorResponse,
  type AdvisorUiResult,
} from "../lib/advisor";
import { routeHref } from "../lib/router";

const prompts = [
  "I need a generator for my farm.",
  "I need an excavator tomorrow.",
  "My pressure washer stopped working.",
];

export default function AssistantPage({
  initialPrompt = "",
}: {
  initialPrompt?: string;
}) {
  const [prompt, setPrompt] = useState(initialPrompt || prompts[0]);
  const [response, setResponse] = useState<AdvisorUiResult | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");

  const submitPrompt = async (nextPrompt: string) => {
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

  useEffect(() => {
    void submitPrompt(initialPrompt || prompts[0]);
  }, [initialPrompt]);

  const recommendationItems = response
    ? [
        ...response.products.map((item) => item.name),
        ...response.rentals.map((item) => item.name || item.id),
      ]
    : [];

  const action = response?.rentals.length ? "/rentals" : "/products";
  const actionLabel = response?.rentals.length
    ? "View Rental Fleet"
    : "View Product Catalog";

  return (
    <div className="demo-page demo-ai-page">
      <section className="demo-page-hero">
        <Container>
          <span>AI Shopping Assistant</span>
          <h1>Describe the job. We will guide the next move.</h1>
          <p>Grounded assistant responses from connected provider data only.</p>
        </Container>
      </section>
      <Container className="demo-ai-layout">
        <aside>
          <img src={mascot} alt="Total Tools AI expert" />
          <h2>Ask Total Tools AI</h2>
          <p>
            Built to connect customer intent with the full Total Tools service
            offering.
          </p>
        </aside>
        <section className="demo-chat">
          <div className="demo-chat__prompts">
            {prompts.map((item, index) => (
              <button
                onClick={() => {
                  const next = advisorPrompts[index] || item;
                  setPrompt(next);
                  void submitPrompt(next);
                }}
                key={item}
              >
                {item}
              </button>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submitPrompt(prompt);
            }}
          >
            <input
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              aria-label="Ask Total Tools AI"
            />
            <button disabled={status === "loading"}>
              <Send size={18} /> {status === "loading" ? "Asking..." : "Ask"}
            </button>
          </form>
          <article className="demo-ai-answer">
            <div>
              <Bot size={22} />
              <span>Provider-grounded response</span>
            </div>
            <h2>
              {status === "error"
                ? "Assistant unavailable"
                : "Operational recommendation"}
            </h2>
            <p>
              {status === "error"
                ? `${error}. Verify provider connectivity and retry.`
                : response?.summary ||
                  "Submit a request to receive connected recommendations."}
            </p>
            <ul>
              {recommendationItems.length ? (
                recommendationItems.map((item) => (
                  <li key={item}>
                    <Sparkles size={15} /> {item}
                  </li>
                ))
              ) : (
                <li>
                  <Sparkles size={15} /> No recommendations returned by the
                  connected provider.
                </li>
              )}
            </ul>
            <a href={routeHref(action)}>{actionLabel}</a>
          </article>
        </section>
      </Container>
    </div>
  );
}
