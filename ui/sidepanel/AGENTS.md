# ui/sidepanel

## What it does
Hosts every Module's interface in a side panel that stays open while the user clicks into the
page. Declares the three landmarks `core/panel.js` acts on — `#views`, `#status` and
`#dialog-root` — mounts each Module by hand, derives its nav from what the mounting produced,
and opens the options surface from the header.

## Depends on
core/render.js, core/errors.js

## Copy procedure

1. Do not copy this directory. A target extension either already has a shell or needs one of its
   own, and either way that shell is what hosts the Modules being copied. What transfers is the
   contract: declare the same three landmarks, and declare the status line as a `role="status"`
   region that is present from the moment the document loads rather than created when something
   first has to be said.

   ```html
   <div id="view-region">
     <div id="views"></div>
     <div id="status" role="status"></div>
     <div id="dialog-root"></div>
   </div>
   ```

   **The wrapper is not decoration.** `#dialog-root` is positioned `absolute; inset: 0`, so it
   resolves against the nearest positioned ancestor. Without one, the scrim resolves against the
   viewport and covers the whole panel including its header — which is the outcome DESIGN.md names
   as "a dialog that traps the user in a 288 px box with no visible exit". Give the wrapper
   `position: relative` and put nothing in it but the view region and the status line, and the
   scrim covers exactly what it is specified to cover.

   Write `#status` and `#dialog-root` on one line each, with no whitespace between the tags. Both
   are styled through `:empty` — the status strip collapses to zero height while it has nothing to
   say — and a formatting newline is a text node that keeps `:empty` from ever matching. Collapse
   it rather than hiding it: a live region removed while empty and re-inserted together with its
   text is frequently not announced at all.

2. Copy the Core Modules named under "Depends on" to `core/`.

   Optionally also copy `ui/tokens.css` to `ui/` and link it from your shell. Without it the panel
   and every copied view render at the `var()` fallback values written into their own stylesheets,
   which are this repository's light-mode defaults — correct, but not theme-aware.

3. Merge this Manifest Fragment (array keys union and de-duplicate; `minimum_chrome_version`
   resolves to the maximum; any other scalar collision is an error):

   ```json
   {
     "permissions": ["sidePanel"],
     "side_panel": { "default_path": "ui/sidepanel/shell.html" },
     "minimum_chrome_version": "116"
   }
   ```

   `side_panel` and the `sidePanel` permission are Chrome 114. The 116 is the floor the base
   manifest declares, fixed by `chrome.sidePanel.open()` — the only route from a toolbar gesture to
   this panel, and the call the launcher surface makes. **Merge the fragment as written.** A target
   extension whose panel is reached some other way needs a floor of 114 for these two keys and can
   say so in its own manifest, but that is a decision about its build rather than a variant of this
   fragment, and the merge rule takes the maximum in either case.

4. Mount each Module by hand. There is no registry and no auto-discovery, so every Module adds
   exactly two lines to your shell script — one `import` at the top and one call inside the
   function that mounts views. Both lines are stated verbatim in that Module's own `AGENTS.md`.

   Close any open dialog before hiding the view that owns it. `core/panel.js` holds two `document`
   listeners and an unsettled promise for as long as its dialog is open, and it empties
   `#dialog-root` itself on close. A shell that hides the view underneath leaves all three
   standing, and the next Module's `openDialog` throws against a dialog nobody can see.
   Dispatching `Escape` on `document` is the documented way to close it from outside.

5. Verify: load the extension unpacked and open the panel. `npm run check:module` does not cover
   this directory — the Acceptance Check replaces the shell with its own fixture, which is what
   makes a Feature Module's self-containment testable in the first place.
