import { Bot, Send, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import Container from "../components/shared/Container";
import mascot from "../assets/brand/mascot-illustrated.jpeg";
import { products } from "../data/products";
import { rentals } from "../data/rentals";
import { money } from "../lib/format";
import { routeHref } from "../lib/router";

const prompts = ["I need a generator for my farm.", "I need an excavator tomorrow.", "My pressure washer stopped working."];

function responseFor(prompt: string) {
  const text = prompt.toLowerCase();
  if (text.includes("excavator") || text.includes("rent")) return { title: "An excavator is available tomorrow", summary: "The CAT 320 suits deep excavation and bulk earthmoving. For tighter access, consider the CAT 303.5 CR mini excavator.", items: rentals.filter((item) => item.id === "excavator" || item.id === "skid-steer").map((item) => `${item.name} - ${money(item.dailyRate)}/day`), action: "/rentals", label: "View Rental Fleet" };
  if (text.includes("repair") || text.includes("stopped") || text.includes("pressure washer")) return { title: "Let us diagnose the pressure washer", summary: "Start with a certified inspection. Bring the hose, gun, and power lead so the technician can test the complete system.", items: ["Choose a preferred branch", "Upload a photo of the model plate", "Typical turnaround: 3 to 5 business days"], action: "/repairs", label: "Book a Repair" };
  const generators = products.filter((item) => item.category === "Generators");
  return { title: "Three dependable farm power options", summary: "For pumps, refrigeration, and general farm loads, start with 9,200W to 12,000W and allow headroom for motor startup.", items: [...generators.map((item) => `${item.name} - ${money(item.price)}`), "Add heavy-duty extension leads and fuel cans", "Islandwide delivery is available"], action: "/category/generators", label: "View Generators" };
}

export default function AssistantPage({ initialPrompt = "" }: { initialPrompt?: string }) {
  const [prompt, setPrompt] = useState(initialPrompt || prompts[0]);
  const [submitted, setSubmitted] = useState(initialPrompt || prompts[0]);
  const response = useMemo(() => responseFor(submitted), [submitted]);
  return <div className="demo-page demo-ai-page"><section className="demo-page-hero"><Container><span>AI Shopping Assistant</span><h1>Describe the job. We will guide the next move.</h1><p>A scripted executive demo spanning products, rentals, repairs, and compatible add-ons.</p></Container></section><Container className="demo-ai-layout"><aside><img src={mascot} alt="Total Tools AI expert" /><h2>Ask Total Tools AI</h2><p>Built to connect customer intent with the full Total Tools service offering.</p></aside><section className="demo-chat"><div className="demo-chat__prompts">{prompts.map((item) => <button onClick={() => { setPrompt(item); setSubmitted(item); }} key={item}>{item}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); setSubmitted(prompt); }}><input value={prompt} onChange={(event) => setPrompt(event.target.value)} aria-label="Ask Total Tools AI" /><button><Send size={18} /> Ask</button></form><article className="demo-ai-answer"><div><Bot size={22} /><span>Intelligent demo response</span></div><h2>{response.title}</h2><p>{response.summary}</p><ul>{response.items.map((item) => <li key={item}><Sparkles size={15} /> {item}</li>)}</ul><a href={routeHref(response.action)}>{response.label}</a></article></section></Container></div>;
}
