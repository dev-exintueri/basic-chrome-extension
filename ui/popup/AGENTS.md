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

   What transfers with it is one instruction: **resolve the tab when the document loads, not inside
   the click handler.** `chrome.sidePanel.open()` requires a user gesture, and a handler that awaits
   anything before calling it issues the call from a later task. Caching is sound because no
   interaction the *user* has with the page can change the active tab while a popup is open — the
   act of reaching another tab dismisses the popup. It is not a guarantee, and the code does not
   treat it as one: a page script or another extension can still activate or close a tab underneath,
   which is what the refusal path exists for.

   `popup.js` carries the reasoning and the measurement behind that choice; this step deliberately
   does not repeat them. One fact, one owner — a copy that restates judgement drifts from the
   original the first time either is edited, and this pair already proved it once.

2. Copy the Core Modules named under "Depends on" to `core/`.

   Optionally also copy `ui/tokens.css` to `ui/` and link it from this document. Without it the
   popup renders at the `var()` fallback values written into `popup.css`, which are this
   repository's light-mode defaults. **Take the sheet if your users may be in dark mode.**
   `popup.css` declares `color-scheme: light dark` and always ships, so Chrome will paint the
   scrollbar and any native widget dark while the colours stay light — readable, and visibly a
   half-applied theme rather than a coherent light one. The fallbacks exist so a harvested slice
   renders correctly rather than unstyled; they were never a second theme.

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
   Module that makes it. Merging `ui/sidepanel/` as well changes **neither of these two keys** —
   a union and a maximum are idempotent — but it does add a key of its own, and that key is the
   subject of the next paragraph.

   **This fragment does not give you a panel to open.** `chrome.sidePanel.open()` needs one already
   configured, and the key that configures it — `side_panel.default_path` — belongs to whichever
   Module owns the panel document, not to this one. This Module cannot declare it: the path would
   point at a file this directory does not contain. Merge `ui/sidepanel/` as well, or declare your
   own `side_panel` key.

   Measured: with this fragment alone, a real click reaches the call and Chrome rejects it with
   `No active side panel for tabId: <n>` — a condition no amount of reading this directory would
   have predicted. The popup reports it as `unavailable` and names the missing key, rather than as
   `failed`, because no number of retries can add a manifest key. Chrome's own text is carried as
   the error's `cause` and is not put on screen: the banner says what would have to be true, which
   is what UX-DR19 asks for where nobody can act.

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

   **`action` is a base key, so the fragment's collision rule does not protect it — check these two
   before you write it.** A target that already declares `action.default_popup` has its own popup
   silently replaced by this one. A target that opens its panel from a `chrome.action.onClicked`
   listener, or from `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`, has that path
   silently stopped: a declared popup takes the toolbar click, and neither Chrome nor any check in
   this repository will say so. Both are wrong results with nothing raised. If either applies, keep
   your existing `action` entry and reach `ui/popup/popup.html` some other way, or drop this Module.

5. Verify: load the extension unpacked, click the toolbar icon, click the control, then click into
   the page. `npm run check:module` does not cover this directory — the Acceptance Check replaces
   the shell with its own fixture, which is what makes a Feature Module's self-containment testable,
   and this is a composition root rather than a Feature Module.
