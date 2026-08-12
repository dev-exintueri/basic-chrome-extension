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
   <div id="views"></div>
   <div id="status" role="status"></div>
   <div id="dialog-root"></div>
   ```

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

   `side_panel` and the `sidePanel` permission are Chrome 114. The 116 is
   `chrome.sidePanel.open()`, the only route from a toolbar gesture to the panel and therefore the
   version at which this repository's own demonstration works end to end. A target extension that
   opens its panel some other way can merge at 114 and lose nothing.

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
