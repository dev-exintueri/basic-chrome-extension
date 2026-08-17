# ui/options

## What it does
Renders the extension's settings from `core/config.schema.js`, embedded inside `chrome://extensions`
rather than opened in a tab. It is the only legal writer of configuration, and it contains no key
name: every field comes from a declaration, so adding a setting is one entry in the schema and no
edit here. It is also the surface the side panel's header opens.

## Depends on
core/config.js, core/config.schema.js, core/storage.js, core/errors.js, core/render.js

## Copy procedure

1. Copy this directory to `ui/options/` in the target extension.

   What transfers with it is one instruction: **do not hand-write a field.** The whole value of this
   directory is that no per-key markup exists, so no per-key layout can either — and a field written
   by hand writes a storage key the generator also writes, which surfaces as two controls disagreeing
   about one stored value with nothing raised. `options.js` carries the reasoning; this step
   deliberately does not repeat it. One fact, one owner.

   `options.js` binds `change` and never `input`. That is not a style choice and reverting it is a
   defect — but **not for the reason this step used to give.** It said a write per keystroke exceeds
   the synced write-rate cap. It does not: `core/config.js` debounces every `sync` write inside `set`
   and re-arms the timer per call, so a whole typed word produces one write. The two reasons that do
   hold: a **`local`** key is not debounced at all, so `input` stores every intermediate keystroke and
   every stored value reaches every other realm; and every landed write returns through `subscribe` to
   the field that made it, so writing while the user types means rewriting the field while the user
   types. `options.js` carries the measurement.

2. Copy the Core Modules named under "Depends on" to `core/`.

   The list above is the **transitive closure**, not the three files `options.js` names in its own
   `import` statements: `core/config.js` reaches storage through `core/storage.js` and builds its
   failures with `core/errors.js`, and `core/render.js` reaches `core/errors.js` too. Copying only the
   directly-imported three leaves a page that fails to load with a module-resolution error, which is
   why this heading is the list of things that **break** rather than the list this directory mentions.

   **`core/storage.js` is what declares the `storage` permission**, so its own fragment is where that
   cost is stated; nothing in this directory declares it, because nothing here calls a `chrome.*` API.

   Also copy `ui/tokens.css` to `ui/` and link it from `options.html` — **or make one edit, stated
   below.** Without the sheet the page renders at the `var()` fallback values written into
   `options.css`, which are this repository's light-mode defaults, and that half is by design (AD-25).
   The half that is **not** optional is `color-scheme`: `options.css` declares `color-scheme: light
   dark` and always ships, and the one control here today is a **native checkbox**, so on a
   dark-preference machine with no token sheet Chrome paints the box dark while every colour around it
   stays light. That is a half-applied theme — the exact defect the declaration exists to prevent,
   arriving from the other side.

   So: **take the sheet, or change that one line to `color-scheme: light`.** Keeping neither is the
   only wrong answer, and the comment at the top of `options.css` says the same thing.

3. Merge this Manifest Fragment (array keys union and de-duplicate; `minimum_chrome_version`
   resolves to the maximum; any other scalar collision is an error):

   ```json
   {
     "options_ui": {
       "page": "ui/options/options.html",
       "open_in_tab": false
     }
   }
   ```

   **It declares no permission and no version floor, and both absences are load-bearing.** Nothing
   in this directory calls a `chrome.*` API: storage is reached through `core/config.js`, and a
   permission is declared by the file that *calls* the API. `options_ui` costs nothing, and
   `chrome.runtime.openOptionsPage()` — which is how the panel reaches this page — costs nothing
   either. The floor audit prices this Module at Chrome 88, which is the MV3 baseline, so every file
   here writes `baseline` and this fragment names no `minimum_chrome_version` for a merger to raise.

   **`options_ui` belongs in this fragment and not in your base manifest**, which is the opposite of
   the rule `ui/popup/`'s `action.default_popup` follows. The distinction is ownership: `action` is a
   base manifest key belonging to the repository, while `options_ui` points at a file **this
   directory contains**, so this is the only Module that can honestly declare it.

   `open_in_tab: false` is not a preference. It is what makes the surface *embedded*, and the layout
   in `options.css` — one centred column at 560 px with 24 px gutters — exists because it is drawn
   inside a host page whose chrome it must not fight. Setting it to `true` gives a full-width tab in
   which that column looks like a mistake.

4. Wire the panel's entry point, if you have a panel.

   `chrome.runtime.openOptionsPage()` opens this page from anywhere in the extension and needs no
   permission. Until an `options_ui` key exists that call **rejects**, so a surface offering the link
   before merging this fragment reports a failure rather than doing nothing. Measured both ways: with
   the key declared the promise resolves; without it, it rejects with Chrome's own
   `Could not create an options page.` — carried as the error's `cause` and never matched, because a
   Chrome that reworded it would break anything that did.

5. Verify: load the extension unpacked, open `chrome://extensions`, and click Details then Extension
   options. Add a key to `core/config.schema.js`, reload, and confirm a field appeared without any
   other file changing — that is the claim this directory exists to make, and it is the one step worth
   doing by hand. There is no `npm run` command to check it: this repository declares no scripts yet.
