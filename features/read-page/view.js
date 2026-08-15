// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall A leaf that threw arrives as a success carrying no data, byte for byte.
 * @alternative Injecting the leaf as a function -- the folder would stop being the copy unit.
 * @scales-to A page's outline passes a few hundred rows -> render it in slices, not one pass.
 */

import { makeError, shown } from '../../core/errors.js';
import { panelFor } from '../../core/panel.js';
import { clear, el, list } from '../../core/render.js';
import { runFile } from '../../core/tabs.js';

/**
 * The `read-page` view.
 *
 * **What it does.** One control. Pressing it injects one leaf into the active
 * tab and renders what comes back as a list, with the count in the status line.
 * The extension holds no host permission and touches no page until this control
 * is pressed (FR-13, NFR-5, UX-DR31).
 *
 * **Why the injection is issued here.** R6: the gesture happened in the panel, so
 * the call is made in the panel. Routing it through the service worker would add
 * a hop and a place to hang without adding a capability, and would wake a worker
 * that has nothing to contribute.
 *
 * **What `activeTab` actually costs, and where the grant comes from.** Story 1.8
 * measured it on Chrome 151, both ways: the grant comes from **invoking the
 * extension** -- an action click, a context-menu item, a `commands` shortcut, an
 * omnibox suggestion -- and covers the tab that was active at that moment. A
 * click inside an extension document is not one of them. So this control works
 * because the user reached the panel by clicking the toolbar icon, and reports
 * `restricted` when they did not. That is not a defect to smooth over: it is the
 * permission model made visible, which is the whole of FR-13.
 *
 * **What it does not do.** It does not import the shell, which is why it takes a
 * container and reaches everything else through `core/panel.js` (AD-10). It holds
 * nothing durable, writes no storage and sends no message.
 */

/** The Module's directory name. It is the `data-module` value and the panel key. */
const MODULE = 'read-page';

/**
 * The leaf, as an extension-relative path.
 *
 * `runFile` and not `runFunction`: a function would have to live inside this
 * file, and then the folder would no longer be the copy unit AR-5 says it is.
 * The path is relative to the extension root rather than to this file, because
 * that is what `chrome.scripting.executeScript({ files })` takes.
 */
const LEAF = 'features/read-page/collect-outline.js';

/**
 * The `id` the stylesheet `<link>` is found by.
 *
 * AD-23 makes the sheet load itself so the shell stays at two lines, and fixes
 * the `id` so a second mount finds the first one's link instead of adding a
 * second. Namespaced by the Module, because a stranger's document is where this
 * has to be unique.
 */
const STYLE_ID = 'read-page-view-css';

/**
 * Which failure codes are `danger`, so which live region announces them.
 *
 * EXPERIENCE.md splits the banner by severity -- `role="status"` for warning,
 * `role="alert"` for danger -- and separately requires the container to be
 * present in the DOM from mount, because a live region inserted at the same
 * moment as its text is frequently not announced at all. Those two clauses can
 * only both hold if the role never changes after mount, and `core/tabs.js` can
 * return all four codes to this view, so it cannot narrow to one severity the way
 * `ui/popup/` could. Two containers is the shape that keeps both: one of each
 * role, present from mount, and never more than one of them populated.
 */
const DANGER_CODES = ['unavailable', 'failed'];

/**
 * Every label this surface can show, and the reason there is a fifth.
 *
 * The first four are `core/errors.js`'s closed set. `degraded` is not a failure
 * word: it marks a documented limitation in force **while the feature works**
 * (UX-DR29), so it is raised by this view rather than by an error, and it takes
 * the warning slot.
 *
 * This list exists to be checked. `core/tabs.js` types `error.code` as a plain
 * `string`, so the closed set does not survive the boundary and no type checker
 * can see a fifth code arrive. An unmapped code renders as a label nobody defined
 * against a neutral border -- the Pitfall Register entry for exactly this -- and
 * it renders *silently*, which is the half that matters.
 */
const NOTICE_CODES = ['unavailable', 'restricted', 'failed', 'unknown', 'degraded'];

