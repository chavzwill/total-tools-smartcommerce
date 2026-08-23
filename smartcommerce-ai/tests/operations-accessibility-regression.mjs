import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(new URL("../src/components/operations/OperationsWorkspace.tsx", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles/operations-workspace.css", import.meta.url), "utf8");

assert.match(workspace, /sc-ops-skip-link[\s\S]*#operations-main-content/, "Operations must provide a keyboard skip link");
assert.match(workspace, /aria-label=\{item\.label\}/, "collapsed icon-only Operations navigation must retain accessible names");
assert.match(workspace, /aria-label="Operations sections"/, "Operations navigation must have a semantic label");
assert.match(workspace, /id="operations-main-content" tabIndex=\{-1\}/, "skip target must be programmatically focusable");
assert.match(styles, /\.sc-ops-shell button:focus-visible[\s\S]*outline: 3px solid var\(--sc-brand-yellow\)/, "Operations controls need a visible high-contrast keyboard focus indicator");
assert.match(styles, /env\(safe-area-inset-bottom\)/, "mobile Operations navigation must respect device safe areas");
assert.match(styles, /overflow-x: auto/, "dense operational tables/navigation must remain horizontally usable on small screens");
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.sc-ops-spin \{ animation: none; \}/, "Operations must disable nonessential animation for reduced-motion users");

console.log("Operations accessibility regression gate passed.");
