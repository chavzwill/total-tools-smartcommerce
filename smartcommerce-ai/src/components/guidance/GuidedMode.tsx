import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleHelp, MousePointer2, Search, Sparkles, X } from "lucide-react";
import { go } from "../../lib/router";

type Target = {
  selector?: string;
  text?: string;
  ariaLabel?: string;
};

type GuideStep = {
  id: string;
  title: string;
  instruction: string;
  target?: Target;
  route?: string;
  advanceOnClick?: boolean;
};

type GuideFlow = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  steps: GuideStep[];
};

type HighlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const OPEN_GUIDED_MODE_EVENT = "smartcommerce:guided-mode-open";

const flows: GuideFlow[] = [
  {
    id: "find-product",
    title: "Find a product",
    description: "Search the catalogue by product, model, category, or job.",
    keywords: ["find product", "search product", "look for", "buy", "product", "item", "tool"],
    steps: [
      {
        id: "product-search",
        title: "Use the main search",
        instruction: "Click the search field, then type the product, model, category, or job you are looking for.",
        target: { selector: "#v2-global-search" },
        advanceOnClick: true,
      },
      {
        id: "product-submit",
        title: "Run the search",
        instruction: "Click Search to see matching products. You can then filter and open the product you want.",
        target: { selector: ".v2-search-submit" },
      },
    ],
  },
  {
    id: "start-repair",
    title: "Start a repair",
    description: "Open repairs and complete a service or repair request step by step.",
    keywords: ["repair", "service", "fix", "work order", "work-order", "technician", "machine repair", "equipment repair", "send repair request"],
    steps: [
      {
        id: "repair-nav",
        title: "Open Repairs",
        instruction: "Click Repair in the top navigation to open the repair and service workspace.",
        target: { text: "Repair", selector: ".v2-header__nav a" },
        advanceOnClick: true,
      },
      {
        id: "repair-equipment",
        title: "Identify the equipment",
        instruction: "Click here and enter the type of equipment being repaired, such as Pressure washer, Generator, Drill, or Compressor.",
        route: "/repairs",
        target: { selector: "#repair-equipment" },
      },
      {
        id: "repair-model",
        title: "Add the model or serial number",
        instruction: "Enter the model or serial number if you know it. You can leave this blank when the number is unavailable.",
        route: "/repairs",
        target: { selector: "#repair-model" },
      },
      {
        id: "repair-issue",
        title: "Describe what is happening",
        instruction: "Describe the symptoms in plain language—what the machine does, sounds like, smells like, leaks, displays, or fails to do. You do not need to diagnose the failed part yourself.",
        route: "/repairs",
        target: { selector: "#repair-issue" },
      },
      {
        id: "repair-branch",
        title: "Choose a service branch",
        instruction: "Select the Total Tools branch where you would prefer the equipment to be handled, or leave No preference selected.",
        route: "/repairs",
        target: { selector: "#repair-branch" },
      },
      {
        id: "repair-date",
        title: "Choose a preferred date",
        instruction: "Choose a preferred date if you have one. The service team will confirm actual intake timing.",
        route: "/repairs",
        target: { selector: "#repair-date" },
      },
      {
        id: "repair-contact",
        title: "Add your contact information",
        instruction: "Enter the phone number or email address the service team should use to contact you.",
        route: "/repairs",
        target: { selector: "#repair-contact" },
      },
      {
        id: "repair-submit",
        title: "Send the repair request",
        instruction: "Review the information above. When everything looks correct, click Send repair request. If you are not signed in, SmartCommerce will save the draft and take you to your account first.",
        route: "/repairs",
        target: { selector: "#repair-submit" },
      },
    ],
  },
  {
    id: "rent-equipment",
    title: "Rent equipment",
    description: "Open rentals and choose equipment by job, branch, and availability.",
    keywords: ["rent", "rental", "hire equipment", "book equipment", "reserve equipment"],
    steps: [
      {
        id: "rent-nav",
        title: "Open Rentals",
        instruction: "Click Rent in the top navigation.",
        target: { text: "Rent", selector: ".v2-header__nav a" },
        advanceOnClick: true,
      },
      {
        id: "rent-page",
        title: "Choose your rental",
        instruction: "Select the equipment, branch, dates, and quantity you need from the rentals workspace.",
        route: "/rentals",
        target: { selector: "main" },
      },
    ],
  },
  {
    id: "account",
    title: "Open or manage an account",
    description: "Sign in, create an account, or manage an existing customer account.",
    keywords: ["account", "sign in", "login", "log in", "register", "create account", "profile"],
    steps: [
      {
        id: "account-button",
        title: "Open Account",
        instruction: "Click Account at the top of the screen to sign in, create an account, or manage your profile.",
        target: { selector: ".v2-account-action" },
      },
    ],
  },
  {
    id: "checkout",
    title: "Go to checkout",
    description: "Open the cart and continue toward checkout.",
    keywords: ["checkout", "pay", "cart", "purchase", "complete order", "place order"],
    steps: [
      {
        id: "cart-button",
        title: "Open your cart",
        instruction: "Click Cart to review your items and continue to checkout.",
        target: { selector: ".v2-cart" },
      },
    ],
  },
  {
    id: "commercial",
    title: "Get commercial support",
    description: "Open contractor, business-account, and quote support.",
    keywords: ["commercial", "business", "contractor", "quote", "quotation", "business account"],
    steps: [
      {
        id: "commercial-nav",
        title: "Open Commercial",
        instruction: "Click Commercial in the top navigation for business, contractor, and quote support.",
        target: { text: "Commercial", selector: ".v2-header__nav a" },
      },
    ],
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function scoreFlow(flow: GuideFlow, query: string) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;
  let score = 0;
  for (const keyword of flow.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedQuery === normalizedKeyword) score += 12;
    else if (normalizedQuery.includes(normalizedKeyword)) score += 7;
    else {
      const queryWords = new Set(normalizedQuery.split(" "));
      const overlap = normalizedKeyword.split(" ").filter((word) => queryWords.has(word)).length;
      score += overlap * 2;
    }
  }
  return score;
}

