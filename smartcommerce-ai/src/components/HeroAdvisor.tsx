import { Camera, ImageUp, Mic, Search, Sparkles } from "lucide-react";
import { Dispatch, FormEvent, SetStateAction, useRef } from "react";
import { go, routeHref } from "../lib/router";

const examples = [
  "I need a generator for my house",
  "Rent something to dig a trench",
  "My pressure washer needs repair",
  "Compare cordless drills for contractors",
];
const matchTerms = ["match this", "find this", "picture", "photo", "image search", "what is this", "do you have this"];

type Props = {
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  onCommandFocusChange?: (active: boolean) => void;
};

export default function HeroAdvisor({ prompt, setPrompt, onCommandFocusChange }: Props) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  function ask(event: FormEvent) {
    event.preventDefault();
    const value = prompt.trim();
    const normalized = value.toLowerCase();
    if (matchTerms.some((term) => normalized.includes(term))) return go("/product-match");
    if (normalized.includes("repair")) return go("/repairs");
    if (normalized.includes("rent ") || normalized.includes("rental")) return go(`/rentals?q=${encodeURIComponent(value)}`);
    go(`/assistant?prompt=${encodeURIComponent(value || "Help me choose what I need for this job")}`);
  }

  return (
    <div
      className="hero-advisor hero-advisor--integrated"
      onFocusCapture={() => onCommandFocusChange?.(true)}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        onCommandFocusChange?.(false);
      }}
    >
      <span className="sc-command-status"><span aria-hidden="true" /> Commerce intelligence ready</span>
      <form className="advisor-input-row" onSubmit={ask}>
        <Search size={20} aria-hidden="true" />
        <label className="tt-sr-only" htmlFor="hero-ai-input">What are you working on today?</label>
        <input id="hero-ai-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="What are you working on today?" autoComplete="off" />
        <button type="button" className="advisor-media-button" title="Find from a photo" onClick={() => uploadRef.current?.click()}><ImageUp size={19} /><span className="tt-sr-only">Upload photo</span></button>
        <button type="button" className="advisor-media-button" title="Use camera" onClick={() => cameraRef.current?.click()}><Camera size={19} /><span className="tt-sr-only">Use camera</span></button>
        <button type="button" className="advisor-media-button" title="Voice-assisted search" onClick={() => go("/assistant?prompt=Help%20me%20search%20by%20voice")}><Mic size={19} /><span className="tt-sr-only">Voice-assisted search</span></button>
        <button type="submit" className="advisor-ask-button"><Sparkles size={17} /> Ask SmartCommerce</button>
        <input ref={uploadRef} type="file" accept="image/*" hidden onChange={() => go("/product-match?source=upload")} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={() => go("/product-match?source=camera")} />
      </form>
      <div className="advisor-examples" aria-label="Example requests">
        {examples.slice(0, 3).map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}
      </div>
      <div className="sc-command-secondary">
        <a href={routeHref("/products")}>Browse products</a>
        <a href={routeHref("/product-match")}>Find from photo</a>
        <a href={routeHref("/categories")}>Browse categories</a>
      </div>
    </div>
  );
}
