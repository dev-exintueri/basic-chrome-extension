// @ts-check
/**
 * @tier required
 * @chrome-min 116
 * @permissions sidePanel
 * @pitfall A closing popup destroys its document, so a pending promise is dropped unreported.
 * @alternative setPanelBehavior({openPanelOnActionClick}) at 114 -- no gesture then reaches here.
 * @scales-to The launcher must report what it could not do -> a surface that outlives the click.
 */

import { el, clear } from '../../core/render.js';
import { makeError } from '../../core/errors.js';

/**
 * The popup's composition root, and the file that fixes this repository's Chrome
 * floor at 116.
 *
 * **What it is for.** It opens the side panel and says why it is not the side
 * panel. That is the whole surface. `DESIGN.md`'s *Surface Responsibility Model*
 * gives the Popup one thing to own -- *a minimal launcher demonstration* -- one
 * thing it must not do -- *host any main flow, drive a WebAuthn ceremony* -- and
 * one place for its state: *nothing*. All three are literal here. There is no
 * injection, no messaging, no storage, and no module-scope value that means
 * anything after the document dies.
 *
 * **Why this file carries the floor.** `chrome.sidePanel.open()` is Chrome 116.
 * `chrome.sidePanel` itself, and the `side_panel` manifest key `ui/sidepanel/`
 * uses, land at 114. AR-D3 says a permission is declared by the file that
 * *calls* the API, and this is that file: the `sidePanel` permission and the 116
 * are declared here, in a Module that would raise them even if `ui/sidepanel/`
 * declared nothing at all. L12 takes a union and a maximum, so the root
 * manifest reads the same either way -- which is exactly why the question of who
 * *should* declare them could stay open for a story and a half.
 *
 * **What it deliberately does not do.** It declares no manifest key of its own.
 * `action.default_popup` is a **base manifest key**: it belongs to the
 * repository rather than to any Module, exactly like `background.service_worker`
 * (AR-D14, AR-17, `DESIGN.md` *The file set the walk covers*). A fragment that
 * declared it would fail the Acceptance Check's merge assertion in story 3.7 --
 * and would fail it as an equality over a set nobody can produce, which is the
 * hardest kind of failure to read. `ui/popup/AGENTS.md` step 4 says so in the
 * one place a Consuming Agent will look.
 *
 * **The silent failure this surface has and no other surface here does.** A
 * popup's document is destroyed the moment the popup closes, and every pending
 * promise goes with it: no rejection, no console line, no trace. So a failure
 * that resolves *after* the popup is gone is a failure nobody will ever see --
 * the user is left believing the panel opened. Nothing in this file can repair
 * that; the only real remedy is to not put work in a popup, which is the
 * argument the surface exists to make. It is on the tag because it produces a
 * wrong result while raising nothing, which is the Pitfall Register's admission
 * criterion, and the register is a floor rather than a ceiling.
 */

/** The id of the one control, used by three functions and typed once. */
const CONTROL = 'open-panel';

/**
 * The tab the panel will be opened beside, or `null` until it resolves -- and
 * for ever, in a window that has no real tab.
 *
 * **Module scope, and it is not state the Surface Responsibility Model forbids.**
 * The row says the Popup's state lives in *nothing*, meaning nothing durable and
 * nothing another Surface can observe. This binding is neither: it dies with the
 * document, which is a few seconds later at the outside.
 *
 * @type {number | null}
 */
let tabId = null;

/**
 * The active tab of the current window, or `null` when there is none.
 *
 * **A popup is not a tab**, so `{ active: true, currentWindow: true }` from
 * inside one resolves the page *underneath* -- which is the tab the user is
 * looking at and the tab the panel belongs beside. The same query from an
 * extension page opened in a tab resolves that page itself (story 1.8), so a
 * harness driving this file by URL can prove which id was passed and can never
 * prove the id belongs to the page underneath. That half is a human check.
 *
 * **No permission is needed and none is taken.** `chrome.tabs.query` works
 * without the `tabs` permission; what it withholds is `url`, `title` and
 * `favIconUrl`, none of which this file reads. Adding `tabs` to see a URL nobody
 * needs would give this extension standing access to every tab, which is the one
 * thing it exists to demonstrate the absence of.
 *
 * `chrome.tabs.TAB_ID_NONE` is `-1` and belongs to a window with no real tab --
 * a devtools window, an app window. It is a number, so a bare `typeof` test
 * admits it and `open()` is then refused with `No tab with id: -1`, a
 * vanished-tab diagnosis for a tab that never existed. Non-negative is the test
 * (`core/tabs.js` reaches the same conclusion for the injection path).
 *
 * @returns {Promise<number | null>}
 */