function visible(element: HTMLElement) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function findTarget(target?: Target): HTMLElement | null {
  if (!target) return null;
  const candidates = target.selector
    ? Array.from(document.querySelectorAll<HTMLElement>(target.selector))
    : Array.from(document.querySelectorAll<HTMLElement>("a,button,input,select,textarea,[role='button'],[role='link']"));

  return candidates.find((element) => {
    if (!visible(element)) return false;
    if (target.ariaLabel) {
      const label = element.getAttribute("aria-label") || "";
      if (!normalize(label).includes(normalize(target.ariaLabel))) return false;
    }
    if (target.text) {
      const text = element.textContent || "";
      if (!normalize(text).includes(normalize(target.text))) return false;
    }
    return true;
  }) || null;
}

function rectFor(element: HTMLElement): HighlightRect {
  const rect = element.getBoundingClientRect();
  const padding = 8;
  return {
    top: Math.max(8, rect.top - padding),
    left: Math.max(8, rect.left - padding),
    width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
    height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
  };
}

export function openGuidedMode(query = "") {
  window.dispatchEvent(new CustomEvent(OPEN_GUIDED_MODE_EVENT, { detail: { query } }));
}

export default function GuidedMode() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [flow, setFlow] = useState<GuideFlow | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<HighlightRect | null>(null);
  const [targetFound, setTargetFound] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const step = flow?.steps[stepIndex] || null;
  const suggested = useMemo(() => flows.slice(0, 5), []);

  const close = useCallback(() => {
    setOpen(false);
    setFlow(null);
    setStepIndex(0);
    setRect(null);
    setTargetFound(false);
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const nextQuery = String((event as CustomEvent<{ query?: string }>).detail?.query || "");
      setOpen(true);
      setQuery(nextQuery);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    };
    window.addEventListener(OPEN_GUIDED_MODE_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_GUIDED_MODE_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!step) {
      setRect(null);
      setTargetFound(false);
      return;
    }

    if (step.route) {
      const current = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
      if (current !== step.route) go(step.route);
    }

    let cancelled = false;
    let targetElement: HTMLElement | null = null;

    const updateTarget = () => {
      if (cancelled) return;
      targetElement = findTarget(step.target);
      setTargetFound(Boolean(targetElement));
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        setRect(rectFor(targetElement));
      } else {
        setRect(null);
      }
    };

    const timer = window.setTimeout(updateTarget, step.route ? 180 : 20);
    const interval = window.setInterval(updateTarget, 700);
    const onResize = () => updateTarget();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);

    const onClick = (event: MouseEvent) => {
      if (!step.advanceOnClick || !targetElement) return;
      if (targetElement === event.target || targetElement.contains(event.target as Node)) {
        window.setTimeout(() => setStepIndex((current) => Math.min(current + 1, (flow?.steps.length || 1) - 1)), 120);
      }
    };
    document.addEventListener("click", onClick, true);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearInterval(interval);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      document.removeEventListener("click", onClick, true);
    };
  }, [step, flow]);

  function startGuide(selected: GuideFlow) {
    setFlow(selected);
    setStepIndex(0);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const ranked = flows
      .map((candidate) => ({ candidate, score: scoreFlow(candidate, query) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0]?.score > 0) startGuide(ranked[0].candidate);
    else setFlow(null);
  }

  const next = () => {
    if (!flow) return;
    if (stepIndex >= flow.steps.length - 1) return close();
    setStepIndex((current) => current + 1);
  };

  const previous = () => setStepIndex((current) => Math.max(0, current - 1));

  return (
    <>
      <button className="tt-guided-launcher" type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>
        <CircleHelp size={18} aria-hidden="true" />
        <span>Guided Mode</span>
      </button>

      {open ? (
        <div className="tt-guided-layer" aria-live="polite">
          {rect && step ? (
            <div
              className="tt-guided-spotlight"
              aria-hidden="true"
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
          ) : null}

          <section className={flow ? "tt-guided-panel is-guiding" : "tt-guided-panel"} role="dialog" aria-modal="false" aria-labelledby="tt-guided-title">
            <button className="tt-guided-close" type="button" onClick={close} aria-label="Close Guided Mode"><X size={18} /></button>

            {!flow ? (
              <>
                <div className="tt-guided-heading">
                  <span><Sparkles size={17} aria-hidden="true" /> Guided Mode</span>
                  <h2 id="tt-guided-title">What do you want to do?</h2>
                  <p>Describe the task in your own words. I’ll show you where to click and what to do next.</p>
                </div>
                <form className="tt-guided-search" onSubmit={submit}>
                  <Search size={19} aria-hidden="true" />
                  <label className="tt-sr-only" htmlFor="tt-guided-query">Describe what you want to do</label>
                  <input ref={inputRef} id="tt-guided-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Example: I want to start a repair" autoComplete="off" />
                  <button type="submit">Guide me</button>
                </form>
                {query.trim() && !flows.some((candidate) => scoreFlow(candidate, query) > 0) ? (
                  <p className="tt-guided-no-match">I don’t have a guided path for that task yet. Try Repairs, Rentals, Product Search, Account, Checkout, or Commercial.</p>
                ) : null}
                <div className="tt-guided-suggestions" aria-label="Suggested guided tasks">
                  {suggested.map((candidate) => (
                    <button key={candidate.id} type="button" onClick={() => startGuide(candidate)}>
                      <strong>{candidate.title}</strong>
                      <span>{candidate.description}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : step ? (
              <>
                <div className="tt-guided-heading">
                  <span><MousePointer2 size={17} aria-hidden="true" /> {flow.title}</span>
                  <h2 id="tt-guided-title">{step.title}</h2>
                  <p>{step.instruction}</p>
                </div>
                <div className="tt-guided-progress" aria-label={`Step ${stepIndex + 1} of ${flow.steps.length}`}>
                  <span>Step {stepIndex + 1} of {flow.steps.length}</span>
                  <div><i style={{ width: `${((stepIndex + 1) / flow.steps.length) * 100}%` }} /></div>
                </div>
                {!targetFound && step.target ? <p className="tt-guided-status">Opening the right part of the screen…</p> : null}
                <div className="tt-guided-actions">
                  <button type="button" className="is-secondary" onClick={previous} disabled={stepIndex === 0}>Back</button>
                  <button type="button" onClick={next}>{stepIndex === flow.steps.length - 1 ? "Finish" : "Next"}</button>
                </div>
                <button type="button" className="tt-guided-change-task" onClick={() => { setFlow(null); setStepIndex(0); setRect(null); window.setTimeout(() => inputRef.current?.focus(), 0); }}>Choose a different task</button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
