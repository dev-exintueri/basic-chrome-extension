---
name: Neutral Instrument
description: Behaviour, information architecture, state semantics, interaction, and accessibility for the Chrome Extension MV3 Reference Starter Repo.
status: final
created: 2026-08-08
updated: 2026-08-17
sources:
  - _bmad-output/planning-artifacts/prds/prd-basic-chrome-extension-2026-08-08/prd.md
  - _bmad-output/planning-artifacts/prds/prd-basic-chrome-extension-2026-08-08/addendum.md
  - _bmad-output/planning-artifacts/research/technical-chrome-extension-mv3-reference-starter-research-2026-08-08.md
---

# EXPERIENCE.md — Neutral Instrument

> Subordinate to [DESIGN.md](./DESIGN.md). DESIGN.md owns the repository conventions and the visual system; this document owns how things behave. Where the two disagree, DESIGN.md wins and this document is the defect. Both win over any mock, wireframe, or existing code.

## Foundation

**Multi-surface Chrome MV3 extension, desktop only.** No UI system. No framework. Views are plain DOM writes through a small render helper; DESIGN.md is the visual identity reference.

Chrome 151 is the version the platform research was conducted against — an anchor for its findings, not a floor for the code. The floor is **Chrome 116**, declared once as `minimum_chrome_version` in the root `manifest.json`, and every claim in this document assumes it. It is *not* what `@chrome-min baseline` resolves to: `baseline` means a file adds no floor of its own, and every numeric `@chrome-min` states an absolute Chrome version independent of this repository's floor (DESIGN.md §*Per-tag grammar*, §*Fixed Numbers*).

**This product has two audiences and they are not its users.** The Reference Extension is a demonstration vehicle, not a published product (PRD §3.2, §11) — it has no end users. Its interface exists to be *read as an implementation* by a **Consuming Agent** and *evaluated as a working example* by a **Consuming Developer**. The only person who drives it end to end is the maintainer, proving that what the code claims is true.

That inverts one normal priority: **an interaction is worth building when it makes a platform fact visible, and not otherwise.** The storage inspector exists so that "the secret is really ciphertext" can be seen rather than believed. The capability matrix exists so that "why doesn't this work on my machine" has an answer on screen. A feature that would be good product design but demonstrates nothing does not belong here.

**Six surfaces, one primary.** The side panel hosts every flow; the popup is a minimal launcher demonstration and hosts none (PRD FR-12). The reason is structural, not aesthetic: every capability here is *produce a list from the page, then click items to act on the page*, and a popup closes the moment the user clicks into the page.

## Information Architecture

### Runtime surfaces

| Surface | Reached from | Purpose | Survives |
|---|---|---|---|
| Side panel | Toolbar icon → `chrome.sidePanel` | Every user flow: module nav, result lists, dialogs, Developer Mode | Page navigation and, optionally, tab switches |
| Options | Panel header settings link → `chrome.runtime.openOptionsPage()` | Configuration, rendered from the schema | Its own lifetime; embedded in `chrome://extensions` |
| Dialog | A control inside a panel view | One focused input, at most two actions | Until dismissed; never nested |
| Popup | Toolbar icon (secondary demonstration) | Opens the side panel, states that the panel is where the flows live | Closes on any outside click — which is the lesson |
| Service worker | — | No interface | ~30s idle, then terminated |
| Offscreen document | Service worker, fallback only | No interface | Until closed |

Inside the panel: **header → module nav → view region → status line**. One view is active at a time. Nav appears only when more than one view is mounted, and a view's presence comes from the shell's explicit import list — delete a Module and its one shell line and the nav entry goes with it, leaving no empty affordance (FR-12).

Developer Mode adds one more nav entry (`dev`) holding four sub-views: **log**, **capability**, **storage**, **permissions**. When Developer Mode is off, the entry is absent — not disabled, not hidden-but-rendered. Logging calls return without doing work (FR-25).

### Reading surfaces

For this repository the documentation *is* product surface (PRD §5.9), so it has an information architecture too. This is the path a Consuming Agent walks, and each step answers a different question.

