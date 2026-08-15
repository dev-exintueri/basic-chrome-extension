---
name: Neutral Instrument
description: The repository constitution for the Chrome Extension MV3 Reference Starter Repo — the annotation vocabulary, surface responsibility model, tier criteria, and visual system every Module conforms to.
status: final
created: 2026-08-08
updated: 2026-08-09
colors:
  # Light. Every value below is the literal used in CSS custom properties on :root.
  surface: '#FFFFFF'
  surface-sunken: '#F5F6F7'
  surface-raised: '#FFFFFF'
  border: '#DCE0E5'
  border-strong: '#BFC6CD'
  text: '#1B1F24'
  text-muted: '#5A636D'
  text-faint: '#697079'
  accent: '#1D4ED8'
  accent-soft: '#E8EEFC'
  on-accent: '#FFFFFF'
  success: '#116B3C'
  warning: '#8A5300'
  danger: '#B3261E'
  # The dialog scrim. A colour like any other, and theme-dependent like any other,
  # so it lives here rather than as a literal in a composition root's stylesheet.
  scrim: 'rgba(0, 0, 0, 0.32)'
  # Dark. Redefined under prefers-color-scheme: dark; nothing else changes.
  surface-dark: '#17191C'
  surface-sunken-dark: '#101215'
  surface-raised-dark: '#1E2126'
  border-dark: '#2C3037'
  border-strong-dark: '#454C55'
  text-dark: '#E7EAEE'
  text-muted-dark: '#A6AEB8'
  text-faint-dark: '#8A929B'
  accent-dark: '#8FB2F7'
  accent-soft-dark: '#21304D'
  on-accent-dark: '#12141A'
  success-dark: '#5FD08C'
  warning-dark: '#E2B04A'
  danger-dark: '#F1867E'
  scrim-dark: 'rgba(0, 0, 0, 0.56)'
typography:
  family-ui:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
  family-mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"
  title:
    fontFamily: '{typography.family-ui.fontFamily}'
    fontSize: 15px
    fontWeight: '600'
    lineHeight: '1.35'
  section-label:
    fontFamily: '{typography.family-ui.fontFamily}'
    fontSize: 11px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.06em
  body:
    fontFamily: '{typography.family-ui.fontFamily}'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.5'
  body-strong:
    fontFamily: '{typography.family-ui.fontFamily}'
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.5'
  meta:
    fontFamily: '{typography.family-ui.fontFamily}'
    fontSize: 11px
    fontWeight: '400'
    lineHeight: '1.4'
  mono:
    fontFamily: '{typography.family-mono.fontFamily}'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.5'
  mono-sm:
    fontFamily: '{typography.family-mono.fontFamily}'
    fontSize: 11px
    fontWeight: '400'
    lineHeight: '1.45'
rounded:
  sm: 3px
  DEFAULT: 4px
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  unit: 4px
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  panel-gutter: 12px
  options-gutter: 24px
  row-y: 6px
  control-height: 28px
  panel-min-width: 320px
  options-column: 560px
components:
  button-primary:
    background: '{colors.accent}'
    foreground: '{colors.on-accent}'
    height: '{spacing.control-height}'
    radius: '{rounded.DEFAULT}'
    border: 'none'
  button-secondary:
    background: '{colors.surface}'
    foreground: '{colors.text}'
    height: '{spacing.control-height}'
    radius: '{rounded.DEFAULT}'
    border: '1px solid {colors.border-strong}'
  button-ghost:
    background: 'transparent'
    foreground: '{colors.text-muted}'
    height: '{spacing.control-height}'
    radius: '{rounded.DEFAULT}'
    border: 'none'
  text-input:
    background: '{colors.surface}'
    foreground: '{colors.text}'
    height: '{spacing.control-height}'
    radius: '{rounded.DEFAULT}'
    border: '1px solid {colors.border-strong}'
    typography: '{typography.body}'
  list-row:
    background: 'transparent'
    background-selected: '{colors.accent-soft}'
    foreground: '{colors.text}'
    padding: '{spacing.row-y} {spacing.panel-gutter}'
    marker-selected: '{colors.accent}'
    radius: '{rounded.sm}'
  banner:
    radius: '{rounded.DEFAULT}'
    padding: '{spacing.2} {spacing.3}'
    border-left: '2px solid'
    typography: '{typography.body}'
  badge-tier:
    radius: '{rounded.full}'
    padding: '0 {spacing.2}'
    typography: '{typography.meta}'
    border: '1px solid {colors.border-strong}'
    foreground: '{colors.text-muted}'
  dialog:
    background: '{colors.surface-raised}'
    radius: '{rounded.lg}'
    border: '1px solid {colors.border}'
    shadow: '0 8px 24px rgba(0, 0, 0, 0.18)'
    padding: '{spacing.4}'
  log-row:
    background: 'transparent'
    typography: '{typography.mono-sm}'
    padding: '2px {spacing.panel-gutter}'
    timestamp-foreground: '{colors.text-faint}'
  focus-ring:
    outline: '2px solid {colors.accent}'
    outline-offset: '1px'
---

# DESIGN.md — Neutral Instrument

This is the design document required by **PRD FR-30**. It is the single place every Module conforms to, and it exists before any Module implementation lands.

It carries two things that are usually separate documents, because this repository is not an end-user product:

- **Part A — Repository Conventions.** The annotation vocabulary, the boundary between an Annotation Block and a module `AGENTS.md`, the Tier criteria, and the Surface responsibility model. These are the rules a **Consuming Agent** must be able to apply without reading any code.
- **Part B — Visual System.** Colors, typography, layout, shapes, and component specs for the side panel, the options surface, and dialogs — in light and dark — implementable with plain DOM writes and a small render helper.

## Reading Order and Precedence

**Audience.** The primary reader is a Consuming Agent: an LLM reading this repository in order to generate a *different* extension. The secondary reader is a Consuming Developer copying one Module folder into an unrelated project. Neither of them will read this document end to end before acting, so every rule here is stated so it can be applied from a single section.

**Precedence, highest first:**

1. **PRD** — `_bmad-output/planning-artifacts/prds/prd-basic-chrome-extension-2026-08-08/prd.md`. Requirements.
2. **DESIGN.md** — this file. Conventions and visual system. Wins over any mock, wireframe, or existing code.
3. **EXPERIENCE.md** — behaviour, information architecture, state semantics, interaction, accessibility. Subordinate to this file; where the two disagree, this file wins and EXPERIENCE.md is the defect.
4. **Module `AGENTS.md`** — scoped to one Module. May never contradict either spine.

A Module that introduces a pattern not listed here is a defect — in the Module, or in this document. Fix one of the two; do not leave both standing.

**Vocabulary is fixed by PRD §4.** *Reference Repo*, *Reference Extension*, *Module*, *Core Module*, *Feature Module*, *Tier*, *Annotation Block*, *Annotation Tag*, *Manifest Fragment*, *Consuming Agent*, *Consuming Developer*, *Leaf Content Script*, *Surface*, *Pitfall*, *Acceptance Check*. Introducing a synonym anywhere in this repository is a discipline violation.

**Language is English, everywhere, without exception (NFR-9).** Code comments, Annotation Blocks, agent instructions, user-facing strings, commit messages. A non-English string anywhere in the repository is a defect.

**References like FR-12 or NFR-3 are provenance, not prerequisites.** They point at the PRD for a maintainer tracing why a rule exists. Every rule in this document is also stated in full here, so a reader who has only this file can apply all of it without resolving a single citation.

---

# Part A — Repository Conventions

## Annotation Tag Vocabulary

Every Module file carries an **Annotation Block** at its head. The block is the file's own reasoning, travelling inside the file so it cannot be separated from the code by a copy.

### The six tags, and only these six

| Tag | Presence | Carries |
|---|---|---|
| `@tier` | **Always** | `required` or `optional` |
| `@chrome-min` | **Always** | Bare major version, or `baseline` |
| `@permissions` | **Always** | Manifest permission strings, or `none` |
| `@pitfall` | When one applies | The silent failure this file guards against |
| `@alternative` | When one was rejected | The rejected option and why it lost |
| `@scales-to` | When a ceiling is known | When this approach breaks, and what replaces it |

The vocabulary is **closed**. A seventh tag fails lint. There is no `@author`, no `@since`, no `@deps`, no `@quarantine`, no `@todo`. If a fact does not fit one of the six, it is not an annotation — it belongs in the code, in the module `AGENTS.md`, or nowhere.