async function activeTabId() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && typeof tab.id === 'number' && tab.id >= 0 ? tab.id : null;
}

/**
 * Draw the popup's banner, or clear it.
 *
 * Structure is label, then cause, then what would change it (UX-DR19). **The
 * label is derived from the code, not typed beside it** -- AR-8 says the code
 * *is* the banner label, so the two cannot drift.
 *
 * The container is not created here: it is in `popup.html` from mount, because a
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
 * Open the side panel beside the tab that was active when this popup opened.
 *
 * **There is no `await` between the click and the call, and that is the whole
 * design of this function.** `chrome.sidePanel.open()` requires a user gesture.
 * A handler that resolved the tab first would issue the call from a later task,
 * and how long the activation a click creates survives an intervening `await` is
 * not something Chrome specifies. Resolving the tab when the document loads
 * means this file never has to know the answer.
 *
 * **It is not a repair of an observed failure, and saying otherwise would be the
 * kind of claim this repository exists to stop.** Measured on Chrome
 * 151.0.7922.34: with the query moved inside the handler and a real trusted
 * click, `open()` was accepted -- one `await` of `chrome.tabs.query` did *not*
 * cost the gesture on that build. So the awaiting form is not known to be
 * broken; it is known to depend on an unspecified property, which is a different
 * and worse thing to ship. This shape depends on nothing.
 *
 * **The caching is correct because of this surface's own lifecycle, not in spite
 * of it.** A popup closes on any outside click, so the tab that was active when
 * it opened is still the active tab when its one button is pressed; there is no
 * window in which the cached id can go stale. The property that makes a popup
 * useless for a flow is the property that makes this safe.
 *
 * `failed` is the right word from the four: the user can act on it by clicking
 * again (AR-8, EXPERIENCE.md *Failure vocabulary*).
 *
 * @returns {void}
 */
function openPanel() {
  const control = document.getElementById(CONTROL);
  // aria-disabled is the announced state and therefore the real one. Reading it
  // back rather than keeping a second flag is what stops the two drifting: a
  // control that looks disabled and acts enabled is worse than either.
  if (tabId === null || control === null || control.getAttribute('aria-disabled') === 'true') {
    return;
  }
  showBanner(null);
  void chrome.sidePanel.open({ tabId }).then(
    () => {},
    (cause) => showBanner(makeError('failed', 'The side panel did not open. Try again.', cause)),
  );
}

/**
 * Wire the control, then resolve the tab it needs.
 *
 * The order matters and is the opposite of the obvious one. Resolving first and
 * wiring afterwards would leave a rendered, focusable button with no listener
 * for as long as the query takes -- a control that silently does nothing, which
 * is the failure shape this repository exists to stop. So the listener is
 * attached immediately and the button starts `aria-disabled`; the guard in
 * `openPanel` is what makes an early click a no-op the interface has already
 * explained rather than one it has not.
 *
 * `unavailable` is the right word for a window with no page: nobody can act on
 * it right now, and the remedy is a different window rather than a retry
 * (AR-8). The control stays rendered and focusable so the reader can still see
 * the code path that would run (UX-DR30).
 *
 * @returns {void}
 */
function start() {
  const control = document.getElementById(CONTROL);
  if (control !== null) {
    control.addEventListener('click', openPanel);
  }
  void activeTabId().then((id) => {
    tabId = id;
    if (id === null) {
      showBanner(makeError(
        'unavailable',
        'This window has no page to open the panel beside. Open a tab and click the icon again.',
      ));
      return;
    }
    if (control !== null) {
      control.removeAttribute('aria-disabled');
    }
  });
}

start();