| Surface | Question it answers | Rule |
|---|---|---|
| `README.md` | *What is here, and what does it deliberately not do?* | Three-step quickstart, Module inventory with Tier and `@chrome-min`, the copy-paste contract and how to verify it, the tools to use instead, licence |
| Root `AGENTS.md` | *What are the repository-wide conventions and every runnable command?* | Commands verbatim, never prose descriptions of intent |
| Annotation Block | *Should I take this, and what will it cost me?* | Six tags, six lines, travels inside the source file |
| Module `AGENTS.md` | *How do I take it?* | Five headings, executable steps, never restates a tag (DESIGN.md L13) |

→ Composition reference: `_bmad-output/planning-artifacts/ux-designs/ux-basic-chrome-extension-2026-08-08/mockups/key-screens.html`. Spines win on conflict.

## Voice and Tone

Microcopy only. Aesthetic posture lives in `DESIGN.md.Brand & Style`. **English, always** (NFR-9).

The extension talks like documentation, not like an app. It never congratulates, never apologises, and never hides a platform fact behind a friendlier one — hiding the fact is the one thing this repository exists to stop.

| Do | Don't |
|---|---|
| "Chrome pages cannot be read by extensions." | "Oops! Something went wrong." |
| "Requires desktop Chrome 138+. This browser reports 151 on Android." | "Not supported." |
| "Stored as ciphertext. The key is held for this browser session only." | "Your data is safe and secure!" |
| "12 matches. Matches split across inline markup are not found." | Silently reporting 12 and omitting the caveat. |
| "Downloading the translation model, 41%. This happens once." | An indeterminate spinner. |
| Name the cause, then the remedy. | "Error: undefined" |
| Sentence case, full stops, no exclamation marks. | Title Case Buttons, emoji, encouragement. |

### Failure vocabulary

Four fixed words. The word is chosen by **who can change the outcome**, and the choice is not stylistic — the capability matrix reports the first, third and fourth of them verbatim (FR-28).

| Word | Means | Who can act | Example |
|---|---|---|---|
| **unavailable** | A precondition of this machine or browser is not met | Nobody, right now | "Translator is not present in this browser. Requires desktop Chrome 138+." |
| **restricted** | The target page is one extensions may not touch | The user, by switching tabs | "Chrome pages cannot be read by extensions. Open a normal page and try again." |
| **failed** | The operation was attempted and did not complete | The user, by retrying or changing input | "Request failed: the endpoint returned 503. Try again." |
| **unknown** | The precondition has not been probed yet | The user, by triggering a probe | "PRF support is not yet probed. Unlock once to find out." |

A message that cannot name which of the four it is has not diagnosed the problem yet.

**`Degraded` is a fifth banner label but not a failure word.** It marks a documented limitation in force *while the feature works* — "matches split across inline markup are not found" — so nothing failed and no one is expected to act. It takes `warning` colour and it is never suppressed for being inconvenient. Suppressing it is how a reference repository starts lying.

## Component Patterns

Behavioural. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioural rules |
|---|---|---|
| Module nav | Panel chrome | Exclusive selection. Switching views preserves the previous view's DOM and scroll position; it does not re-run its query. |
| List row | Every result set | Exclusive selection within its list, carried as `aria-current="true"`. Activating a row acts on the page; it does not navigate. Full value in `title` when truncated. |
| Primary button | One per region | Commits the region's action. Carries `aria-disabled` while the action is in flight — never the native `disabled` attribute, which would drop it from the tab order — with the label unchanged; no "Loading…" swap. The status line carries the verb. |
| Status line | Panel foot | The only success channel. Standing count, verb-in-progress during an action, then the outcome for 3 seconds before reverting to the count. An action whose success is otherwise invisible must land here. |
| Text input | Search, dialog fields | Debounced only where a write is involved (750 ms, DESIGN.md Fixed Numbers). Search is submit-driven, not as-you-type — a keystroke-driven page walk fights NFR-10. |
| Banner | Any unrequested state | One at a time. A new condition replaces the old. Never auto-dismissed. Cleared when the user changes the input that caused it. |
| Dialog | One focused input | Opens with focus on the first field, traps focus, `Escape` cancels, `Enter` in the last field commits, focus returns to the opener on close. |
| Capability matrix row | Developer Mode | Probes on view mount, not on extension start. A probe that costs a user gesture reports `unknown` until the gesture happens. |
| Log stream | Developer Mode | Appends at the bottom, auto-scrolls only when already scrolled to the bottom. Replays the ring buffer on connect. |
| Inspector row | Developer Mode | Values are editable in place; a write goes through `core/storage.js` like any other write and appears in the log stream. |
| Progress bar | Model download only | Determinate or absent. Never a spinner. |
| Toggle | Options, Developer Mode | Writes on change. The 750 ms debounce applies to `storage.sync` only, so a `local` key such as Developer Mode is written immediately. Reflects the stored value, not the pending one — a failed write must visibly revert. |

