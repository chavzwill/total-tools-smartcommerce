import { Camera, ImageUp, Mic, Search, Sparkles } from "lucide-react";
import { Dispatch, FormEvent, SetStateAction, useRef } from "react";
import { go } from "../lib/router";

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
    if (normalized.includes("repair")) return go(`/repairs?equipment=${encodeURIComponent(value)}`);
    if (normalized.includes("rent ") || normalized.includes("rental")) return go(`/rentals?q=${encodeURIComponent(value)}`);
    go(`/assistant?prompt=${encodeURIComponent(value || "Help me choose what I need for this job")}`);
  }

  return (
    <div className="v2-command" onFocusCapture={() => onCommandFocusChange?.(true)} onBlurCapture={(event) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      onCommandFocusChange?.(false);
    }}>
      <form className="v2-command__form" onSubmit={ask}>
        <Search size={22} aria-hidden="true" />
        <label className="tt-sr-only" htmlFor="hero-ai-input">What are you working on today?</label>
        <input id="hero-ai-input" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe the job, product, or problem…" autoComplete="off" />
        <div className="v2-command__tools">
          <button type="button" title="Find from a photo" onClick={() => uploadRef.current?.click()}><ImageUp size={19} /><span className="tt-sr-only">Upload photo</span></button>
          <button type="button" title="Use camera" onClick={() => cameraRef.current?.click()}><Camera size={19} /><span className="tt-sr-only">Use camera</span></button>
          <button type="button" title="Voice-assisted search" onClick={() => go("/assistant?prompt=Help%20me%20search%20by%20voice")}><Mic size={19} /><span className="tt-sr-only">Voice-assisted search</span></button>
        </div>
        <button type="submit" className="v2-command__submit"><Sparkles size={17} /> Ask SmartCommerce</button>
        <input ref={uploadRef} type="file" accept="image/*" hidden onChange={() => go("/product-match?source=upload")} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={() => go("/product-match?source=camera")} />
      </form>
      <div className="v2-command__hint"><span>Natural search</span><span>Photo match</span><span>Voice-assisted</span><span>Live data when connected</span></div>
    </div>
  );
}
