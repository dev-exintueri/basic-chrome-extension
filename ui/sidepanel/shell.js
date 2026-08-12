// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall Hiding a view with an open dialog leaves two document listeners and a dead promise.
 * @alternative A view registry populated at load -- the auto-discovery NFR-3 forbids.
 * @scales-to The import list outgrows one screen -> one composition root per product area.
 */

import { el, clear } from '../../core/render.js';
import { makeError } from '../../core/errors.js';

/**
 * The side panel's composition root.
 *
 * **What it is for.** It declares nothing about any Module and knows nothing
 * about any Module. It mounts them by hand, derives its nav from what the
 * mounting produced, switches between the results, and opens the options
 * surface. Everything else a view needs it reaches through `core/panel.js`,
 * which acts on the three landmarks `shell.html` declares.
 *
 * **Why the import list is explicit.** AD-9 is the honest cost of NFR-3: no
 * registry, no auto-discovery, no glob, no side-effecting import. Adding a
 * Module means editing this file by hand, and both lines are stated verbatim in
 * that Module's own `AGENTS.md` so an agent applies them without inference and
 * removes them by deleting the same text. It fails loudly and greps cleanly.
 *
 * **Why the nav is not a registry either.** It is built from
 * `#views > section[data-module]` *after* mounting. Those sections exist only
 * because the explicit import list called each `mount`, so deleting a Module and
 * its two lines deletes its nav entry with it -- there is nothing to clean up and
 * no empty affordance left behind (AD-10, UX-DR15).
 *
 * **What it deliberately does not do.** It registers no `chrome.tabs`,
 * `chrome.webNavigation` or `chrome.windows` listener. The panel surviving a
 * navigation is Chrome's behaviour for a `side_panel.default_path` document, and
 * the way to keep it is to observe nothing: a shell that reacted to navigation
 * would be a shell that could get the reaction wrong. Nothing here reads or
 * touches a page either -- page access happens on user invocation, inside a
 * Module (UX-DR31, NFR-5).
 */

/**
 * Every Feature Module's view, mounted into the one container.
 *
 * The container is resolved once here and passed to every `mount` call, because
 * AD-10 fixes the contract at one argument: a view's first act is to append
 * **its own** `<section class="m-<module>" data-module data-label hidden>` into
 * whatever it was given. An API object passed in instead would be infrastructure
 * a copied slice cannot see.
 *
 * No Feature Module exists yet -- `features/read-page/` is story 1.12 -- so this
 * function is empty, and that is the correct output rather than a stub. The edit
 * a Module adds is always these two lines:
 *
 * ```js
 * import { mountReadPage } from '../../features/read-page/view.js';   // at the top
 * mountReadPage(document.querySelector('#views'));                    // in here
 * ```
 *
 * @returns {void}
 */
function mountViews() {
  // Intentionally empty. See above: the first Module lands here in story 1.12.
}

/**
 * Where each Module's view region was scrolled to when it was last on screen.
 *
 * `#views` is the panel's only scroll container, so its `scrollTop` is **shared**
 * between views. Toggling `hidden` preserves each view's DOM for free and its
 * scroll position not at all: switching away and back would silently drop the
 * user at the top of a list they had scrolled into (UX-DR15, EXPERIENCE.md).
 *
 * This is the shell's state about its own DOM, not a registry of Modules. It
 * holds no reference to a Module, it is keyed by what the DOM already says, and
 * an entry for a deleted Module is simply never read again.
 *
 * @type {Map<string, number>}
 */
const scrollTops = new Map();

/** The Module whose view is on screen, or `null` before the first switch. */
let active = /** @type {string | null} */ (null);

/**
 * The mounted views, in the order their `mount` calls ran.
 *
 * `:scope >` rather than a descendant sweep: a view is free to render a
 * `<section>` of its own inside its root, and treating one as a second mounted
 * view would put a nav entry on a Module's own subsection.
 *
 * @returns {HTMLElement[]}
 */
function sections() {
  const views = document.getElementById('views');
  if (views === null) {
    return [];
  }
  return /** @type {HTMLElement[]} */ ([...views.querySelectorAll(':scope > section[data-module]')]);
}

/**
 * A mounted section's Module name, read from the attribute rather than from
 * `dataset`, which is `string | undefined` and would push a `?? ''` into every
 * call site for a value the selector already guaranteed is present.
 *
 * @param {HTMLElement} section
 * @returns {string}
 */
function moduleNameOf(section) {
  return section.getAttribute('data-module') ?? '';
}

/**
 * Close whatever dialog is open, before anything hides the view that owns it.
 *
 * **This is the whole of story 1.7's Q9 and it is not optional.**
 * `core/panel.js` owns `#dialog-root` between open and close: it holds a
 * `keydown` listener and a `focusin` listener on `document`, and a promise that
 * settles only when one of its own controls fires. Hiding the view underneath
 * leaves all three standing -- the promise never settles, the two listeners
 * outlive the markup they guard, and the next Module's `openDialog` throws
 * `dialogs are never nested` against a dialog nobody can see.
 *
 * **Why `Escape` and not the button.** *`Escape` cancels* is a contract stated
 * in `DESIGN.md`, in `EXPERIENCE.md` and in `core/panel.js`'s own JSDoc; the
 * cancel button's class is that file's internal markup. A synthetic
 * `KeyboardEvent` is untrusted and performs no default action, which is fatal
 * when the thing under test is a focus trap and irrelevant here: the `Escape`
 * path is `preventDefault()` plus a settle, entirely listener-driven.
 *
 * The listener is registered on `document` in the capture phase, and a capture
 * listener on the event's own target runs in the at-target phase, so dispatching
 * on `document` reaches it.
 *
 * @returns {void}
 */