## State Patterns

Every Module whose runtime precondition is unmet **reports the reason**; it does not throw, hang, or silently no-op (NFR-6). That is the single behavioural rule this table elaborates.

| State | Where | Treatment |
|---|---|---|
| Cold panel open | Panel | Header and nav render immediately. Views mount empty with their own empty state; nothing blocks on storage. |
| Empty | Any list before its action runs | One sentence naming what will appear and what to do. `find-text`: "Enter a search term." |
| No results | Any list after its action runs | "No matches on this page." Distinct from empty — the difference is whether the action ran. |
| In flight | Any action | Primary button `aria-disabled`, status line shows the verb in progress. No overlay, no skeleton — the panel is 320 px and a skeleton is noise. |
| Succeeded | Any action | Status line shows the outcome for 3 seconds, then reverts to the count. No banner, no toast, no colour change. An action with no visible result of its own — a clipboard write, a saved secret — is *only* observable here, so it must not be skipped. |
| Restricted page | `find-text`, `fill-input`, `read-page` | Banner, `warning`. "Chrome pages cannot be read by extensions." The controls stay enabled so the user can retry after switching tabs. |
| Unavailable | `translate-selection`, `key-webauthn`, `find-text` below its floor | Banner, `danger`, naming the precondition and the version or platform that would satisfy it. The view still renders, so the reader can see the code path that would run. |
| Degraded | `find-text`, `secret-box` | Banner, `warning`, stating the documented limitation while the feature works: "Matches split across inline markup are not found." Never suppressed because it is inconvenient. |
| Failed | Any | Banner, `danger`, with the cause. A structured error from `core/messaging.js`, never a raw exception string. |
| Hung | Developer Mode log | A request with no response stays marked `→req` in `warning` indefinitely. It is never resolved by timeout, because the point is to make the hang visible (FR-27). |
| Locked / unlocked | `secret-box` | Locked is the default on every browser restart. The unlocked key lives in `storage.session` only. The panel states which it is at all times; it never infers it from whether a value renders. |
| Migration in progress | Any config read | Reads resolve through declared defaults rather than a malformed value. No surface waits on `onInstalled` (addendum §C). |
| Service worker terminated | Invisible | Nothing in the UI depends on the worker being alive. State that must survive is in `storage.session`; a view that would break on termination is a defect. |
| Buffer wrapped | Developer Mode log | `500 entries (oldest discarded)` at the head of the stream. Truncation is stated, never silent. |
| Developer Mode off | Everywhere | The `dev` nav entry is absent, the log stream is not rendered, and logging calls return immediately. The flag is machine-local and does not follow the user (FR-25). |

## Interaction Primitives

