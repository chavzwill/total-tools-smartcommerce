import { Bolt, Construction, Camera, Wrench } from "lucide-react";
import { useState } from "react";
import mascot from "../assets/brand/mascot-illustrated.jpeg";
import HeroAdvisor from "./HeroAdvisor";

export default function HeroExperience() {
  const [prompt, setPrompt] = useState("");
  const [commandFocused, setCommandFocused] = useState(false);
  const examples = [
    { text: "I need a generator for my house", icon: Bolt },
    { text: "Rent something to dig a trench", icon: Construction },
    { text: "My pressure washer needs repair", icon: Wrench },
    { text: "Find this part from a photo", icon: Camera },
  ];

  return (
    <section className={`hero hero--branch sc-command-hero ${commandFocused ? "hero--command-active" : ""}`} id="top">
      <div className="hero-showcase">
        <div className="hero-copy">
          <span className="sc-command-hero__eyebrow">Total Tools + SmartCommerce AI</span>
          <h1>Get the job moving.<br /><em>Even when you do not know the exact item.</em></h1>
          <h2>Search it. Ask it. Rent it. Repair it.</h2>
          <p>Start with a product name, a job description, a photo, or a service need. SmartCommerce routes you to the fastest useful next step.</p>
          <HeroAdvisor prompt={prompt} setPrompt={setPrompt} onCommandFocusChange={setCommandFocused} />
        </div>
        <div className="mascot-stage" aria-label="Total Tools SmartCommerce guide">
          <img src={mascot} alt="Total Tools SmartCommerce guide carrying professional tools" />
          <aside className="mascot-ai-panel">
            <span>SmartCommerce ready</span>
            <h2>What are you working on today?</h2>
            <p>Choose an example or describe the job in your own words.</p>
            <div>
              {examples.slice(0, 3).map(({ text, icon: Icon }) => (
                <button key={text} onClick={() => setPrompt(text)}><Icon size={15} /> {text}</button>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
