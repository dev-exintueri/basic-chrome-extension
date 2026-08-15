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
 * popup's document is destroyed the moment the popup closes. A promise still
 * pending at that point has nothing left to settle into, so a failure that would
 * have resolved *after* the popup is gone reaches no banner and no console the
 * user still has open -- they are left believing the panel opened. Nothing in
 * this file can repair that; the only real remedy is to not put work in a popup,
 * which is the argument the surface exists to make.
 *
 * It is on the tag because it produces a wrong result while raising nothing,
 * which is the Pitfall Register's admission criterion, and the register is a
 * floor rather than a ceiling. **It is reasoned from the popup lifecycle, not
 * measured**: reaching it needs a real popup being dismissed, which is the class
 * of thing `popup-check.cjs` cannot drive at all -- it reaches this document as a
 * tab, and a tab is not destroyed by a click into a page. The story records that
 * as an open question rather than letting the tag imply an experiment.
 */

/**
 * The id of the one control.
 *
 * Named here because two functions look it up. It is **not** the only place the
 * id is written -- `popup.html` carries the same string as an attribute, and a
 * constant on this side cannot keep that side in sync. If the two drift, `start`
 * finds nothing to wire and `openPanel` finds nothing to enable; the surface then
 * renders with a permanently disabled button, which is the loudest failure a
 * document with no logger can produce.
 */
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
 * admits it, and the refusal that follows names a vanished tab rather than one
 * that never existed. Non-negative is the test. Story 1.8 measured that shape on
 * the injection path and `core/tabs.js` states the refusal string; **this file
 * has not measured it on `open()`** and does not quote one.
 *
 * **A toolbar popup can probably never see it.** It opens only from a browser
 * window's toolbar, and such a window always has an active tab -- closing the
 * last one closes the window; a devtools or app window has no toolbar to click.
 * The guard stays because it costs one comparison and because this file is
 * copied into surfaces whose reachability nobody here can know, but nothing in
 * this repository has produced the branch outside a harness that stubs the query.
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
 * Which of the four words a refused `open()` is, decided from the manifest
 * rather than from Chrome's prose.
 *
 * **Measured, and it is the reason this function exists.** With `ui/popup/`'s
 * Manifest Fragment merged and no `side_panel` key anywhere, a real click reaches
 * `chrome.sidePanel.open()` and Chrome rejects it with
 * `No active side panel for tabId: <n>`. Reporting that as `failed` tells the
 * user to *try again* -- and no number of retries can add a manifest key. The
 * word for a precondition of this build that nobody can act on right now is
 * `unavailable` (AR-8, EXPERIENCE.md *Failure vocabulary*).
 *
 * There are two such preconditions and they fail differently. Without the
 * `sidePanel` permission the namespace is not injected at all, so
 * `chrome.sidePanel.open` **throws synchronously** rather than rejecting. Without
 * the `side_panel` key the namespace exists and the promise rejects. Both arrive
 * here.
 *
 * **Branch on a fact, never on Chrome's English.** A repository that matched the
 * rejection text would break on a Chrome that reworded it; the manifest is the
 * thing that actually knows, and reading it costs nothing. This is the same
 * shape `ui/sidepanel/shell.js` uses for `options_ui`, for the same reason.
 *
 * @param {unknown} cause
 * @returns {ReturnType<typeof makeError>} One of the closed four -- `unavailable`
 *   for either missing precondition, `failed` for anything else.
 */
