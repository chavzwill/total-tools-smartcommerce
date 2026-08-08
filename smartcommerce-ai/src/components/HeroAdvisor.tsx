import { Camera, ImageUp, Mic, Search, Sparkles } from "lucide-react";
import { Dispatch, FormEvent, SetStateAction, useRef } from "react";
import { go } from "../lib/router";

const examples = [
  "Best generator for home backup",
  "Rent an excavator",
  "Book a repair for my pressure washer",
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
    const value = prompt.trim().toLowerCase();
    if (matchTerms.some((term) => value.includes(term))) return go("/product-match");
    if (value.includes("repair")) return go("/repairs");
    go(`/assistant?prompt=${encodeURIComponent(prompt || "I need help choosing the right product")}`);
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
      <form className="advisor-input-row" onSubmit={ask}>
        <Search size={20} aria-hidden="true" />
        <label className="tt-sr-only" htmlFor="hero-ai-input">Tell us what you need</label>
        <input id="hero-ai-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Tell us what you need..." />
        <button type="button" className="advisor-media-button" title="Upload photo" onClick={() => uploadRef.current?.click()}><ImageUp size={19} /><span className="tt-sr-only">Upload photo</span></button>
        <button type="button" className="advisor-media-button" title="Use camera" onClick={() => cameraRef.current?.click()}><Camera size={19} /><span className="tt-sr-only">Use camera</span></button>
        <button type="button" className="advisor-media-button" title="Start voice search" onClick={() => go("/assistant?prompt=Voice%20search%20demo")}><Mic size={19} /><span className="tt-sr-only">Voice search</span></button>
        <button type="submit" className="advisor-ask-button"><Sparkles size={17} /> Ask AI</button>
        <input ref={uploadRef} type="file" accept="image/*" hidden onChange={() => go("/product-match?source=upload")} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={() => go("/product-match?source=camera")} />
      </form>
      <div className="advisor-examples" aria-label="Example searches">{examples.map((example) => <button key={example} onClick={() => setPrompt(example)}>{example}</button>)}</div>
      <a className="hero-browse-link" href="#/products">Browse Products</a>
    </div>
  );
}