function closeAnyDialog() {
  const root = document.getElementById('dialog-root');
  if (root === null || root.querySelector('[role="dialog"]') === null) {
    return;
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
}

/**
 * Show one view and hide the rest.
 *
 * The order is load-bearing: close the dialog, save the outgoing scroll
 * position, toggle, restore the incoming one. Closing last would hide the view
 * first and produce exactly the leak `closeAnyDialog` exists to prevent, and
 * saving after the toggle would read the scroll position of whatever is on
 * screen by then.
 *
 * Selection is exclusive and is carried as `aria-current="true"` --
 * `aria-selected` is invalid on a `<button>` and screen readers ignore it
 * (UX-DR16, UX-DR33).
 *
 * @param {string} name The Module directory name of the view to show.
 * @returns {void}
 */
function switchTo(name) {
  const views = document.getElementById('views');
  if (views === null) {
    return;
  }
  closeAnyDialog();
  if (active !== null) {
    scrollTops.set(active, views.scrollTop);
  }
  for (const section of sections()) {
    section.hidden = moduleNameOf(section) !== name;
  }
  active = name;
  views.scrollTop = scrollTops.get(name) ?? 0;
  for (const item of document.querySelectorAll('.nav-item')) {
    const current = item.getAttribute('data-module') === name;
    if (current) {
      item.setAttribute('aria-current', 'true');
    } else {
      item.removeAttribute('aria-current');
    }
  }
}

/**
 * Build the module nav from the sections mounting produced.
 *
 * One entry per mounted view, always -- the *container* is hidden when there are
 * fewer than two, rather than the entries being conditionally built, so there is
 * one code path and the count is the same fact at every arity. `hidden` takes
 * the buttons out of the tab order with it, so a hidden nav strands no focusable
 * control (UX-DR15, NFR-7).
 *
 * @returns {void}
 */
function buildNav() {
  const nav = document.getElementById('module-nav');
  if (nav === null) {
    return;
  }
  const mounted = sections();
  clear(nav);
  nav.hidden = mounted.length < 2;
  for (const section of mounted) {
    const name = moduleNameOf(section);
    nav.append(el('button', {
      type: 'button',
      class: 'nav-item',
      'data-module': name,
      onclick: () => switchTo(name),
    }, section.getAttribute('data-label') ?? name));
  }
}

/**
 * Open the options surface, and report the failure this build is specified to
 * produce.
 *
 * `chrome.runtime.openOptionsPage()` and never a constructed URL (UX-DR14): an
 * extension page reached by a hand-built `chrome-extension://` string bypasses
 * Chrome's own embedded-options behaviour and breaks the moment `options_ui`
 * changes shape.
 *
 * **Measured, not assumed.** With no `options_ui` declared the call returns a
 * promise that *rejects* with `Could not create an options page.`, and
 * `chrome.runtime.lastError` stays `null`. It does not throw synchronously and
 * it does not resolve silently. The rejection message is Chrome's own English
 * prose and is carried as the `cause` rather than matched: a repository that
 * branched on it would break on a Chrome that reworded it.
 *
 * `unavailable` is the right word from the four because nobody can act on it
 * right now -- the options page is not something the user can switch to or retry
 * into existence (AR-8, EXPERIENCE.md *Failure vocabulary*).
 *
 * @returns {Promise<{ ok: true, data: null }
 *   | { ok: false, error: { code: string, message: string, cause?: unknown } }>}
 */
async function openOptions() {
  try {
    await chrome.runtime.openOptionsPage();
    return { ok: true, data: null };
  } catch (cause) {
    return {
      ok: false,
      error: makeError(
        'unavailable',
        'This build declares no options page. It appears once a version declaring options_ui is installed.',
        cause,
      ),
    };
  }
}

/**
 * Draw the shell's banner, or clear it.
 *
 * Structure is label, then cause, then what would change it (UX-DR19). **The
 * label is derived from the code, not typed beside it** -- AR-8 says the code
 * *is* the banner label, so the two cannot drift.
 *
 * The container is not created here: it is in `shell.html` from mount, because a
 * live region inserted at the same moment as its text is frequently never
 * announced (EXPERIENCE.md). Only its contents change.
 *
 * @param {{ code: string, message: string } | null} error
 * @returns {void}
 */
function showBanner(error) {
  const slot = document.getElementById('banner');
  if (slot === null) {
    return;
  }
  clear(slot);
  if (error === null) {
    return;
  }
  const label = error.code.charAt(0).toUpperCase() + error.code.slice(1);
  slot.append(el('div', { class: `banner ${error.code}` }, [
    el('span', { class: 'label' }, label),
    ` — ${error.message}`,
  ]));
}

/**
 * Wire the header's one affordance.
 *
 * A missing `#settings` is a host's choice rather than a failure, the same way
 * `core/panel.js` treats a missing landmark: this file degrades and does not
 * throw (NFR-6).
 *
 * @returns {void}
 */
function wireSettings() {
  const settings = document.getElementById('settings');
  if (settings === null) {
    return;
  }
  settings.addEventListener('click', () => {
    void openOptions().then((result) => {
      showBanner(result.ok ? null : result.error);
    });
  });
}

/**
 * Mount, derive, select, wire -- in that order, and once.
 *
 * The nav can only be built after mounting, because mounting is what creates the
 * sections it reads. The first mounted view becomes the active one; with none
 * mounted there is nothing to select and nothing to show, which is the state
 * this repository is in until story 1.12.
 *
 * @returns {void}
 */
function start() {
  mountViews();
  buildNav();
  const first = sections()[0];
  if (first !== undefined) {
    switchTo(moduleNameOf(first));
  }
  wireSettings();
}

start();