- **Click to select, click to act.** A list row activates on click and on `Enter`/`Space`. Selecting a `find-text` match scrolls the page to it; because the CSS Custom Highlight API inserts no node, the scroll is computed from the range's bounding rectangle rather than delegated to `scrollIntoView()`.
- **Keyboard traversal is the primary path**, not a fallback. `Tab` follows reading order: header → nav → controls → list → status. Arrow keys move within a list once it holds focus. `Escape` closes a dialog; nothing else swallows it.
- **Page access happens on user invocation.** Nothing reads or touches the page on panel open, on tab switch, or on navigation. This is `activeTab` behaviour made visible: the extension is inert until asked (FR-13, NFR-5).
- **The page stays interactive** while a Module works on it (NFR-10). A tree walk over a large document yields rather than blocking. No numeric budget is claimed; "the page stays responsive" is the bar.
- **Writes are debounced, reads are not.** 750 ms on anything that reaches `storage.sync`, because exceeding the write-rate limit fails the *write* and not the UI — the most likely silent failure in the configuration module.
- **Propagation is by observation.** Every surface reacts to `chrome.storage.onChanged`. Nothing polls.
- **Banned:** as-you-type page searching; auto-opening the panel on navigation; toast notifications; anything that keeps the service worker alive; any interaction that requires a permission the base manifest does not hold.

## Accessibility Floor

Behavioural. Visual contrast lives in `DESIGN.md.Colors`.

The bar is PRD NFR-7 and it is deliberately two checkable conditions rather than a conformance claim this repository does not verify:

1. **Every interactive element in the side panel, options surface, and dialogs is reachable and operable by keyboard alone.**
2. **Every interactive element carries an accessible name.**

How that lands:

- Rows are `<button>`, not clickable `<div>`s. Toggles are `<input type="checkbox">`. Native semantics before ARIA, always. Selection on a row is `aria-current="true"` — `aria-selected` is invalid on a `<button>` and screen readers ignore it.
- The focus ring is never removed and never conditional (DESIGN.md *Focus ring*). A side panel is a keyboard surface as much as a pointer one.
- Disabled controls keep `aria-disabled` and stay focusable, so the explanation of *why* they are disabled remains reachable. The native `disabled` attribute is not used on any button in the panel.
- Banners are `role="status"` for `warning` and `role="alert"` for `danger`. The banner container is **present in the DOM from mount and populated on change** — a live region inserted at the same moment as its text is frequently not announced at all.
- The status line is a `role="status"` live region, so a success that only appears there is spoken as well as drawn.
- Dialogs are `role="dialog"` with `aria-modal`, labelled by their title, focus-trapped, and return focus to the opener.
- Status is never colour alone — every status colour is paired with its word from the failure vocabulary.
- The log stream is a `<ol>`; the capability matrix and inspectors are `<table>` with real headers. They are data, and screen readers should be told so.
- Options fields are `<label for>`-bound. Placeholder text is never a label.
- No conformance level is claimed. The two conditions above are what the repository checks and what it says it checks.

## Key Flows

The first three are the PRD's user journeys, named verbatim (PRD §3.3). The last three are the Reference Extension being exercised — by the maintainer proving a claim, or by a developer evaluating one.

### UJ-1 — A Consuming Agent builds a password-vault extension and takes exactly two folders

1. The agent is asked to build an extension that stores API tokens locally and fills them into login forms.
2. It reads the root `AGENTS.md`, which states the tiering rule and points at the Module inventory.
3. It copies `core/`, `features/secret-box/`, and `features/fill-input/`.
4. Inside `features/fill-input/AGENTS.md` it follows the copy procedure: Core Modules to take, manifest keys to merge, the two verbatim shell lines to add.
5. In `features/fill-input/set-value.js` it reads the `@pitfall` line — a plain `input.value` assignment is silently ignored by a framework-controlled input; the native setter must be called *before* dispatching a bubbling `input` event.
6. It assembles `manifest.json` by concatenating the declared fragments: array keys union and de-duplicate, `minimum_chrome_version` resolves to the maximum, any other scalar collision is an error.
7. **Climax:** the resulting extension loads unpacked and fills a framework-controlled form correctly on the first run, including the pitfall the agent never had to discover.
8. **Resolution:** it did not copy `translate-selection`, `identity-oauth`, or the developer panel, and the extension requests only `activeTab`, `scripting`, and `storage`.

### UJ-2 — Minji needs page text search and refuses to adopt a framework to get it