The first three are always present because *absence and zero are different claims*. A file with no permission cost writes `@permissions none`; a file with no version floor of its own writes `@chrome-min baseline`. An agent reading `@permissions none` learns something. An agent reading a missing line learns nothing and must guess.

The last three are omitted when they do not apply, because writing `@pitfall none` asserts that no silent failure exists — a claim no one can verify.

### Canonical form

```js
// @ts-check
/**
 * @tier optional
 * @chrome-min 105
 * @permissions none
 * @pitfall Unfiltered TreeWalker matches text inside <script> and <style>.
 * @alternative <mark> wrapping -- mutates the DOM and forces layout recalculation.
 * @scales-to Ranges beyond a few thousand matches stall the walk -> chunk with requestIdleCallback.
 */
```

That is a Leaf Content Script: it costs nothing, because it is *injected*. The file that performs the injection is where the cost lands:

```js
// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions activeTab, scripting
 * @pitfall An injected function is serialized and cannot close over outer scope.
 */
```

Rules, all of them lint-checkable:

- **`// @ts-check` is line 1.** The Annotation Block starts on line 2. Nothing precedes either.
- **One block per file, at the head.** Lint reads only the first comment block; ordinary JSDoc (`@param`, `@returns`, `@type`) lives on functions, never inside the Annotation Block.
- **Tag order is fixed** in the order of the table above. Fixed order makes the block a single regex sweep and keeps diffs stable.
- **One line per tag.** A file needing two `@pitfall` lines is a file doing two things — split it (see *Overflow*, below).
- **Six content lines maximum**, excluding the `/**` and `*/` delimiters. This is the cap FR-2 sets, and SM-C3 says a longer block is a failure signal, not thoroughness.
- **100 characters maximum per line**, counting the raw source line including its ` * ` prefix. A tag that wraps in a narrow diff has stopped being greppable.
- **ASCII only.** This is the cheapest enforcement of NFR-9 and it keeps `->` and `--` unambiguous.

### Per-tag grammar

**`@tier`** — exactly `required` or `optional`. Nothing else. No qualifiers, no parentheses.

```
@tier required
```

**`@chrome-min`** — a bare major version integer, or the literal `baseline`. Not a range, not `114+`, not a full version string.

**A numeric value is absolute.** It states the Chrome version this file's own APIs require, independently of whatever floor this repository happens to declare. A Consuming Agent reading `@chrome-min 105` in a copied file learns the file's requirement and can compare it against *their* target — which is the entire point of the tag, and is destroyed the moment the number is expressed relative to this repo.

**`baseline` means *this file adds no floor of its own beyond Manifest V3*.** It does not resolve to the root `minimum_chrome_version`; it contributes nothing at all. In the L12 arithmetic below it is the identity element of `max()`, and a Module whose files are all `baseline` declares **no** `minimum_chrome_version` in its Manifest Fragment — it simply inherits the host extension's.

This repository's own root floor is **116**, fixed in *Fixed Numbers*. That number is the *result* of applying this rule across the Tier Required set, never a definition of `baseline`. Chrome 151 appears elsewhere in the planning artifacts as the version the research was conducted against — that is an anchor for the findings, never a floor for the code.

```
@chrome-min 138
@chrome-min baseline
```

**`@permissions`** — comma-separated, written **exactly as the strings appear in `manifest.json`**. `none` when the file adds no permission. Host permissions are written as match patterns. A permission requested at runtime rather than declared up front carries the suffix `(optional)`.

```
@permissions activeTab, scripting
@permissions none
@permissions https://api.example.com/* (optional)
```

**Who carries the cost.** A permission is declared by the file that *calls the API*, not by the file the API acts on. A Leaf Content Script that only walks the DOM writes `@permissions none`, because it was injected — the injection cost belongs to whichever file calls `chrome.scripting.executeScript()`, normally `core/tabs.js`. This is what keeps a leaf honestly free and stops the same permission being counted four times across one Module.

**The Module-level check.** Annotation Blocks are per file; a Manifest Fragment is per Module. So the rule FR-4 imposes is a *union*: the set of permissions across all of a Module's Annotation Blocks must equal the permission keys in that Module's declared Manifest Fragment. Lint rule L12 compares the union, not any single file. This is the one duplication this repository permits, and it is permitted only because a machine checks it.

**`@pitfall`** — one sentence naming a failure that produces a *wrong result without raising an error*. Present tense, states the mechanism, not the fix — the fix is the code directly below. Whether every known silent failure has been annotated is a **review obligation on the maintainer**, not a lint rule: no regex can know what a file forgot to warn about.

```
@pitfall Async onMessage without `return true` closes the port and the response is lost.
```

**`@alternative`** — `<rejected option> -- <why it lost>`. The ` -- ` separator is mandatory and lint asserts both sides are non-empty. A rejected option with no stated reason is a preference, not a decision, and teaches the reader nothing.

```
@alternative Declarative content_scripts -- forces broad host_permissions this repo avoids.
```

**`@scales-to`** — `<when this approach stops being correct> -> <what replaces it>`. **Both halves are mandatory.** The ` -> ` separator is the lint anchor; a `@scales-to` with only a condition or only a replacement fails review, per FR-2.

This tag exists because of a specific decision recorded in addendum §A.3: *not using a pattern is not a reason to hide it*. The repository's output is a decision record, not only sample code. A Consuming Agent that copies `core/messaging.js` must carry away both how to send a message and where this approach runs out.

```
@scales-to Action names outgrow roughly a dozen -> a typed event bus with a registry.
@scales-to Stored payload passes ~5 MB or needs key-range queries -> IndexedDB.
```

Write the condition as something a reader can *observe about their own project*, not as a vague magnitude. "Message types exceed a handful" is checkable. "Gets complicated" is not.

### Carrier syntax per file type

| File type | Carrier |
|---|---|
| `.js` | `/** … */` JSDoc block, one ` * ` per line |
| `.css` | `/* … */`, one ` * ` per line |
| `.html` | `<!-- … -->`, one ` * ` per line, immediately inside `<head>` |
| `.json` | **Exempt** — JSON has no comments. The block lives on the `.js` file that consumes it; where no `.js` file consumes it, on the Module's `AGENTS.md` |

**All three comment carriers take the same ` * ` line prefix, and the HTML one is not an exception.** This row read "one tag per line" until story 1.11, which is how it was written and how story 1.10 implemented it — `ui/sidepanel/shell.html` shipped six bare tag lines. Measured against the regex *Lint rules* prints, two files below: a block of bare lines matches **zero** of the six tags, so the Module carrying that block declares no permission and no floor, and its Manifest Fragment then fails L12 for declaring both. The rule was the defect, not the implementation, and the ` * ` the other two carriers already require is what the lint was always written to accept.

A JSON asset cannot warn anyone, so its annotation is carried by whichever file reads it — and that is normally a `.js` file in the same Module, which is also where its pitfall belongs.

**Where no `.js` file reads it, the asset's pitfall moves to its Module's `AGENTS.md` under `## Notes`, written as prose.** Not as a tag literal: L13 forbids an Annotation Tag literal in any `AGENTS.md`, and this exception does not reopen it. The repository has exactly one such asset — `policy/managed_schema.json`, whose reader is Chrome itself rather than any extension file, and whose failure mode (an invalid schema stops Chrome loading the entire extension) has nowhere else to live. A JSON asset with no consuming file and no `## Notes` entry is a defect.

`AGENTS.md`, `README.md`, and `LICENSE` are not Module files and carry no block.

### Overflow

FR-2 sends content that needs more space to the Module's `AGENTS.md`. That escape hatch is real but narrow, and it is the *last* option:

1. **First, split the file.** Two pitfalls almost always means two operations. `features/find-text/` is the worked example: the unfiltered-walker trap, the no-element-to-scroll-to trap, and the split-by-inline-markup limitation belong to three different files, each carrying one `@pitfall`. This is FR-7 and NFR-8 doing their job, not a workaround for the six-line cap.
2. **Only if the file genuinely performs one operation with two traps**, keep the more silent one on the tag and continue in `AGENTS.md` under a `## Notes` heading, with the tag line ending in `More: AGENTS.md`.

Overflow is continuation. It is never restatement — see the next section.

### Lint rules (V-5)

Two steps, neither of which parses JavaScript:

1. **Extract the head block.** Take the file's first comment block — from the first `/**`, `/*`, or `<!--` to its closing delimiter — and nothing else. Everything below it is code, and ordinary JSDoc (`@param`, `@returns`, `@type`) lives there legitimately. A lint that scans whole files will flag valid JSDoc as a seventh tag; this one does not, because it never looks.
2. **Match each line of that block** against one regex:

```
/^\s*(?:\*|<!--)\s*@([a-z-]+)\s+(.+?)\s*(?:-->)?$/
```

L1, L8, L12, and L13 additionally need a directory walk, a line count, a JSON read, and a substring scan. Those are file operations, not language parsing — no AST is built anywhere, which is the property FR-2 asks for.

### The file set the walk covers

L1 says "every Module file". A directory walk cannot apply that without being told which files those are, and L12's per-Module union needs to know which Module each file belongs to. Three classes, and every file in the repository is in exactly one:

| Class | Files | Block | L12 |
|---|---|---|---|
| **Module files** | everything under `core/`, `features/<name>/`, `ui/sidepanel/`, `ui/options/`, `ui/popup/`, `policy/` | required (`.json` exempt per *Carrier syntax*) | grouped by Module against that Module's fragment |
| **Root composition files** | `sw.js`, `ui/tokens.css` | required | **exempt** — they belong to no Module and declare no fragment; the manifest keys they need are base keys (below) |
| **Not walked** | `tools/`, `e2e/`, `sample/`, `node_modules/`, `AGENTS.md`, `README.md`, `LICENSE`, `DESIGN.md`, `EXPERIENCE.md` | none | — |

`AGENTS.md` is not walked for L1 but *is* scanned for L13. `tools/` and `e2e/` are not extension code (AD-3) and carry no annotation obligation. Neither is `sample/`: it is this document's rendered counterpart, no manifest key points at it and nothing imports it, so it ships inside a clone as documentation and Chrome never parses it. A `.html` file elsewhere in the tree — a composition root's `shell.html` — **is** a Module file and does carry a block, in the `<!-- … -->` carrier.

**The base manifest keys** belong to the repository rather than to any Module, so no fragment declares them and L12 never sees them: `manifest_version`, `name`, `version`, `description`, `icons`, `background.service_worker`, `background.type`, and `action.default_popup`. Every other key in the root `manifest.json` is contributed by some Module's fragment, which is what makes the Acceptance Check's merge assertion (AD-17) checkable.

`background.type` is a sibling of `background.service_worker` and is listed for the same reason: `sw.js` uses `import`, MV3 service workers are classic workers by default, and without `"type": "module"` the worker does not start. It is the repository's key, not any Module's, and a Module has no way to ask for it.

| # | Rule |
|---|---|
| L1 | Every Module file that can carry comments has a head Annotation Block |
| L2 | `@tier` present; value in `{required, optional}` |
| L3 | `@chrome-min` present; a bare integer or `baseline` |
| L4 | `@permissions` present; `none` or a comma-separated list |
| L5 | Closed vocabulary — any `@tag` outside the six fails |
| L6 | No tag appears twice in one block |
| L7 | Tags appear in the fixed order |
| L8 | At most 6 content lines; at most 100 characters per raw source line |
| L9 | `@scales-to` contains ` -> ` with non-empty text on both sides |
| L10 | `@alternative` contains ` -- ` with non-empty text on both sides |
| L11 | Block is ASCII only |
| L12 | The **union** of `@permissions` across a Module's files equals its Manifest Fragment permission keys, and the **maximum** `@chrome-min` across those files equals the fragment's `minimum_chrome_version`. The maximum is computed over the **numeric tags only** — `baseline` contributes nothing. A Module with no numeric tag declares no `minimum_chrome_version`, and a fragment declaring one that no file demands fails (FR-4) |
| L13 | No Annotation Tag literal appears in any `AGENTS.md` (see next section) |

## Annotation Block and Module `AGENTS.md`

*This section resolves PRD §14 item 6, which names DESIGN.md as its owner.*

**The question.** FR-2 treats a module `AGENTS.md` as the overflow target for an Annotation Block. FR-31 additionally requires it to carry the complete copy procedure — which Core Modules to take, which manifest keys to merge, the verbatim shell line to add. Does the copy procedure duplicate what the block already states, or supersede it?

**The resolution: neither. One fact, one owner — with exactly one machine-checked exception.**

| Fact | Owner | The other file |
|---|---|---|
| Tier | `@tier` | Not restated |
| Chrome version floor | `@chrome-min` | Appears **only** as `minimum_chrome_version` inside the Manifest Fragment, where it must equal the maximum across the Module's numeric tags — and is absent when the Module has none; L12 verifies both directions |
| Permission cost | `@permissions` | Appears **only** as JSON keys inside the Manifest Fragment, which FR-4 requires to match the union of the Module's tags; L12 verifies it |
| Silent failure modes | `@pitfall` | Not restated; may be *continued* under `## Notes` |
| Rejected options | `@alternative` | Not restated |
| Scaling ceiling | `@scales-to` | Not restated |
| Which Core Modules to copy | `AGENTS.md` step 2 | Not in the block |
| Which manifest keys to merge | `AGENTS.md` step 3 | Not in the block |
| The verbatim shell line to add | `AGENTS.md` step 4 | Not in the block |
| The command that verifies the copy | `AGENTS.md` step 5 | Not in the block |

**The rule, stated so lint can check it (L13): no Annotation Tag literal — `@tier`, `@chrome-min`, `@permissions`, `@pitfall`, `@alternative`, `@scales-to` — may appear in any `AGENTS.md`.**

**Why this way.** The two files answer different questions. The block answers *should I take this, and what will it cost me* — judgement, read before deciding, and it must travel inside the source file because a copy that loses its caveats ships the pitfalls (research §Risk Assessment). `AGENTS.md` answers *how do I take it* — procedure, read after deciding, executable rather than descriptive (addendum §D: an agent can execute a command but cannot act on "make sure things work").

Restating judgement in the procedure creates two sources for one fact, and the copy will drift from the original the first time either is edited. SM-C3 names longer agent instructions as a failure signal, not thoroughness. The permitted duplication is confined to the Manifest Fragment — permissions and version floor, in JSON, in the form a merger actually consumes — and it survives only because FR-4 mandates it and L12, not discipline, keeps the two in step.

**The cost, stated honestly.** A Consuming Developer who reads only `AGENTS.md` and never opens a source file will not see the permission cost as a sentence — they will see it as JSON in step 3, which is the form they actually need to merge. They will not see the pitfalls at all. That is acceptable because the pitfalls describe the code they are about to copy, and they will be looking at that code.

### Required `AGENTS.md` skeleton

Every Feature Module directory contains one. It carries four headings, in this order — `## What it does`, `## Depends on`, `## Copy procedure`, and nothing else. A fifth heading, `## Notes`, is added only when an Annotation Block genuinely overflowed; a Module with no overflow has no `## Notes`.

Three rules the skeleton depends on:

- **`## Depends on` lists the transitive closure.** If `core/tabs.js` imports `core/messaging.js`, both are named. A Consuming Agent executing step 2 must never have to follow a chain to find a third file.
- **`## Depends on` names Core Modules and nothing else.** An asset the Module *degrades without* rather than *breaks without* is never named there; it is an optional clause inside step 2. The repository has exactly one — `ui/tokens.css`, which a `view.css` reaches through `var(--token, <fallback>)` and therefore survives the absence of. The distinction is load-bearing rather than tidy: the Acceptance Check copies exactly what `## Depends on` names, so anything named there is present in the assembled extension and can never be shown to be survivable. Naming an optional asset would convert the harness from a test of the stranger's case into a reproduction of this repository.
- **The shell contract is fixed**, so step 4 can be written without inventing anything: every Feature Module exposes `view.js` with one named export, `mount<PascalCaseModuleName>(container)`. The shell's edit is therefore always the same two lines — an `import` at the top and one call inside `mountViews()`.

```markdown
# find-text

## What it does
Searches the active page for a string and highlights matches without mutating the DOM.

## Depends on
core/messaging.js, core/tabs.js

## Copy procedure
1. Copy this directory to `features/find-text/` in the target extension.
2. Copy the Core Modules named under "Depends on" to `core/`.
   Optionally also copy `ui/tokens.css` to `ui/` and link it from your shell. Without it
   this view renders at the `var()` fallback values in its own `view.css`, which are this
   repository's light-mode defaults — correct, but not theme-aware.
3. Merge this Manifest Fragment (array keys union and de-duplicate;
   `minimum_chrome_version` resolves to the maximum; any other scalar collision is an error):

   ```json
   { "permissions": ["activeTab", "scripting"], "minimum_chrome_version": "105" }
   ```

4. Add this line verbatim to `ui/sidepanel/shell.js`:

   ```js
   import { mountFindText } from '../../features/find-text/view.js';
   ```

   and this line verbatim inside `mountViews()`:

   ```js
   mountFindText(document.querySelector('#views'));
   ```

5. Verify: `npm run check:module -- find-text`
```