/**
 * Mount the view into the container the shell passes every Module.
 *
 * **It appends its own root**, because AD-10 fixes the contract at one argument:
 * the shell hands the same `#views` element to every `mount` call and knows
 * nothing else about any of them. The root must be a **direct child** and its
 * `hidden` must be the boolean property -- `core/panel.js` decides whether this
 * Module is the active view by looking for
 * `#views > section[data-module="read-page"]` with `hidden === false`, and a
 * nested section or `hidden="until-found"` makes every panel service silently
 * inert for ever.
 *
 * **It is idempotent.** Called twice on the same container it appends one
 * section. The shell validates nothing about `data-module` -- not its grammar,
 * not its uniqueness (story 1.10 Q13) -- and it should not, because it must not
 * know a Module's name. Two sections carrying one name would give the nav two
 * entries pointing at the same view; closing that here is the Module closing the
 * one thing a hand-edited two-line block can actually produce.
 *
 * **It throws for exactly one reason.** `ui/sidepanel/shell.js` calls
 * `mountViews()` as the first statement of an unguarded `start()`, so a mount
 * that throws takes the nav, the view selection and the settings affordance with
 * it. That is correct and deliberate for a defect in a hand-edited line -- a
 * container that is not an element is a defect, and `core/render.js` and
 * `core/panel.js` both throw on the same class of mistake. Everything reachable
 * *after* that guard is a runtime state, and every one of them is reported rather
 * than thrown (NFR-6, AR-8).
 *
 * @param {Element | null} container The shell's `#views` element.
 * @returns {void}
 * @throws {TypeError} If `container` is not an element.
 */
