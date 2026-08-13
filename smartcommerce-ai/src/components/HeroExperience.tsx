import { Camera, Construction, Sparkles, Wrench, Zap } from "lucide-react";
import { useState } from "react";
import mascot from "../assets/brand/mascot-illustrated.jpeg";
import { routeHref } from "../lib/router";
import HeroAdvisor from "./HeroAdvisor";

const examples = [
  { text: "I need a generator for my house", icon: Zap },
  { text: "Rent something to dig a trench", icon: Construction },
  { text: "My pressure washer needs repair", icon: Wrench },
  { text: "Find this part from a photo", icon: Camera },
];

export default function HeroExperience() {
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <section className={`v2-hero ${focused ? "is-command-active" : ""}`} id="top">
      <div className="v2-hero__ambient" aria-hidden="true" />
      <div className="v2-hero__inner">
        <div className="v2-hero__content">
          <span className="v2-eyebrow"><Sparkles size={15} /> SmartCommerce by Total Tools</span>
          <h1>Start with the job.<br /><em>We’ll help with the rest.</em></h1>
          <p className="v2-hero__lede">Search exactly what you know—or describe what you’re trying to accomplish. SmartCommerce connects products, rentals, repairs, and commercial support in one place.</p>

          <HeroAdvisor prompt={prompt} setPrompt={setPrompt} onCommandFocusChange={setFocused} />

          <div className="v2-hero__examples" aria-label="Example requests">
            {examples.map(({ text, icon: Icon }) => <button type="button" key={text} onClick={() => setPrompt(text)}><Icon size={15} /> {text}</button>)}
          </div>

          <div className="v2-hero__proof">
            <a href={routeHref("/products")}><strong>Buy</strong><span>Find the right product</span></a>
            <a href={routeHref("/rentals")}><strong>Rent</strong><span>Plan around the job</span></a>
            <a href={routeHref("/repairs")}><strong>Repair</strong><span>Get equipment moving again</span></a>
            <a href={routeHref("/commercial")}><strong>Commercial</strong><span>Support bigger requirements</span></a>
          </div>
        </div>

        <aside className="v2-hero__visual" aria-label="SmartCommerce guide">
          <div className="v2-hero__image-wrap"><img src={mascot} alt="Total Tools SmartCommerce guide" /></div>
          <div className="v2-hero__visual-card v2-hero__visual-card--top">
            <span>One request</span>
            <strong>Products · Rentals · Repairs</strong>
          </div>
          <div className="v2-hero__visual-card v2-hero__visual-card--bottom">
            <span>Need help choosing?</span>
            <strong>Ask SmartCommerce</strong>
          </div>
        </aside>
      </div>
    </section>
  );
}