Step 4 is the honest cost of NFR-3. There is no registry, no auto-discovery, no convention-based loading, so adding a Module means editing the shell by hand — and both lines are stated verbatim here so an agent applies them without inference and removes them by deleting the same text. It fails loudly and greps cleanly.

**It is two lines, not one.** An earlier draft of FR-12 said "a single-line edit to the shell". Static ESM cannot bind an import and invoke it in one statement, and every one-line form that exists — a side-effecting import, a `VIEWS` array populated at load, a glob — is the auto-registration NFR-3 forbids. Two explicit lines is the smallest honest cost. **FR-12 was corrected to "a two-line edit" on this document's authority; the requirement behind it is unchanged.**

## Pitfall Register

**NFR-4 requires every applicable pitfall below to appear as a `@pitfall` line in the relevant Module's Annotation Block.** That obligation is stated here rather than in a planning artifact because a Consuming Agent receives this repository and nothing else — a conformance rule pinned to a document the audience never sees cannot be conformed to.

These are the twenty-two known failure modes that **produce a wrong result without raising an error**. That is the entire admission criterion. A crash, a rejected promise, or a red console line is not a pitfall — it announces itself. Everything below returns something that looks fine.

Two standing rules:

- **The register is a floor, not a ceiling.** A Module that discovers a new one annotates it and adds it here. Whether a file has annotated every silent failure it actually has is a **review obligation on the maintainer** — no regex can know what a file forgot to warn about.
- **A pitfall states the mechanism, not the fix.** The fix is the code directly below the block.

### Service worker and messaging

| Pitfall | Consequence |
|---|---|
| Async message handler without the continuation signal | Port closes immediately; the response is lost |
| Assuming the service worker persists | Terminated after ~30 s idle; in-memory state vanishes |
| Keepalive ping loops | Battery drain and Web Store rejection risk |
| Tracing the log action itself | The tracer logs, which sends the log action again; the channel and the buffer flood |
| Two Surfaces appending to one stored collection | Each rewrites the whole value and drops the other's entry; both writes report success |

### Storage, configuration, and secrets

| Pitfall | Consequence |
|---|---|
| Session storage read from a content script | Not exposed without an explicit access-level call |
| Secrets written unencrypted | Plaintext on disk, readable without running your code |
| Storing a value `JSON` cannot carry | `chrome.storage` reshapes it instead of refusing it — a `Date` and a `Set` become `{}`, a circular reference becomes `null`, an `undefined` property disappears; the write resolves |
| API key in a configuration field | Synced storage reaches Google's servers, not end-to-end encrypted |
| Options interface saving per keystroke | Exceeds the synced write-rate limit; the write fails, not the UI |
| Reading configuration before migration completes | Update handler races other Surfaces |

### DOM operations in a leaf

| Pitfall | Consequence |
|---|---|
| Unfiltered tree walker | Matches text inside non-rendered elements |
| Scrolling to a range-based highlight | No element exists to scroll to |
| Naive per-text-node search | Misses matches split by inline markup |
| Plain value assignment on a framework-controlled input | Silently ignored or reverted on next render |
| Reusing the input value setter for a textarea | Different prototype |

### Rendering a view

| Pitfall | Consequence |
|---|---|
| A full keyed re-render of a list | Every row is replaced, so focus and selection inside the list are lost |
| Setting a live control's value with `setAttribute` | Sets the *default* value; once the user has typed, the element ignores the attribute — the same for a checkbox's `checked` and an option's `selected` |

### Privilege boundaries and policy

| Pitfall | Consequence |
|---|---|
| Content script fetching cross-origin | Inherits the page's origin and is blocked |
| Relaying arbitrary URLs to the service worker | Turns the extension into an open proxy |
| Malformed enterprise policy schema | Chrome refuses to load the entire extension |

### Failure reporting

| Pitfall | Consequence |
|---|---|
| An error code outside the closed set reaching a banner | Renders as a label nobody defined |

*Provenance: PRD `addendum.md` §C contributed the original sixteen. The addendum remains the reasoning record for those, and the two must not diverge. Entries beyond the sixteen were discovered by the Modules that guard them under the floor-not-ceiling rule above, and originate here rather than in the addendum: the log-tracing recursion in `core/messaging.js`, the unrecognised error code in `core/errors.js`, the silent reshaping of an unserialisable value in `core/storage.js`, the two-writer collection rewrite in `core/logger.js`, and the two rendering entries from `core/render.js`. Several were found by measuring Chrome rather than by reading it, and each shipped as a `@pitfall` one story before it could be recorded here.*

*The rendering pair is the first entry where the register carries **more than the file's block can**. An Annotation Block permits one `@pitfall` line, and `core/render.js` has two applicable failures: the re-render one is on its tag, because it is the mechanism its `@scales-to` ceiling is measured from; the `setAttribute` one travels in that file's JSDoc prose until `core/AGENTS.md` exists to hold the overflow. Both are normative here regardless of where the file carries them.*

## Tier Criteria

`@tier` is `required` or `optional`. The classification is **enforced, not asserted**: FR-3 makes it true by deletion, and the Acceptance Check proves it.

**The default is `optional`. `required` must be argued.** Every Required Module is code that every downstream consumer copies whether they want it or not, and SM-C2 names Core growth as a cost paid by everyone.

**Scope: these criteria classify a Module inside *this* repository.** They are not a decision procedure for the extension a Consuming Agent is building. Test 1 asks about the Reference Extension specifically, and applying it to a single-capability extension would mark that extension's one feature `required` — which is true of that extension and useless as a tier. A copied Module keeps the `@tier` it was given here, because the tag records *what this repository guarantees about it*, not what the consumer's project happens to need.

Apply in order; first match wins:

| # | Test | Verdict |
|---|---|---|
| 1 | Delete this Module's directory *and* the manifest keys it declares. Does the Reference Extension still load and perform its Required capabilities? | **No → `required`** |
| 2 | Does it have a runtime precondition that can be unmet on a supported machine — a Chrome floor above the base, an OS version, desktop-only, a feature detection, an enterprise policy, an external registration? | **Yes → `optional`** |
| 3 | Is it depended on by two or more Modules? | **Yes → `required`**, and NFR-2 says it belongs in `core/` |
| 4 | Does it add a permission beyond the base set (`activeTab`, `scripting`, `storage`, `sidePanel`)? | **Yes → `optional`** |
| 5 | Otherwise | **`optional`** |

Two standing consequences:

- **Core Modules are always `required`** (PRD §4). A Core Module used by exactly one Feature Module is a placement defect, not a de-duplication success (SM-C2) — move it back into that Feature Module.
- **Feature Modules never depend on each other** (FR-1). If two need the same helper, the helper is promoted to `core/` and both declare the dependency. Promotion, never cross-import.

**Quarantine is not a tier.** One unit in this repository has a failure mode that is repository-wide: an invalid `managed_schema` prevents Chrome from loading the entire extension. It is quarantined by **placement**, not by a seventh tag — the vocabulary stays closed.

That unit is **`policy/managed_schema.json` plus the `"storage": { "managed_schema": … }` manifest key**. There is no `core/config-managed.js`. `core/config.js` reads `chrome.storage.managed` itself, because three-tier resolution — `managed` → user area → declared default — is already its job under FR-17, and reading an unpopulated managed area is harmless. Deleting `policy/` and the manifest key removes the risk, changes no JavaScript, and touches neither FR-17 nor FR-18.

This is what keeps *Core Modules are always `required`* true without exception. A `@tier optional` file inside `core/` would contradict PRD §4 directly; a `core/` file reaching into a Feature Module for the schema would invert the dependency direction and make the kernel unliftable. Moving the quarantine out of JavaScript avoids both.

## Surface Responsibility Model

Six execution contexts, each owning a bounded set of concerns. This table is normative. It refines PRD addendum §B.1 in one place, flagged below.