export function mountReadPage(container) {
  const nodeType = /** @type {any} */ (container)?.nodeType;
  if (nodeType !== 1) {
    const seen = container === null ? 'null' : shown(container);
    throw new TypeError(`mountReadPage() needs the shell's #views element, received ${seen}.`);
  }
  const views = /** @type {Element} */ (container);
  if (views.querySelector(`:scope > section[data-module="${MODULE}"]`) !== null) {
    return;
  }

  loadStylesheet();

  /* One handle, taken once. Two `panelFor` calls for one Module do not share
   * standing text: each closes over its own, so the second handle's flash would
   * revert to the empty string and the first handle's count would vanish
   * (story 1.7 Q2). */
  const panel = panelFor(MODULE);

  const warningSlot = el('div', { class: 'banner-warning', role: 'status' });
  const dangerSlot = el('div', { class: 'banner-danger', role: 'alert' });
  const control = el('button', { type: 'button', class: 'btn primary' }, 'Read page');
  const results = el('div', { class: 'results' });

  /* Reused across renders rather than rebuilt, because `list()` is a full keyed
   * re-render of one container's children and wants to own them. */
  const rows = el('ul', { class: 'rows' });

  /** Whether the action has run. The empty state and "no results" differ by this
   * and by nothing else, and it is held rather than inferred from an empty array
   * -- EXPERIENCE.md states the discriminator as *whether the action ran*. */
  let hasRun = false;

  /** Whether an injection is outstanding. A second press while one is in flight
   * would inject twice into a world both leaves share. */
  let inFlight = false;

  /**
   * Show one banner, or none.
   *
   * The label is **derived from the code** by capitalising it, never typed beside
   * it, so the two cannot drift -- the code *is* the banner label (AR-8), which
   * is what makes rendering a failure a lookup rather than a mapping. The message
   * is `core/tabs.js`'s own, unaltered: this view adds no translation layer.
   *
   * Both slots are cleared first, so a second condition replaces the first rather
   * than queueing beneath it (UX-DR19).
   *
   * @param {{ code: string, message: string } | null} error
   * @returns {void}
   * @throws {TypeError} If `code` is not one this surface maps.
   */
  function showBanner(error) {
    clear(warningSlot);
    clear(dangerSlot);
    if (error === null) {
      return;
    }
    /* A code outside the mapped set is a defect in this file, not a runtime
     * state, and `core/errors.js` takes the same line -- `makeError` throws on a
     * code outside its four rather than letting one reach a banner. Refusing it
     * here is louder than rendering it in the wrong region with no colour. */
    if (!NOTICE_CODES.includes(error.code)) {
      throw new TypeError(
        `showBanner() cannot render the code ${shown(error.code)}; view.css maps ${NOTICE_CODES.join(', ')}.`,
      );
    }
    const slot = DANGER_CODES.includes(error.code) ? dangerSlot : warningSlot;
    slot.append(
      el('div', { class: `banner ${error.code}` }, [
        el('span', { class: 'label' }, error.code.charAt(0).toUpperCase() + error.code.slice(1)),
        ` — ${error.message}`,
      ]),
    );
  }

  /**
   * Render the one sentence that stands where a list would be.
   *
   * Two sentences, one element: before the action it names what will appear and
   * how to make it appear; after the action it names the outcome. No
   * illustration, no icon, no heading (UX-DR27).
   *
   * @returns {void}
   */
  function showSentence() {
    clear(results);
    results.append(
      el(
        'div',
        { class: 'empty' },
        el(
          'p',
          null,
          hasRun ? 'No headings on this page.' : 'Read the page to list the headings it renders.',
        ),
      ),
    );
  }

  /**
   * Render the outline.
   *
   * Keyed by index and not by text, because page headings repeat and `list()`
   * rejects a duplicate key outright. The key is therefore positional and cannot
   * be used to re-find a row across a re-render, which is what `list()` writes
   * `data-key` for; nothing in this view needs to, because nothing here opens a
   * dialog from a row.
   *
   * THE TRAILING META CARRIES THE HEADING'S LEVEL, AND DESIGN.md DOES NOT LIST
   * IT. That document closes the trailing meta at an index, a count or a length,
   * and a level is a fourth kind -- a classification. It is here because an
   * outline without depth is a flat list of sentences, and the alternative on the
   * permitted list, an index, repeats what the row's position already says. This
   * is a departure and it is recorded as an open question rather than argued away.
   *
   * `title` is on the text and not on the row, because the text is what was
   * truncated. A pointer user recovers the full heading by hovering it; a
   * keyboard-only user cannot, because the row takes no focus and `title` needs
   * hover -- which is the accessibility cost of a list with nothing to activate.
   *
   * @param {{ level: number, text: string }[]} headings
   * @returns {void}
   */
  function showHeadings(headings) {
    list(
      rows,
      headings,
      (_heading, index) => index,
      (heading) =>
        el('li', { class: 'row' }, [
          el('span', { class: 'row-text', title: heading.text }, heading.text),
          el('span', { class: 'row-meta' }, `h${heading.level}`),
        ]),
    );
    clear(results);
    results.append(rows);
  }

  /**
   * Report a failure the user cannot have caused by pressing the button.
   *
   * The status line is emptied rather than written to. It carries a count, a verb
   * in progress, or a completed outcome (UX-DR26); a failure is none of the
   * three, and the banner is where a state the user did not ask about belongs.
   *
   * @param {{ code: string, message: string }} error
   * @returns {void}
   */
  function fail(error) {
    showBanner(error);
    panel.setStatus('');
    /* THE LIST GOES WITH THE COUNT. A refusal means no outline is known for the
     * page in front of the user, and leaving the previous page's rows standing
     * would present them as this page's -- the status line clears, so the surface
     * would show twelve rows and assert nothing about them. Returning to the
     * pre-action sentence is the only state that is true: nothing has been read
     * here, and the control is still enabled so it can be. */
    hasRun = false;
    showSentence();
  }

  /**
   * Finish an injection, whatever it returned.
   *
   * The control is re-enabled **first and unconditionally**, including on a
   * `restricted` page: the remedy there is to switch tabs and press it again, so
   * a disabled control would take the remedy away (EXPERIENCE.md, UX-DR30).
   *
   * @param {{ ok: true, data?: unknown } | { ok: false, error: { code: string, message: string } }} result
   * @returns {void}
   */
  function settle(result) {
    inFlight = false;
    control.removeAttribute('aria-disabled');

    if (result.ok !== true) {
      fail(result.error);
      return;
    }

    /* `data` is optional on the envelope, and a leaf that THREW arrives here as
     * `{ ok: true, data: undefined }` -- indistinguishable at the `core/tabs.js`
     * boundary from one that returned nothing, because `executeScript` resolves
     * for both and the result carries no `error` key (story 1.8, measured on
     * Chrome 151). This branch is that leaf, and it is the reason the leaf
     * returns its own failures as data. */
    const outline = readOutline(result.data);
    if (outline === null) {
      fail(
        makeError(
          'failed',
          'The page returned nothing this view can read. Reload the page and try again.',
        ),
      );
      return;
    }
    if ('message' in outline) {
      fail(makeError('failed', outline.message));
      return;
    }

    /* A limitation, not a failure: the walk ran and it ran on less than the whole
     * page. Reporting `0 headings` for a document whose headings all live inside
     * custom elements or a frame would be a confident wrong answer, and UX-DR29
     * says this label is never suppressed for being inconvenient. */
    showBanner(outline.skipped === 0 ? null : {
      code: 'degraded',
      message: 'Headings inside frames and shadow DOM are not read. '
        + 'The outline covers this page\'s own document only.',
    });
    hasRun = true;
    if (outline.headings.length === 0) {
      showSentence();
    } else {
      showHeadings(outline.headings);
    }
    panel.setStatus(
      `${outline.headings.length} ${outline.headings.length === 1 ? 'heading' : 'headings'}`,
    );
  }

  /**
   * Read the active page, on the user's gesture and never otherwise.
   *
   * @returns {void}
   */
  function read() {
    if (inFlight) {
      return;
    }
    /* `setStatus`, and never `flashStatus`, anywhere in this file. UX-DR26 flashes
     * a completed outcome for three seconds and then reverts to the count -- and
     * here the outcome IS the count, so the flash would show the same words twice.
     * The success is visible in the list as well, so it is not the otherwise-
     * invisible kind that rule exists for. */
    inFlight = true;
    showBanner(null);
    /* `aria-disabled`, never the native attribute, which would take the control
     * out of the tab order and its explanation with it. The label does not
     * change -- the status line carries the verb (UX-DR17). */
    control.setAttribute('aria-disabled', 'true');
    panel.setStatus('reading…');

    /* `runFile` maps every refusal it knows to a code and returns it, so this
     * promise is not expected to reject. The rejection handler is here anyway,
     * because NFR-6 is about what the user sees and an unhandled rejection is a
     * console line nobody reads. */
    void runFile(LEAF).then(settle, (cause) => {
      inFlight = false;
      control.removeAttribute('aria-disabled');
      fail(makeError('failed', 'The page could not be read. Try again.', cause));
    });
  }

  control.addEventListener('click', read);

  const root = el(
    'section',
    {
      class: `m-${MODULE}`,
      'data-module': MODULE,
      'data-label': 'Read page',
      hidden: true,
    },
    [warningSlot, dangerSlot, el('p', { class: 'actions' }, control), results],
  );

  showSentence();
  views.append(root);
}

