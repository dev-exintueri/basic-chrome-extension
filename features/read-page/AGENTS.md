# features/read-page

## What it does
Lists the headings the active page actually renders, on a click and never before one, and scrolls the
page to one when you activate its row. The panel calls `core/tabs.js`, which injects under
`activeTab` at the moment of the gesture; the walk returns plain data, and the view renders it as a
list with the count in the status line. Nothing here touches the page on mount, on tab switch, or on
navigation, and the extension holds no host permission of any kind.

## Depends on
core/errors.js, core/logger.js, core/messaging.js, core/panel.js, core/render.js, core/storage.js,
core/tabs.js

## Copy procedure

1. Copy this directory to `features/read-page/` in the target extension.

   What transfers with it is one instruction: **injected code returns its failures as data, and the
   view refuses any shape it does not recognise.** `collect-outline.js` and `view.js` carry the
   measurement behind that rule and the reasoning for it; this step deliberately does not repeat
   them. One fact, one owner — a copy that restates judgement drifts from the original the first
   time either is edited.

   **One of the two page operations is a file and the other is a function, and that is not a
   preference.** `chrome.scripting.executeScript()` accepts `args` only alongside `func`; a `files`
   injection takes no arguments at all. Reading the outline needs none, so it is a leaf file.
   Scrolling to the heading you chose is parameterised by construction, so it cannot be one. It lives
   in `view.js`, closes over nothing, and everything it needs arrives through `args`.

2. Copy the Core Modules named under "Depends on" to `core/`.

   That list is the transitive closure — `view.js` imports four of them and those four reach the rest
   — so you never have to follow a chain to find a fifth file.

   Optionally also copy `ui/tokens.css` to `ui/` and link it from your shell. Without it this view
   renders at the `var()` fallback values written into `view.css`, which are this repository's
   light-mode defaults — correct, but not theme-aware. **Take the sheet if your users may be in dark
   mode.** The fallbacks exist so a harvested slice renders correctly rather than unstyled; they were
   never a second theme.

3. Merge this Manifest Fragment (array keys union and de-duplicate; `minimum_chrome_version`
   resolves to the maximum; any other scalar collision is an error):

   ```json
   {}
   ```

   **It is empty, and that is not an omission.** A permission is declared by the file that *calls*
   the API, never by the file the API acts on. Nothing in this directory calls a `chrome.*` API:
   `view.js` calls `core/tabs.js`, and `core/tabs.js` is where `chrome.scripting.executeScript()` is
   invoked and where `activeTab` and `scripting` are declared. The leaf calls nothing at all. Nor does
   anything here require a Chrome version above the Manifest V3 minimum — the walk is DOM only.

   **So this fragment does not, on its own, give you a page you can read.** The injection needs
   `activeTab` and `scripting`, and they arrive with `core/tabs.js`, whose own fragment travels in
   `core/AGENTS.md`. Merge that too.

   Both omissions are reported, and they are reported differently, which is how you tell them
   apart. Without **`scripting`** Chrome does not expose the namespace at all, so the first press
   comes back as an `Unavailable` banner reading *"Script injection is not available here"*. With
   `scripting` but without **`activeTab`** the call reaches Chrome and is refused, and the banner is
   `Restricted` — *"This page has not granted access. Click this extension's toolbar icon on this
   page, then try again."* Both are correct reports of a manifest that is missing something, and
   neither names the line you have to add.

   **Nothing here declares a host permission, and nothing here should.** The point of this Module is
   that a useful page-reading capability needs none: access is granted by the user invoking the
   extension and it covers one tab until it navigates. If you find yourself adding `host_permissions`
   to make this work, the thing that is actually missing is the gesture — see step 4.

4. Add this line verbatim to `ui/sidepanel/shell.js`:

   ```js
   import { mountReadPage } from '../../features/read-page/view.js';
   ```

   and this line verbatim inside `mountViews()`:

   ```js
   mountReadPage(document.querySelector('#views'));
   ```

   That is the whole edit. There is no registry, no auto-discovery and no side-effecting import, so
   removing this Module means deleting the same two lines. Your shell must declare the landmarks
   `core/panel.js` acts on — `#views`, `#status` and `#dialog-root` — and this Module's root must end
   up as a **direct child** of `#views`; it appends itself there, so the only way to get that wrong is
   to pass something other than `#views` as the argument.

   **The user must reach the panel by invoking the extension, or this Module reports `restricted` and
   is right to.** Access to the active tab is granted by four gestures and by nothing else: clicking
   the extension's toolbar action, choosing one of its context-menu items, pressing one of its
   keyboard commands, and accepting one of its omnibox suggestions. A click inside an extension
   document — inside this panel, inside a popup — is not one of them. The grant covers the tab that
   was active when the gesture happened and lasts until that tab navigates to another origin.
   Measured, both directions, on Chrome 151.

   In this repository the route is the toolbar icon, then the popup's *Open side panel*, then this
   view. If your extension opens its panel some other way — a bookmarklet, a link, an automatic
   open on install — the panel will render, the control will work, and every press will be refused.
   That is not a bug in this Module; it is what holding no standing access means.

5. Verify: `npm run check:module -- read-page`

   That command does not exist yet in this repository — `package.json` declares no scripts, and the
   Acceptance Check that executes this file is built later. Until it does, the check is by hand: load
   the extension unpacked, click the toolbar icon, open the panel, press the control on an ordinary
   page and see the list; then do the same on a `chrome://` page and see the `restricted` banner with
   the control still enabled.

## Notes

`collect-outline.js` performs one operation with two silent failure modes, and its Annotation Block
has room for the one the Pitfall Register already names. This is the other one, continued here
rather than restated.

**A walk that yields can be truncated by the page, and the truncation looks like a complete
answer.** A `TreeWalker` computes its traversal live from the node it is parked on. The walk hands
the main thread back every 2000 elements so the page stays responsive, and in that window the page
may remove the subtree the walker is inside — an infinite-scroll feed recycling its container, an ad
slot swapping its DOM, a route change in a single-page application. On resume the ancestor chain no
longer reaches the root, `nextNode()` returns `null`, and the loop ends normally with a short list.

Nothing is raised, and a short outline is indistinguishable from a short page. The leaf therefore
checks that the node it is parked on is still connected after every yield, and reports
`The page changed while it was being read.` rather than returning what it has. If you replace the
yield, keep the check: they are one mechanism, and the interruptibility that makes the page
responsive is the same interruptibility that costs correctness here.