| Surface | Owns | Must not | State lives in |
|---|---|---|---|
| **Side panel** *(primary UI)* | All user interaction; result lists; dialogs; on-device translation calls (needs a document); the platform-authenticator ceremony (the popup closes when the credential prompt appears) | Hold long-term state; perform cross-origin `fetch` | Nothing durable — reads from `storage` on mount |
| **Service worker** | Privileged cross-origin `fetch`; orchestration; the developer log ring buffer; writes it originates | Call the Translator API (worker context); assume it survives ~30s idle; run a keepalive loop | `storage.session` for anything that must outlive termination |
| **Content script** | Exactly one DOM operation per file; returns plain data | `import`/`export`; cross-origin `fetch`; retain state between invocations; read `storage` | Nothing — it is a Leaf Content Script |
| **Offscreen document** | DOM APIs the service worker lacks — the fallback path for translation | Anything but `chrome.runtime` | Nothing |
| **Options surface** | Editing configuration; writing the config keys it owns | Host feature flows; hold runtime state | `storage.sync` / `storage.local` per the schema's per-key area |
| **Popup** | A minimal launcher demonstration | Host any main flow; drive a WebAuthn ceremony | Nothing |

### Routing rules

- **R1 — Privilege gradient.** Content script (least) → side panel → service worker (most). Data flows *up* as **parameters**, never as URLs or executable strings. A content script that can hand a URL to a privileged fetcher has turned the extension into an open proxy.
- **R2 — Document work routes to the panel first.** When the service worker needs a DOM or document API, route it to the side panel. Reach for an offscreen document only when the panel cannot be guaranteed open. Offscreen is a fallback, not a default — it costs a Surface and can talk to nothing but `chrome.runtime`.
- **R3 — Content scripts are leaves.** One DOM operation, no imports, no state, plain data out, `ISOLATED` world. **A leaf returns by returning**: its value comes back to the caller as the `result` of the `chrome.scripting.executeScript()` promise. It does not `export`, does not `sendMessage`, and does not know who called it — which is what makes it copyable. A deviation to `MAIN` requires an `@alternative` line stating why, and costs a separate file plus a messaging hop back, because `MAIN` loses every `chrome.*` API and with it the return path.
- **R4 — One messaging door.** No file except `core/messaging.js` touches `chrome.runtime.onMessage`. Calling code names an action string. The `return true` continuation requirement is handled once, inside the module, and never in calling code.
- **R5 — A Surface writes only the storage it owns.** The options surface writes config keys. The service worker writes session state and anything written as a result of orchestration. The side panel writes nothing durable. Content scripts touch storage not at all.

  *This refines addendum §B.1, which assigns "storage writes" wholesale to the service worker while FR-18 has the options surface writing configuration. Routing every options keystroke through the worker would add a hop and a failure mode for no gain; ownership by key is the honest rule. Propagation is `chrome.storage.onChanged` in every Surface — never polling.*

- **R6 — Injection is on demand, and it is issued where the gesture is.** `chrome.scripting.executeScript()` under `activeTab`, at user invocation — normally straight from the side panel through `core/tabs.js`, because that is where the user clicked and `activeTab` is granted against that gesture. Routing the call through the service worker adds a hop and a place to hang without adding a capability. *"Orchestration" in the service worker's row means work that spans Surfaces or needs privileged `fetch`, not every injection.* Never declarative `content_scripts`, which would force the broad host permissions this architecture exists to avoid. An injected *function* is serialized and cannot close over outer scope, imports, or variables — only values passed via `args`.

### Storage placement

| Area | Hard limits | Holds |
|---|---|---|
| `local` | 10 MB (5 MB on Chrome ≤ 113) | Settings, ciphertext, machine-local flags including the Developer Mode toggle |
| `sync` | ~100 KB total, 8 KB per item, 120 writes/min, 1,800/hour | Synced user preferences only. **Never a secret** — `sync` reaches Google's servers and is not end-to-end encrypted |
| `session` | 10 MB (1 MB on Chrome ≤ 111), in-memory, never written to disk, cleared on browser restart; **not exposed to content scripts without an explicit `setAccessLevel()` call** | The unlocked encryption key, service-worker state, the developer log ring buffer |

`chrome.storage.local` is **plaintext in the profile directory**. Chrome's OSCrypt layer protects Chrome's own password database, not extension storage. This is not a hardening note — it is the reason `features/secret-box/` exists, and the reason an authentication gate that produces no key material protects nothing.

## Fixed Numbers

Constants this document owns, so that no Module has to invent one.

| Constant | Value | Why this number |
|---|---|---|
| **Base `minimum_chrome_version`** *(PRD §14 item 7)* | **116**, declared once in the root `manifest.json` | The binding API across the Tier Required set is `chrome.sidePanel.open()`, added in Chrome 116. `chrome.sidePanel` itself lands at 114, but `open()` is the only route from a popup click to the panel — and with no popup declared, no gesture reaches FR-12's launcher demonstration at all, so the file exists and nobody can open it. Either branch lands on 116. The runner-up floor in the Required set is 102 (`storage.session` with `setAccessLevel`); nothing else in the set is above it. **No Required Module may raise this number without re-auditing the whole set.** It is not what `@chrome-min baseline` resolves to — see *Per-tag grammar*. |
| **Developer log ring buffer capacity** *(FR-26)* | **500 entries**, oldest discarded first | Roughly 150 KB in `storage.session` at ~300 B per entry, comfortably inside the 10 MB area. Long enough to hold a full user action traced across three Surfaces, short enough to render as plain DOM without virtualisation, and cheap enough that rewriting the buffer on every entry stays unnoticeable. A larger buffer would eventually force virtualised rendering or incremental writes, and both are the invisible infrastructure NFR-3 forbids. |
| Annotation Block cap | 6 content lines, 100 chars per line | FR-2 sets the line cap; the character cap keeps a tag greppable in a narrow diff |
| Side panel design floor | 320 px | Every panel layout must hold at 320 px and must not break at 800 px. There are no breakpoints inside the panel — it is a resizable strip, not a page |
| Options surface content column | 560 px max, centred | The options surface is embedded inside `chrome://extensions`; a wider column fights its host chrome |
| `storage.sync` write debounce | 750 ms | The `sync` cap is 120 writes/min — one per 500 ms. 750 ms holds a single field to 80/min, leaving headroom for a second field being edited in the same session |
| Minimum interactive target | 28 px height | Meets WCAG 2.2 target-size minimum with margin, at the density a side panel needs |

---

# Part B — Visual System

**Every component below is drawn in [`sample/ui.html`](./sample/ui.html).** Open it in a browser to see the system rendered at the 320 px panel floor, in whichever theme the browser is set to. The sample defines no values of its own: it links `ui/tokens.css` and reaches every colour, size, space and radius through `var(--token, <literal fallback>)`, which is the same contract AR-25 and AD-25 put on a Module's `view.css`. Removing that one `<link>` leaves the page rendering correctly at this repository's light-mode defaults — the guarantee AD-25 exists to provide, demonstrated rather than asserted, and measured by `_bmad-output/dev-harness/sample-check.cjs`, which renders the page twice and compares every computed property.

**This document remains normative.** The sample shows what the rules produce; it does not replace them, because most of what follows is a prohibition — one accent per region, no filled status block, no eighth type role — and a rendering can only show the permitted case. Where the two disagree, this document wins and the sample is the defect.

## Brand & Style

**Neutral Instrument.** This extension is a demonstration vehicle for code that will be copied out of it, and the visual system is designed around that fact before it is designed around taste.

The consequence is restraint with a reason. A Module's stylesheet will end up inside somebody else's extension, next to their own design, and anything opinionated it carries becomes something they have to remove. So the palette is achromatic by default, one accent carries the single meaning *this is the live one*, three status colours carry outcome, and nothing else is coloured at all. Structure is communicated with borders and tonal surface steps rather than shadow, because a border is one declaration a stranger can delete and an elevation system is not.

The tone is that of an instrument panel: dense, quiet, factual. Lists are the dominant form because every feature in this repository is "produce a list from the page, then click items to act on the page." Monospace appears wherever the thing on screen is machine-shaped — log entries, ciphertext, permission strings, storage keys, Chrome versions — and nowhere else, so that the switch in typeface always means *this is data, not prose*.

No animation beyond a state change becoming visible. No decorative iconography. No empty flourish where a real affordance belongs. The extension should look like it was built by someone who was busy documenting something more important.

## Colors

Two ramps — neutral and semantic — plus the dialog scrim (`{colors.scrim}`, specified under *Elevation & Depth*), defined as CSS custom properties on `:root` and redefined once under `@media (prefers-color-scheme: dark)`. There is no in-extension theme toggle: Chrome owns that preference and duplicating it would be a config key that exists to fight the browser. A downstream project that wants an explicit toggle overrides the same custom properties under an `html[data-theme]` selector, which is a change to their shell, not to any copied Module.

