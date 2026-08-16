import { Camera, Construction, Sparkles, Wrench, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import mascot from "../assets/brand/mascot-3d.jpeg";
import shopImage from "../assets/services/shop-products.jpg";
import rentalImage from "../assets/services/equipment-rentals.jpg";
import repairImage from "../assets/services/repairs-service.jpg";
import { routeHref } from "../lib/router";
import HeroAdvisor from "./HeroAdvisor";

const scenes = [
  { id: "shop", label: "SHOP", title: "The Right Tool. Right Now.", detail: "Search by product, model, specification, or the job you need to finish.", href: "/products", cta: "Shop products", image: shopImage },
  { id: "rent", label: "RENT", title: "Rent the Right Machine.", detail: "Plan equipment around the job, dates, branch, pickup, or delivery.", href: "/rentals", cta: "Plan a rental", image: rentalImage },
  { id: "repair", label: "REPAIR", title: "Fix What You Own.", detail: "Identify the machine, describe the problem, and start a service request.", href: "/repairs", cta: "Start a repair", image: repairImage },
  { id: "ai", label: "ASK AI", title: "Tell Us the Job.", detail: "Describe what you are trying to accomplish, use a photo, or ask for guidance.", href: "/assistant", cta: "Ask SmartCommerce", image: mascot },
] as const;

const examples = [
  ["I need a generator for my house", Zap],
  ["Rent something to dig a trench", Construction],
  ["My pressure washer needs repair", Wrench],
  ["Find this part from a photo", Camera],
] as const;

const proof = [
  ["BUY", "Product catalogue"],
  ["RENT", "Equipment planning"],
  ["REPAIR", "Service intake"],
  ["ASK", "AI guidance"],
] as const;

export default function HeroExperienceV3() {
  const [prompt, setPrompt] = useState("");
  const [focused, setFocused] = useState(false);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (paused || focused || reducedMotion) return;
    const timer = window.setInterval(() => setSceneIndex((current) => (current + 1) % scenes.length), 6200);
    return () => window.clearInterval(timer);
  }, [focused, paused, reducedMotion]);

  const active = scenes[sceneIndex];

  return (
    <section className={`v3-hero ${focused ? "is-command-active" : ""}`} id="top" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="v3-hero__backdrop" aria-hidden="true">
        {scenes.map((scene, index) => <img key={scene.id} src={scene.image} alt="" className={index === sceneIndex ? "is-active" : ""} />)}
        <span />
      </div>
      <div className="v3-hero__inner">
        <div className="v3-hero__content">
          <span className="v3-hero__eyebrow"><Sparkles size={15} /> TOTAL TOOLS × SMARTCOMMERCE</span>
          <h1>One Job.<br /><em>Every Option.</em></h1>
          <p>Buy it. Rent it. Repair it. Or describe the job and let SmartCommerce help you find the right path.</p>
          <HeroAdvisor prompt={prompt} setPrompt={setPrompt} onCommandFocusChange={setFocused} />
          <div className="v3-hero__examples">
            {examples.map(([text, Icon]) => <button type="button" key={text} onClick={() => setPrompt(text)}><Icon size={15} />{text}</button>)}
          </div>
          <div className="v3-hero__proof" aria-label="SmartCommerce capabilities">
            {proof.map(([label, detail]) => <div key={label}><strong>{label}</strong><span>{detail}</span></div>)}
          </div>
        </div>
        <aside className="v3-hero__scene">
          <div className="v3-hero__scene-card">
            <span>{active.label}</span>
            <h2>{active.title}</h2>
            <p>{active.detail}</p>
            <a href={routeHref(active.href)}>{active.cta}</a>
          </div>
          <div className="v3-hero__tabs" role="tablist" aria-label="Choose commerce mode">
            {scenes.map((scene, index) => <button key={scene.id} type="button" className={index === sceneIndex ? "is-active" : ""} onClick={() => setSceneIndex(index)} role="tab" aria-selected={index === sceneIndex}><span>{String(index + 1).padStart(2, "0")}</span><strong>{scene.label}</strong></button>)}
          </div>
        </aside>
      </div>
    </section>
  );
}
