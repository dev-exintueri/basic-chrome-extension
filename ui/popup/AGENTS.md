# ui/popup

## What it does
Opens the side panel from the toolbar, and states that the panel is where every flow lives. It hosts
none of them, and the reason is the surface itself: a popup closes on any click into the page, which
breaks the produce-a-list-then-act-on-the-page loop this repository is built around. It is the only
file here that calls `chrome.sidePanel.open()`.

## Depends on
core/render.js, core/errors.js

## Copy procedure

1. Copy this directory to `ui/popup/` in the target extension.

   What transfers with it is one decision worth keeping: **resolve the tab when the document loads,
   not inside the click handler.** `chrome.sidePanel.open()` requires a user gesture, and a handler
   that awaits anything before calling it issues the call from a later task — and how long a click's
   activation survives an intervening await is not something Chrome specifies. Resolving up front
   means the code never has to know. It is safe to cache because a popup closes on any outside
   click, so the tab that was active when it opened is still the active tab when its one button is
   pressed.

   Measured on Chrome 151.0.7922.34, so that this reads as a design choice rather than as a bug
   report: with the query moved inside the handler, `open()` was still accepted. The awaiting form
   is not known to be broken. It is known to rest on something undocumented, and this one does not.

2. Copy the Core Modules named under "Depends on" to `core/`.

   Optionally also copy `ui/tokens.css` to `ui/` and link it from this document. Without it the
   popup renders at the `var()` fallback values written into `popup.css`, which are this
   repository's light-mode defaults — correct, but not theme-aware.

3. Merge this Manifest Fragment (array keys union and de-duplicate; `minimum_chrome_version`
   resolves to the maximum; any other scalar collision is an error):

   ```json
   {
     "permissions": ["sidePanel"],
     "minimum_chrome_version": "116"
   }
   ```

   The 116 is `chrome.sidePanel.open()`. `chrome.sidePanel` itself and the `side_panel` manifest key
   are 114; the call that opens the panel from a click is what raises the floor, and this is the
   Module that makes it. A target extension that merges `ui/sidepanel/` as well takes the maximum
   and the union, so both fragments together add nothing this one does not.

   **This fragment does not give you a panel to open.** `chrome.sidePanel.open()` needs one already
   configured, and the key that configures it — `side_panel.default_path` — belongs to whichever
   Module owns the panel document, not to this one. Merge `ui/sidepanel/` as well, or declare your
   own `side_panel` key. Measured: with this fragment alone, a real click reaches the call and Chrome
   rejects it with `No active side panel for tabId: <n>` — a rejection this popup reports faithfully
   in its banner, and one that no amount of reading this directory would have predicted.

4. **Declare `action.default_popup` in your base manifest, by hand:**

   ```json
   { "action": { "default_popup": "ui/popup/popup.html" } }
   ```

   **It is deliberately not in the fragment above, and adding it there is a defect.** `action` is a
   base manifest key: it belongs to the repository rather than to any Module, exactly like
   `background.service_worker` and `manifest_version`. The Acceptance Check asserts that the root
   manifest equals the base keys plus the merge of every present fragment, scoped to
   Module-contributed keys — so a fragment that declares `action` breaks that equality against a
   correct extension, and breaks it as a set comparison rather than as a missing file.

   Without this key the extension has no toolbar affordance at all, and nothing this directory
   contains can be reached.

5. Verify: load the extension unpacked, click the toolbar icon, click the control, then click into
   the page. `npm run check:module` does not cover this directory — the Acceptance Check replaces
   the shell with its own fixture, which is what makes a Feature Module's self-containment testable,
   and this is a composition root rather than a Feature Module.