### Neutral ramp

| Token | Light | Dark | Carries |
|---|---|---|---|
| `{colors.surface}` | `#FFFFFF` | `#17191C` | The panel and options body |
| `{colors.surface-sunken}` | `#F5F6F7` | `#101215` | Recessed regions: the log stream, code blocks, inspector tables |
| `{colors.surface-raised}` | `#FFFFFF` | `#1E2126` | Dialogs and popovers. Identical to `surface` in light, where separation comes from the border and shadow; a real step in dark, where shadow reads poorly |
| `{colors.border}` | `#DCE0E5` | `#2C3037` | Hairlines between rows and sections |
| `{colors.border-strong}` | `#BFC6CD` | `#454C55` | Control outlines: inputs, secondary buttons, checkboxes |
| `{colors.text}` | `#1B1F24` | `#E7EAEE` | Primary text |
| `{colors.text-muted}` | `#5A636D` | `#A6AEB8` | Secondary text, section labels, inactive rows |
| `{colors.text-faint}` | `#697079` | `#8A929B` | Timestamps, counts, placeholder text. **The floor** — nothing sits below this |

### Accent — one colour, one meaning

`{colors.accent}` `#1D4ED8` light / `#8FB2F7` dark means **live**: the selected list row, the focused control's ring, the primary button, the active module in the shell nav, the currently scrolled-to match.

It never means "important", never decorates a heading, never fills a background for emphasis, and never appears more than once per visible region. If two things on screen are accented, one of them is wrong.

`{colors.accent-soft}` `#E8EEFC` / `#21304D` is its tint, used only as the background of a selected row. Text on it stays `{colors.text}`.

### Status — outcome, not decoration

| Token | Light | Dark | Means |
|---|---|---|---|
| `{colors.success}` | `#116B3C` | `#5FD08C` | Capability available; operation completed; secret unlocked |
| `{colors.warning}` | `#8A5300` | `#E2B04A` | Capability unknown or degraded; a documented limitation is in effect |
| `{colors.danger}` | `#B3261E` | `#F1867E` | Capability unavailable; operation failed; a destructive control |

Status colour appears as text and as a 2 px left border on a banner. Never as a filled background block — a filled red panel in a 320 px strip reads as a crash.

**Colour is never the only carrier.** Every status is also a word (`available` / `unknown` / `unavailable`), and every banner also has a leading label. This is the NFR-7 bar in visual form.

### Verified contrast

Measured, not assumed. Every text-bearing pair below is ≥ 4.5:1 against the surface it is specified on.

Computed from the literals above by the WCAG 2.x relative-luminance formula and printed to one decimal, so each cell is checkable rather than asserted. Story 1.9's harness recomputes all eighteen from the colours a browser actually parses out of `ui/tokens.css` and reports any cell that does not match — which is how the dark `text-faint` on `surface-sunken` cell was found to have been computed against `surface-raised` (5.1) instead.

| Pair | Light | Dark |
|---|---|---|
| `text` on `surface` | 16.6:1 | 14.6:1 |
| `text-muted` on `surface` | 6.1:1 | 7.9:1 |
| `text-faint` on `surface` | 5.0:1 | 5.6:1 |
| `text-faint` on `surface-sunken` | 4.6:1 | 6.0:1 |
| `accent` on `surface` | 6.7:1 | 8.3:1 |
| `on-accent` on `accent` fill | 6.7:1 | 8.7:1 |
| `success` on `surface` | 6.6:1 | 9.1:1 |
| `warning` on `surface` | 6.3:1 | 8.8:1 |
| `danger` on `surface` | 6.5:1 | 7.1:1 |

`border` and `border-strong` are non-text and carry no contrast obligation; they are never the sole indicator of a control's state.

## Typography

**No web fonts.** The repository ships no font file and makes no network request for one — that is a direct consequence of the buildless decision (FR-6) and of the zero-runtime-dependency policy (PS-5). Two system stacks:

- `{typography.family-ui.fontFamily}` — everything a person reads as prose or as a label.
- `{typography.family-mono.fontFamily}` — everything machine-shaped.

**The monospace switch is semantic.** It is used for log entries, ciphertext, storage keys and values, permission strings, action names, Chrome version numbers, and Annotation Tag content shown in the UI. It is not used for emphasis, and prose is never set in it. A reader must be able to conclude from the typeface alone that what they are looking at came from the machine rather than from a writer.

| Role | Spec | Used for |
|---|---|---|
| `{typography.title}` | 15 / 600 / 1.35 | Panel header, dialog title, options page title |
| `{typography.section-label}` | 11 / 600 / 1.4 / +0.06em, uppercase | Section headers inside the panel and options surface |
| `{typography.body}` | 13 / 400 / 1.5 | Default. List rows, banner text, form labels, help text |
| `{typography.body-strong}` | 13 / 600 / 1.5 | The one emphasised word in a row; button labels |
| `{typography.meta}` | 11 / 400 / 1.4 | Counts, timestamps in prose contexts, tier and version badges |
| `{typography.mono}` | 12 / 400 / 1.5 | Code blocks, ciphertext, storage values |
| `{typography.mono-sm}` | 11 / 400 / 1.45 | Log stream rows, inspector tables |

13 px body is the density a 320 px side panel needs and is what Chrome's own extension surfaces use. Sizes are px rather than rem because there is no root to inherit from that this repository controls; browser zoom applies normally and the layout is fluid, so a zoomed panel reflows rather than clipping.

Ramp discipline: seven roles, and adding an eighth requires deleting one. There is no `h1`–`h6` cascade — the panel has one title and a flat run of section labels beneath it.

## Layout & Spacing

**4 px unit.** The named scale is `{spacing.1}` 4, `{spacing.2}` 8, `{spacing.3}` 12, `{spacing.4}` 16, `{spacing.5}` 20, `{spacing.6}` 24, `{spacing.8}` 32. Padding, gaps, and margins use a named step. Component *dimensions* — a 28 px control, a 40 px header, a 20 px badge — need not be named tokens, but **every dimension in the system is a multiple of `{spacing.unit}`, with exactly one exception: `{spacing.row-y}` is 6 px**, which is what puts a list row on the 28 px interactive minimum (see *Density*, below). A value outside that exception that is not a multiple of 4 is a defect.

**The rule is about dimensions, and radii and type sizes are neither.** `{rounded.sm}` 3, `{rounded.md}` 6 and `{rounded.full}` 9999 are shape; 15/13/12/11 px are positions on a type ramp. A checker that applies the 4 px rule to them fails against a correct system — story 1.9's harness scopes it to the `--space-*` scale and pins `row-y` as the sole named constant off the grid, so a second exception cannot appear quietly.

**The side panel is a strip, not a page.** One column, full width, `{spacing.panel-gutter}` 12 px on each side. It has a **design floor of 320 px** and must remain usable when the user drags it to 800 px — but there are **no breakpoints**. A layout that needs a breakpoint inside the panel is a layout that wanted to be a page. Content grows by reflowing text and by letting lists take the extra height, never by switching to columns.

Vertical rhythm inside the panel:

```
┌────────────────────────────────────┐
│ header      title + settings link  │  40px, sticky, 1px bottom border
├────────────────────────────────────┤
│ module nav  horizontal, scrollable │  32px, only when >1 view is mounted
├────────────────────────────────────┤
│                                    │
│ view region                        │  flex:1, scrolls
│   section-label                    │  spacing.4 above, spacing.2 below
│   controls                         │  spacing.2 between
│   list                             │  rows at spacing.row-y (6px) vertical
│                                    │
├────────────────────────────────────┤
│ status line   result count / state │  24px, only when a view has a count
└────────────────────────────────────┘
```

**The options surface is a page.** It is embedded inside `chrome://extensions` (`options_ui.page` with `open_in_tab: false`), so it inherits its host's chrome and must not fight it: a single centred column at `{spacing.options-column}` 560 px maximum, `{spacing.options-gutter}` 24 px gutters, fields stacked one per row, grouped under section labels. The form is rendered from **`core/config.schema.js`** — the single declaration of every configuration key's type, default, storage area, and label — and not hand-authored. No per-key markup exists, so no per-key layout can either.

**Dialogs render inside the panel**, not as a browser-level window. Their width is the panel width minus `{spacing.4}` on each side, so at 320 px a dialog is 288 px wide. This is why dialog content is one column of stacked fields and at most two actions.