function refusal(cause) {
  if (chrome.sidePanel === undefined) {
    return makeError(
      'unavailable',
      'This build does not hold the sidePanel permission, so no panel can be opened from here.',
      cause,
    );
  }
  if (chrome.runtime.getManifest().side_panel === undefined) {
    return makeError(
      'unavailable',
      'This build declares no side panel. The launcher works once a version declaring side_panel is installed.',
      cause,
    );
  }
  return makeError('failed', 'The side panel did not open. Try again.', cause);
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
 * **The caching is safe because of this surface's own lifecycle, not in spite of
 * it.** A popup closes on any outside click, so **no interaction the user has
 * with the page can change which tab is active while this popup is open**: the
 * act of reaching another tab dismisses the document holding the cached id. That
 * is the property that makes a popup useless for a flow, doing the one job it is
 * good for.
 *
 * The claim is about the *user*, and stating it more broadly would be false. A
 * page script, another extension, or `chrome.tabs.update` elsewhere can still
 * activate or close a different tab while the popup stands. The refusal path
 * below is what covers that, and it is why the guard is not treated as a
 * guarantee.
 *
 * **One call in flight at a time.** Two clicks before the first settles start two
 * independent calls whose banners race: if the first fails and the second
 * succeeds the error is silently cleared, and if the order reverses a failure
 * banner stands over a panel that did open. The control carries `aria-disabled`
 * while the call is out and keeps its label and its place in the tab order --
 * never the native attribute (UX-DR17, EXPERIENCE.md). `ui/sidepanel/shell.js`
 * guards the identical shape for the identical reason.
 *
 * **The call is wrapped, because it does not only reject.** Without the
 * `sidePanel` permission `chrome.sidePanel` is not injected and
 * `chrome.sidePanel.open` throws a `TypeError` *synchronously* -- which a
 * two-argument `then` never sees, so the button would appear to do nothing at
 * all. That arrangement is one skipped step of this Module's own copy procedure
 * away.
 *
 * @returns {void}
 */
function openPanel() {
  const control = document.getElementById(CONTROL);
  // aria-disabled is the announced state and therefore the real one. Reading it
  // back rather than keeping a second flag is what stops the two drifting: a
  // control that looks disabled and acts enabled is worse than either, and it is
  // what makes the in-flight guard and the not-yet-resolved guard one test.
  if (tabId === null || control === null || control.getAttribute('aria-disabled') === 'true') {
    return;
  }
  showBanner(null);
  control.setAttribute('aria-disabled', 'true');
  let opening;
  try {
    opening = chrome.sidePanel.open({ tabId });
  } catch (cause) {
    control.removeAttribute('aria-disabled');
    showBanner(refusal(cause));
    return;
  }
  void opening.then(
    () => {
      // Reached only when the panel opened and this document somehow outlived it.
      // Restoring the control costs one line and leaves no state to explain.
      control.removeAttribute('aria-disabled');
    },
    (cause) => {
      control.removeAttribute('aria-disabled');
      showBanner(refusal(cause));
    },
  );
}

/**
 * Wire the control, then resolve the tab it needs.
 *
 * The order matters and is the opposite of the obvious one. Resolving first and
 * wiring afterwards would leave a rendered, focusable button with no listener
 * for as long as the query takes -- a control that silently does nothing, which
 * is the failure shape this repository exists to stop. So the listener is
 * attached immediately and the button starts `aria-disabled`.
 *
 * **What an early click gets, stated exactly.** The guard in `openPanel` swallows
 * it, and what the interface has said by then is `aria-disabled` on the control
 * and nothing else -- a screen reader announces it as unavailable, a sighted user
 * sees it drawn as Secondary in `text-faint`. There is no sentence, because
 * there is nothing yet to say: the query has not come back. The window is real
 * and short, and it is measured (`?probe=slow` holds it open).
 *
 * **Both halves of "no tab could be resolved" report.** The query resolving to
 * nothing usable is `unavailable` -- nobody can act on it, so UX-DR19 asks for
 * the condition that would have to be true rather than an instruction. The query
 * *rejecting* is `failed`: reopening the popup runs it again. A one-argument
 * `then` here would leave the control disabled for ever with an empty banner and
 * a console that dies with the document, which is the one outcome AC6 names.
 *
 * The control stays rendered and focusable throughout so the reader can still see
 * the code path that would run (UX-DR30).
 *
 * @returns {void}
 */
function start() {
  const control = document.getElementById(CONTROL);
  if (control !== null) {
    control.addEventListener('click', openPanel);
  }
  void activeTabId().then(
    (id) => {
      tabId = id;
      if (id === null) {
        showBanner(makeError(
          'unavailable',
          'No active tab was found in this window, so there is nothing to open the panel beside.',
        ));
        return;
      }
      if (control !== null) {
        control.removeAttribute('aria-disabled');
      }
    },
    (cause) => {
      showBanner(makeError('failed', 'The active tab could not be resolved. Open the popup again.', cause));
    },
  );
}

start();