/**
 * Load this Module's stylesheet, once.
 *
 * AD-23: the sheet travels with the folder, so `view.js` loads it rather than the
 * shell linking it -- which is what keeps the shell's edit at two lines. The
 * `href` is resolved from this file's own URL rather than through
 * `chrome.runtime.getURL`. Not because that would cost a permission -- it costs
 * none, and the block's `none` would hold either way -- but because the sheet
 * sits beside this file and `import.meta.url` says so without naming an
 * extension API a copied slice would then depend on.
 *
 * @returns {void}
 */
function loadStylesheet() {
  if (document.getElementById(STYLE_ID) !== null) {
    return;
  }
  document.head.append(
    el('link', {
      id: STYLE_ID,
      rel: 'stylesheet',
      href: new URL('./view.css', import.meta.url).href,
    }),
  );
}

/**
 * Recognise what the leaf returned, or refuse it.
 *
 * The leaf returns one of two shapes and this function accepts exactly those
 * two. Everything else -- `undefined` from a leaf that threw, a `null`, a missing
 * `ok`, a `headings` that is not an array, a row missing `level` or `text` --
 * comes back as `null` and is reported as `failed`.
 *
 * It is deliberately strict rather than forgiving. A view that rendered whatever
 * it could out of a malformed payload would show a short list where the real
 * answer was an error, which is a wrong result with no error -- the defect class
 * this repository exists to eliminate.
 *
 * @param {unknown} data The leaf's completion value, as `core/tabs.js` returned it.
 * @returns {{ headings: { level: number, text: string }[], skipped: number }
 *   | { message: string } | null}
 */
function readOutline(data) {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const value = /** @type {Record<string, unknown>} */ (data);

  if (value.ok === false) {
    /* `.trim()`, not `!== ''`. `makeError` rejects a blank message, and a message
     * of spaces would pass a bare emptiness test, reach `makeError` inside the
     * fulfilment handler, and throw there -- where the sibling rejection handler
     * cannot catch it. The visible result would be an unhandled rejection, no
     * banner, and the status line frozen on the in-flight verb. */
    return typeof value.message === 'string' && value.message.trim() !== ''
      ? { message: value.message }
      : null;
  }
  if (value.ok !== true || !Array.isArray(value.headings)) {
    return null;
  }
  if (typeof value.skipped !== 'number' || !Number.isInteger(value.skipped) || value.skipped < 0) {
    return null;
  }

  /** @type {{ level: number, text: string }[]} */
  const headings = [];
  for (const entry of value.headings) {
    if (typeof entry !== 'object' || entry === null) {
      return null;
    }
    const row = /** @type {Record<string, unknown>} */ (entry);
    if (typeof row.level !== 'number' || !Number.isInteger(row.level)) {
      return null;
    }
    if (row.level < 1 || row.level > 6) {
      return null;
    }
    if (typeof row.text !== 'string' || row.text === '') {
      return null;
    }
    headings.push({ level: row.level, text: row.text });
  }
  return { headings, skipped: value.skipped };
}