**Density is a rule, not a taste.** A list row is `{spacing.row-y}` 6 px of vertical padding around 13 px text — roughly 28 px tall, which is also the minimum interactive target. Twelve rows fit in a typical panel height without scrolling, which is the point: the whole result set should be apprehensible at a glance.

## Elevation & Depth

**Depth is structural, not atmospheric.** There is exactly one shadow in this system:

```css
--shadow-dialog: 0 8px 24px rgba(0, 0, 0, 0.18);
```

It exists only on the dialog, and only because a dialog must be readable as floating above the list it covers. Everything else separates with a 1 px `{colors.border}` hairline and a tonal step to `{colors.surface-sunken}`.

The reason is portability. A copied Module's CSS should carry at most one shadow declaration into a stranger's project, and ideally none. A three-level elevation scale is an aesthetic commitment the consumer did not ask for.

In dark mode the shadow does almost nothing — dark surfaces absorb it. `{colors.surface-raised}` `#1E2126` is a real tonal step above `{colors.surface}` `#17191C` for that reason, and the dialog border does the rest of the work.

The scrim behind a dialog is `{colors.scrim}` `rgba(0, 0, 0, 0.32)` in light and `rgba(0, 0, 0, 0.56)` in dark. It covers the view region and the status line, and it does **not** cover the panel header — the settings link stays reachable, because a dialog that traps the user in a 288 px box with no visible exit is the panel equivalent of a modal with no close button.

**The scrim is a token, not a literal, and the reason is structural.** It has two theme-dependent values, so a literal in a composition root's stylesheet cannot express the second one without that stylesheet declaring its own `@media (prefers-color-scheme: dark)` block — which would put a second dark redefinition in the repository and the dark half of a colour outside `ui/tokens.css`, contradicting *Colors* above ("redefined once") and AD-25 ("once, on `:root`, with a single dark redefinition"). Story 1.9 left it undecided because that story's acceptance criteria named a closed list of fourteen colour tokens; story 1.10 draws the scrim and resolved it here. It carries no contrast obligation — it is not a text-bearing pair — and it is the one colour token that is not part of either ramp.

## Shapes

| Token | Value | Applied to |
|---|---|---|
| `{rounded.sm}` | 3 px | List row selection background, badges with square content |
| `{rounded.DEFAULT}` | 4 px | Buttons, inputs, banners, code blocks |
| `{rounded.md}` | 6 px | Grouped cards in the options surface |
| `{rounded.lg}` | 8 px | Dialogs |
| `{rounded.full}` | 9999 px | Tier and status badges only |

Corners are tight on purpose. At 13 px text in a 320 px strip, a generous radius eats the little horizontal space there is and reads as a consumer app rather than an instrument. The one pill shape is reserved for badges, where the full radius is what separates a badge from a button at a glance.

Nothing is circular except the capability-matrix status dot, which is 8 px and always paired with the status word beside it.

## Components

Every component below is implementable with direct DOM writes plus a small render helper — no framework, no template compiler, no virtual DOM (FR-6, NFR-3, addendum §A.6). `@scales-to` on the render helper records the condition under which a framework becomes correct: *list state outgrows a full re-render (per-row local state)*, whose replacement is a framework with a diff.

### Panel header

Sticky, 40 px, `{typography.title}` on the left, a settings affordance on the right. The settings affordance opens the options surface through `chrome.runtime.openOptionsPage()` — never a constructed URL. Bottom border `{colors.border}`. The header does not scroll and is never covered by a scrim.

### Module nav

A horizontal row of ghost buttons, one per mounted view, appearing only when more than one view is mounted. The active one is `{colors.accent}` text with a 2 px bottom rule in the same colour; the rest are `{colors.text-muted}`. It scrolls horizontally rather than wrapping, because wrapping would make the panel's chrome height variable.

Its contents come from the shell's explicit import list. When a Module is deleted along with its one shell line, its nav entry disappears with it — there is no registry to clean up and no empty affordance left behind (FR-12).

### List row

The dominant form in this extension.

- Full-bleed to the panel gutters, `{spacing.row-y}` vertical padding, `{rounded.sm}` on the selection background.
- One line of `{typography.body}` primary text, truncated with an ellipsis at the row's end, with the full value in `title`.
- Optional trailing `{typography.meta}` in `{colors.text-faint}`: an index, a count, a length.
- **Selected**: background `{colors.accent-soft}`, a 2 px `{colors.accent}` left marker, primary text unchanged. Selection is exclusive — one row per list — and is carried in the markup by **`aria-current="true"`**, not `aria-selected`, which is invalid on a `<button>`.
- **Hover**: `{colors.surface-sunken}` background. No transform, no shadow, no motion.
- **Focus**: the focus ring, drawn inside the row so it is not clipped by the scroll container.

Rows are buttons, not divs with click handlers. Keyboard operation is not an enhancement here — it is the NFR-7 floor.

### Buttons

| Variant | Fill | Text | Border | Used for |
|---|---|---|---|---|
| Primary | `{colors.accent}` | `{colors.on-accent}` | none | The one action that commits: Search, Fill, Unlock, Save |
| Secondary | `{colors.surface}` | `{colors.text}` | 1 px `{colors.border-strong}` | Cancel, Clear, Copy |
| Ghost | transparent | `{colors.text-muted}` | none | Icon-adjacent chrome: settings, close, nav |
| Danger | transparent | `{colors.danger}` | 1 px `{colors.danger}` | Lock, Delete, Revoke |

All are `{spacing.control-height}` 28 px tall, `{rounded.DEFAULT}`, `{typography.body-strong}`, with `{spacing.3}` horizontal padding. **At most one primary button is visible per region.**

**Disabled** is `aria-disabled="true"` and nothing else — never the native `disabled` attribute, which removes the control from the tab order, and a control a keyboard user cannot reach takes its explanation with it. The style keys off the same attribute, so the visual state and the announced state cannot drift apart. A disabled button is drawn as the Secondary variant in `{colors.text-faint}` on `{colors.surface}` with a `{colors.border}` outline, whatever variant it was when enabled. A Primary button in particular does **not** stay filled and fade its label: `{colors.text-faint}` on `{colors.accent}` is roughly 1.3:1 and unreadable. Losing the fill is the state change.

Danger is an outline rather than a fill: a filled red button in a narrow strip dominates the panel, and none of the destructive actions here are the primary path.

### Text input

Full width, 28 px, `{rounded.DEFAULT}`, 1 px `{colors.border-strong}`, `{typography.body}`, `{spacing.2}` horizontal padding. Placeholder in `{colors.text-faint}`.

- **Focus**: the focus ring; the border does not change colour, so the ring is the single focus signal everywhere in the system.
- **Invalid**: border `{colors.danger}` *and* a `{typography.meta}` message in `{colors.danger}` directly beneath. Never the border alone.
- **Secret fields** are `type="password"` with a reveal toggle, and their value is never echoed into the log stream.

Labels sit above the field in `{typography.body}` `{colors.text-muted}` and are `<label for>`-bound. Placeholder text is never a substitute for a label.

### Banner

The single component for surfacing a state the user did not ask about: a restricted page, an unmet precondition, a documented limitation, a failure.

`{rounded.DEFAULT}`, `{colors.surface-sunken}` background, a 2 px left border in the status colour, `{spacing.2}` `{spacing.3}` padding, `{typography.body}` text.

Structure is always **label, then cause, then what would change it**. Where the user can act, the third part is the action. Where nobody can act, it is the condition that would have to be true instead — which is the useful thing to say, and never an apology:

> **Restricted** — Chrome pages cannot be read by extensions. Open a normal page and try again.
> **Unavailable** — Translator is not present in this browser. Requires desktop Chrome 138+.
> **Degraded** — matches split across inline markup are not found.

The label is one word, drawn from the failure vocabulary in `EXPERIENCE.md.Voice and Tone` — `Restricted`, `Unavailable`, `Failed`, `Unknown` — or `Degraded`, which is not a failure at all but a documented limitation in force while the feature works.

Banners are placed at the top of the view region, never floated, never auto-dismissed, and never stacked more than one deep — a second condition replaces the first rather than queueing beneath it.

### Badge

`{rounded.full}`, `{typography.meta}`, `{spacing.2}` horizontal padding, 20 px tall, 1 px `{colors.border-strong}` border, `{colors.text-muted}` text.

