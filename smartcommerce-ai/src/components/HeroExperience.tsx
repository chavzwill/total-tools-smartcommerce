import { Bolt, Construction, Plug, Wrench } from "lucide-react";
import { useState } from "react";
import mascot from "../assets/brand/mascot-illustrated.jpeg";
import HeroAdvisor from "./HeroAdvisor";

export default function HeroExperience() {
  const [prompt, setPrompt] = useState("");
  const examples = [
    { text: "Generator for my farm", icon: Bolt },
    { text: "Rent an excavator", icon: Construction },
    { text: "Book a repair", icon: Wrench },
    { text: "Find electrical supplies", icon: Plug }
  ];
  return (
    <section className="hero hero--branch" id="top">
      <div className="hero-showcase">
        <div className="hero-copy">
          <h1>At Total Tools,<br /><em>We Almost Always Have It.</em></h1>
          <h2>Ask AI. Find it. Rent it. Repair it.</h2>
          <p>Search products, rent heavy equipment, book repairs, or ask our AI guide to recommend exactly what you need.</p>
          <HeroAdvisor prompt={prompt} setPrompt={setPrompt} />
        </div>
        <div className="mascot-stage" aria-label="Total Tools AI guide">
          <img src={mascot} alt="Total Tools AI guide carrying professional tools" />
          <aside className="mascot-ai-panel">
            <span>Total Tools AI</span>
            <h2>What are you working on today?</h2>
            <p>I can help you find the right tools, equipment, or services.</p>
            <div>{examples.map(({ text, icon: Icon }) => <button key={text} onClick={() => setPrompt(text)}><Icon size={15} /> {text}</button>)}</div>
          </aside>
        </div>
      </div>
    </section>
  );
}