1. Minji is adding a "find on page" feature to an existing extension with its own build setup and state management.
2. She opens `features/find-text/` and reads the six-line Annotation Block: tier optional, Chrome 105 minimum, no host permission of any kind — `activeTab` and `scripting` on the injecting Core Module, `none` on the leaf itself — the unfiltered-`TreeWalker` pitfall, `<mark>` wrapping rejected for layout thrash.
3. She copies the folder plus the two `core/` files listed under `## Depends on` in its `AGENTS.md`, which names the transitive closure so she never has to follow a chain.
4. **Climax:** it works inside her Vite + TypeScript project without modification, because the Module has no imports she did not copy.
5. **Resolution:** she never installs anything from this repository, never adopts its conventions, and never reads its README.
6. **Edge case:** her project targets Chrome 102 for an enterprise fleet. `@chrome-min 105` tells her this before she writes any code, and she takes the rejected `<mark>` alternative from `@alternative` instead.

### UJ-3 — The maintainer proves the claim

1. Before tagging a release, the maintainer runs the Acceptance Check from the repository root.
2. For each Feature Module: a clean directory receives `core/`, that one Module, and a manifest assembled from the declared fragments.
3. The assembled extension loads unpacked in Chromium and the Module's single capability is driven once.
4. **Climax:** every Feature Module passes independently. A failure names the Module and the missing dependency.
5. **Resolution:** the modularity claim in the README is verified rather than asserted. A release with a failing Module is not tagged.

### Flow 4 — Find text on the active page, including the page that cannot be read

1. The maintainer opens the side panel on an article page and selects the `find-text` view.
2. Empty state: "Enter a search term."
3. They type a term and press `Enter`. The panel calls `core/tabs.js` directly, which injects the leaf content script under `activeTab` — the gesture happened in the panel, so the injection is issued there (R6). The service worker is not involved and does not need to be awake.
4. The status line reads `12 matches`, the list renders, and a `warning` banner states the documented limitation: matches split across inline markup are not found.
5. They click the third row. The page scrolls to the match, computed from the range's bounding rectangle, and the row takes the accent marker.
6. **Climax:** the page is scrolled and highlighted, and no DOM node was inserted to do it — the host page's own scripts and selectors are untouched.
7. **Failure path:** they switch to a `chrome://` tab and search again. A `warning` banner: "Chrome pages cannot be read by extensions. Open a normal page and try again." The controls stay enabled; nothing throws.

### Flow 5 — Store a secret, and see that it is really ciphertext

1. `secret-box` opens **locked** — the default after every browser restart.
2. The maintainer clicks Unlock. A dialog asks for a passphrase; focus lands in the field.
3. The key is derived and held in `storage.session`. The panel now states `unlocked`.
4. They enter a short secret and save it. The ciphertext goes to `storage.local`; the plaintext appears nowhere on disk.
5. They enable Developer Mode in options, return to the panel, and open the storage inspector.
6. **Climax:** the stored value renders in full, in monospace, unreadable. The encryption claim is demonstrated rather than asserted.
7. They restart the browser and reopen the panel: locked again, the ciphertext still there, the key gone.
8. **Honest limitation, stated in the view:** with the passphrase source, strength equals passphrase strength, and an attacker holding the ciphertext can attempt an offline attack.

### Flow 6 — Developer Mode makes a hung message visible

1. A developer evaluating the repository enables Developer Mode and opens the `dev` view.
2. The log stream replays the ring buffer, so events emitted before the view opened are present — up to 500 entries, with `500 entries (oldest discarded)` at the head once it wraps.
3. They trigger an action that crosses the side panel, the service worker, and a content script.
4. Each hop appears in one timestamped timeline, with request and response paired and the round trip in milliseconds — instrumented in `core/messaging.js` alone, with no Feature Module modified to support it.
5. They trigger an action against a page where the content script cannot run.
6. **Climax:** the request row stays marked `→req` in `warning` with no matching response. In DevTools that trace would be split across three windows with three unsynchronised clocks; here the hang is one line.
7. **Stated limitation, in the view:** the log cannot see uncaught errors in the page's `MAIN` world, and it only sees what goes through `core/logger.js`. Raw `console.log` calls stay invisible to it.