Two uses only: **tier** (`required` / `optional`) and **Chrome floor** (`chrome 138`). Both are set in `{typography.mono}` at 11 px because both are machine facts. Badges are never coloured — a required Module is not a good Module and an optional one is not a warning.

### Dialog

The only overlay in the system. Renders inside the panel above the scrim, `{colors.surface-raised}`, `{rounded.lg}`, 1 px `{colors.border}`, the one shadow token, `{spacing.4}` padding.

Anatomy: `{typography.title}` title, one column of stacked fields, at most two actions right-aligned at the bottom with the primary last. No dialog in this repository has a third action, and none is more than one screen tall in a 320 px panel — if it would be, it is an options surface concern rather than a dialog.

Focus moves to the first field on open and is trapped until close. `Escape` cancels. `Enter` in the last field commits. On close, focus returns to the control that opened it.

### Capability matrix row

Developer Mode only. One row per Tier Optional Module present in the build:

```
● find-text                  available     chrome 105 / running 151
● translate-selection        unavailable   requires desktop Chrome 138+
● key-webauthn               unknown       PRF support not yet probed
```

Module name in `{typography.body}`, verdict word in the status colour, right column in `{typography.mono-sm}` `{colors.text-faint}` showing the declared `@chrome-min` against the running version. The 8 px dot repeats the status colour and is always redundant with the word.

The matrix is derived from the Modules present, so deleting a Module deletes its row. There is no list of modules to maintain (FR-28, NFR-3).

### Log stream row

Developer Mode only. `{colors.surface-sunken}` region, `{typography.mono-sm}`, 2 px vertical padding, four columns:

```
12:04:31.882  sw     msg:find-text/search     →req
12:04:31.886  cs     msg:find-text/search     ←res  4ms
12:04:32.140  panel  render 12 matches
```

Timestamp in `{colors.text-faint}`; Surface tag in `{colors.text-muted}`; message in `{colors.text}`; a request with no matching response is marked `→req` in `{colors.warning}` and stays that way, which is how FR-27 makes a hung call visible.

**Capacity is 500 entries, oldest discarded first.** The buffer lives in `storage.session`, survives service-worker termination, and is cleared on browser restart. When the buffer is full, the stream shows `500 entries (oldest discarded)` in `{typography.meta}` at its head — the truncation is stated, never silent.

No virtualisation. 500 rows of plain DOM is the reason the number is 500.

### Inspector table

Developer Mode only. Two columns — key in `{typography.mono-sm}` `{colors.text-muted}`, value in `{typography.mono-sm}` `{colors.text}` — with a 1 px `{colors.border}` between rows and `{colors.surface-sunken}` behind. Used by the storage and permission inspectors.

Long values wrap rather than truncate, because the point of the storage inspector is to show that `features/secret-box/` really did store ciphertext. The ciphertext is displayed in full, in monospace, deliberately unreadable — that is the demonstration.

### Progress

One form: a 2 px determinate bar in `{colors.accent}` on a `{colors.border}` track, full panel width, with `{typography.meta}` text beneath giving the percentage. It exists for exactly one case, the first-use translation model download, and it is paired with a sentence saying what is downloading and that it happens once.

No spinners. An operation that cannot report progress reports its state as text in the status line instead.

### Status line

The 24 px strip at the foot of the panel, `{typography.meta}` `{colors.text-faint}`, present whenever the active view has anything to say about itself. It carries three things and only these:

- **A count**, standing: `12 matches · 2 of 12 selected`.
- **A verb in progress**, while an action is in flight: `searching…`. This is why there are no spinners and no skeletons.
- **A completed outcome**, transiently: `copied to clipboard`, `saved`, `unlocked`. It appears on completion, stays for 3 seconds, and reverts to the count.

**This is the only success channel in the system.** Toasts are banned, and a banner is for states the user did not ask about — an action that succeeded is not one. An action whose success would otherwise be invisible must be observable here, or it is not finished.

### Empty state

`{typography.body}` `{colors.text-muted}`, centred in the view region, one sentence saying what will appear here and what to do to make it appear. No illustration, no icon, no heading. An empty state that offers an action renders it as a secondary button beneath the sentence.

### Focus ring

`2px solid {colors.accent}` with `1px` offset, on every focusable element, in both themes, everywhere. It is never removed, never replaced by a colour change, and never suppressed by `:focus-visible` heuristics in the panel — a side panel is a keyboard surface as much as a pointer one.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Write `@permissions none` and `@chrome-min baseline` explicitly | Omit a mandatory tag and leave an agent to infer zero cost |
| Split a file when it needs a second `@pitfall` | Stretch the block to seven lines, or drop the second pitfall |
| State both halves of `@scales-to`, separated by ` -> ` | Name a ceiling with no replacement, or a replacement with no trigger |
| Let `AGENTS.md` reference the Annotation Block | Restate `@tier`, `@pitfall`, or `@alternative` in `AGENTS.md` (L13 fails it) |
| Argue for `required`; default to `optional` | Promote to `core/` for a single consumer (SM-C2) |
| Route document APIs to the side panel first | Reach for an offscreen document before trying the panel |
| Pass identifiers up the privilege gradient | Relay a URL or an executable string from page context |
| Use `{colors.accent}` for exactly one live thing per region | Accent a heading, a border, or a second element for emphasis |
| Pair every status colour with its status word | Let colour be the only carrier of a state |
| Keep the ramp at seven type roles | Add an eighth without deleting one |
| Separate with a hairline and a tonal step | Introduce a second shadow, or an elevation scale |
| Let the panel reflow from 320 px to 800 px | Add a breakpoint inside the panel |
| Set machine facts in monospace | Set prose in monospace, or use it for emphasis |
| Render the options form from the configuration schema | Hand-author per-key markup that discipline must keep in sync |
| Show `500 entries (oldest discarded)` when the buffer wraps | Let truncation be silent |
| Put a success outcome in the status line | Reach for a toast, or a banner, for something the user asked for |
| Disable with `aria-disabled` and lose the fill | Use the native `disabled` attribute, or fade a label on a filled button |
| Keep every control keyboard-reachable with an accessible name | Claim a WCAG conformance level this repository does not verify |

---

## Related documents

- **[`sample/ui.html`](./sample/ui.html)** — Part B rendered. Every component, drawn at the 320 px panel floor, consuming `ui/tokens.css` through the `var(--token, <fallback>)` contract rather than restating a single value. Subordinate to this document: it shows what the rules produce and cannot express what they forbid.
- **[EXPERIENCE.md](./EXPERIENCE.md)** — behaviour, information architecture, state semantics, interaction, accessibility, and key flows. Subordinate to this document.
- **Key-screen mocks** — [`_bmad-output/planning-artifacts/ux-designs/ux-basic-chrome-extension-2026-08-08/mockups/key-screens.html`](./_bmad-output/planning-artifacts/ux-designs/ux-basic-chrome-extension-2026-08-08/mockups/key-screens.html). Reference renderings of the side panel, options surface, dialog, and Developer Mode in both themes. **This document wins on conflict with any mock.**
- **PRD** — `_bmad-output/planning-artifacts/prds/prd-basic-chrome-extension-2026-08-08/prd.md`, with rejected alternatives in `addendum.md`. The addendum's §C pitfall register is **inlined above** under *Pitfall Register*; the copy in this document is the normative one.
- **Architecture spine** — `_bmad-output/planning-artifacts/architecture/architecture-basic-chrome-extension-2026-08-08/ARCHITECTURE-SPINE.md`. Structural decisions AD-1 – AD-27: the kernel's file list, dependency direction, the messaging envelope, the runnable commands, and the Acceptance Check's fixture. It is **subordinate to this document** and may not contradict it.
- **Technical research** — `_bmad-output/planning-artifacts/research/technical-chrome-extension-mv3-reference-starter-research-2026-08-08.md`, Chrome 151 baseline.

## Open items owned elsewhere

These affect Module shape but not this document's rules, and are tracked in PRD §14:

- **Spike D10** — extension-scoped authenticator identity. If it fails, `key-webauthn.js` becomes documentation-only; the capability matrix row for it remains, reporting `unavailable`.
- **Spike D11** — framework-controlled input injection from the `ISOLATED` world. Determines whether `features/fill-input/` needs a `MAIN`-world file and the `@alternative` line that R3 requires for one.
- **Spike D12** — on-device translation from the side panel. If the panel cannot host it, the offscreen fallback in R2 applies and one Core Module is added.

*PRD §14 item 7 — the base `minimum_chrome_version` — is **closed**. The Required set was audited and the number is fixed at 116 in* Fixed Numbers.
