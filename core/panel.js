// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall A pending flash reverts the status line after its view stopped being the active one.
 * @alternative <dialog> showModal -- its top-layer backdrop covers the header the scrim must not.
 * @scales-to a flow needs a dialog over a dialog -> the top layer, and a scrim per level
 */

import { shown } from './errors.js';
import { el, clear } from './render.js';

/**
 * The services a view needs from the panel, reached without importing the panel.
 *
 * **Why this file exists at all.** A view is mounted by the shell, so a view that
 * imported the shell back would close a cycle between the two files a consumer is
 * most likely to replace. The mount contract is fixed at one argument for the same
 * reason -- an API object passed in would be infrastructure a copied slice cannot
 * see. So both sides import this file instead, and this file reaches the shell
 * only through the three landmarks the shell declares: `#views`, `#status` and
 * `#dialog-root`.
 *
 * **What it holds.** Four constants and no mutable module scope. Everything a
 * handle remembers -- its standing count, its pending revert -- lives in the
 * closure `panelFor()` returns, so the file is not a registry of Modules and two
 * handles cannot reach each other's state.
 *
 * **Loud and quiet are decided here.** `core/render.js` throws when handed a
 * container that cannot hold children, and says so in its own prose: tolerating an
 * absent landmark is this file's job. So this file resolves each landmark itself
 * and returns early when it is `null`; it never passes a missing landmark down.
 * A bad argument from a caller is the other case and still throws, because a
 * misspelled module name is a programmer error and no shell can produce one.
 *
 * **Where this file can run.** In a document, and only usefully in one that
 * declares the landmarks. Nothing here touches `document` at module scope, so
 * importing it into `sw.js` evaluates cleanly and the failure arrives at the first
 * call. The six-tag vocabulary has no tag for a realm and none for a host's
 * markup, so both are said here.
 *
 * **What it does not do.** It sets `aria-modal` on the dialog and does not set
 * `inert` on anything behind it. `inert` is Chrome 102 and this file's every other
 * API is older than Manifest V3 itself; the focus trap below is what actually
 * keeps a keyboard user inside the dialog, and `aria-modal` is what UX-DR33 asks
 * for. A consumer whose floor is already above 102 can add `inert` in their shell.
 */

/**
 * A Module directory name: the same kebab-case grammar action names use on their
 * left side. Validated once, at `panelFor()`, which is also why the per-call
 * `[data-module="..."]` lookup below needs no `CSS.escape` -- a key in
 * `core/render.js` comes out of the page, and this comes out of a directory
 * listing.
 */
const MODULE_NAME = /^[a-z][a-z0-9-]*$/;

/** The outcome dwell time. DESIGN.md owns this number; no Module invents one. */
const FLASH_MS = 3000;

/**
 * The dialog title's id, fixed rather than generated. A counter would be
 * module-scope mutable state; a random id would need a source of randomness this
 * file has none of. It is safe as a constant only because a second dialog while
 * one is open is rejected below -- so there is never a second title in the
 * document. Relaxing that rule breaks this id.
 */
const DIALOG_TITLE_ID = 'panel-dialog-title';

/**
 * What `Tab` can reach. Native `disabled` is excluded because such an element is
 * genuinely out of the tab order; `aria-disabled` is not, which is the whole
 * reason DESIGN.md disables with the attribute rather than the property -- a
 * control a keyboard user cannot reach takes its explanation with it.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]),'
  + ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Is this Module's view the one on screen?
 *
 * Derived, never injected. AR-10 has the shell mount every view into the same
 * `#views` element and switch between them by toggling `hidden`, so the answer is
 * already in the DOM and asking for it as a callback would be the API object the
 * one-argument mount contract exists to prevent.
 *
 * Three ways to be inactive, and they are deliberately one answer: no `#views`
 * (the host shell declares no landmark), no section (this Module was never
 * mounted), or the section is hidden (another view is on screen).
 *
 * The test is the `hidden` **property**, and it is compared to `false` rather
 * than negated. `hidden="until-found"` reads back as a string, and a view the user
 * has to search for is not the active view either -- strictness resolves the
 * unknown state to inert, which is the safe direction for a shared channel.
 * `checkVisibility()` would answer more questions and is Chrome 105, which would
 * put a floor on this file for a fact `hidden` already carries.
 *
 * @param {string} moduleName
 * @returns {boolean}
 */
function isActive(moduleName) {
  const views = document.getElementById('views');
  if (views === null) {
    return false;
  }
  const section = /** @type {HTMLElement | null} */ (
    views.querySelector(`:scope > section[data-module="${moduleName}"]`)
  );
  return section !== null && section.hidden === false;
}

/**
 * The status line, but only when this Module is entitled to write it.
 *
 * Both reasons to refuse land here so there is exactly one gate: the shell may
 * declare no status line at all (NFR-6 -- degrade, do not throw), and a view that
 * is mounted but not on screen must not write to the system's only success
 * channel while the user is looking at something else.
 *
 * Resolved per call. The shell toggles `hidden` between calls, so an answer cached
 * at `panelFor()` time is a background view holding the channel.
 *
 * @param {string} moduleName
 * @returns {HTMLElement | null}
 */
function writableStatus(moduleName) {
  const status = document.getElementById('status');
  if (status === null || !isActive(moduleName)) {
    return null;
  }
  return status;
}

/**
 * Reject anything that is not an element, without `instanceof`.
 *
 * Same duck-typing rule as `core/render.js`: a node built by another realm's
 * document is still a node.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isElement(value) {
  return /** @type {any} */ (value)?.nodeType === 1;
}

/**
 * Normalise and check an `openDialog` argument.
 *
 * Everything here is a programmer error, so everything here throws. A dialog is
 * the one place in this repository where a view hands markup to the kernel, and a
 * spec that is quietly wrong produces a dialog with no name, no commit verb, or no
 * fields -- all of which look like a rendering bug rather than a call-site one.
 *
 * @param {unknown} spec
 * @returns {{ title: string, content: Element[], commitLabel: string, cancelLabel: string }}
 * @throws {TypeError} On any missing or mistyped member.
 */
function dialogSpec(spec) {
  const proto = spec !== null && typeof spec === 'object' ? Object.getPrototypeOf(spec) : undefined;
  if (proto !== Object.prototype && proto !== null) {
    throw new TypeError(`openDialog() needs a plain spec object, received ${shown(spec)}.`);
  }
  const {
    title, content, commitLabel, cancelLabel = 'Cancel',
  } = /** @type {Record<string, unknown>} */ (spec);

  /**
   * @param {unknown} value
   * @param {string} name
   * @returns {string}
   */
  const text = (value, name) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new TypeError(`openDialog() needs a non-blank ${name}, received ${shown(value)}.`);
    }
    return value;
  };

  const children = Array.isArray(content) ? content : [content];
  for (const child of children) {
    if (!isElement(child)) {
      throw new TypeError(`openDialog() needs elements as content, received ${shown(child)}.`);
    }
  }

  return {
    title: text(title, 'title'),
    content: /** @type {Element[]} */ (children),
    commitLabel: text(commitLabel, 'commitLabel'),
    cancelLabel: text(cancelLabel, 'cancelLabel'),
  };
}

/**
 * Build the dialog, take focus, and resolve once it closes.
 *
 * The chrome is this file's; the fields are the view's. A spec that described
 * fields would make the kernel a form generator, and the one generated form in
 * this repository is the options surface, generated from `core/config.schema.js`.
 *
 * `#dialog-root` is owned by this function between open and close: it appends the
 * scrim and the dialog into it and empties it again through `core/render.js`'s
 * `clear()`. The already-open check above is what keeps that ownership honest.
 *
 * The scrim is an element with a class and no style. DESIGN.md puts it over the
 * view region and the status line but **not** over the panel header, so that the
 * settings link stays reachable -- and that is a position, which `shell.css` owns.
 *
 * @param {HTMLElement} root The resolved `#dialog-root`.
 * @param {{ title: string, content: Element[], commitLabel: string, cancelLabel: string }} spec
 * @returns {Promise<boolean>} `true` committed, `false` cancelled.
 */
function openIn(root, spec) {
  // Captured before anything is appended: once focus moves into the dialog the
  // control that opened it is no longer `document.activeElement`.
  const opener = /** @type {HTMLElement | null} */ (document.activeElement);

  return new Promise((resolve) => {
    let settled = false;

    /** @param {boolean} committed */
    const settle = (committed) => {
      if (settled) {
        return;
      }
      settled = true;
      // Removed before the markup goes, because this listener is on `document`
      // and would otherwise outlive the dialog it guards -- and it would fight
      // the focus restoration two lines below.
      document.removeEventListener('focusin', onFocusIn);
      clear(root);
      // `focus()` on a detached element does nothing and raises nothing, so the
      // check is what makes the case visible. The opener is typically a list row,
      // and `core/render.js`'s `list()` discards every row on re-render, which is
      // that file's own pitfall composing with this one. When the opener is gone,
      // the browser's own fallback applies and focus is at the top of the
      // document: re-find the row by its `data-key` and focus it, or open the
      // dialog from a control the re-render does not replace.
      if (opener !== null && opener.isConnected) {
        opener.focus();
      }
      resolve(committed);
    };

    const title = el('h2', { id: DIALOG_TITLE_ID, class: 'panel-dialog-title' }, spec.title);
    const content = el('div', { class: 'panel-dialog-content' }, spec.content);
    // Primary last (UX-DR21), and there is no third: the spec cannot express one.
    const actions = el('div', { class: 'panel-dialog-actions' }, [
      el('button', {
        type: 'button', class: 'panel-button secondary', onclick: () => settle(false),
      }, spec.cancelLabel),
      el('button', {
        type: 'button', class: 'panel-button primary', onclick: () => settle(true),
      }, spec.commitLabel),
    ]);
    const dialog = el('div', {
      class: 'panel-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': DIALOG_TITLE_ID,
      // Written here rather than invented by `el()`: it is where focus lands when
      // the content holds nothing focusable, and where the guard puts it back.
      tabindex: '-1',
    }, [title, content, actions]);
    const scrim = el('div', { class: 'panel-scrim' });

    const focusables = () => /** @type {HTMLElement[]} */ (
      [...dialog.querySelectorAll(FOCUSABLE)]
    );
    const fields = () => /** @type {HTMLElement[]} */ (
      [...content.querySelectorAll(FOCUSABLE)]
    );
    const entry = () => fields()[0] ?? dialog;

    /** @param {FocusEvent} event */
    function onFocusIn(event) {
      if (!dialog.contains(/** @type {Node | null} */ (event.target))) {
        entry().focus();
      }
    }

    /** @param {KeyboardEvent} event */
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        settle(false);
        return;
      }
      if (event.key === 'Tab') {
        const items = focusables();
        if (items.length === 0) {
          event.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const here = document.activeElement;
        if (event.shiftKey && here === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && here === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      if (event.key === 'Enter') {
        // DESIGN.md: "Enter in the last field commits." Read literally -- the
        // last focusable element of the content region, not of the whole dialog,
        // whose last element is the commit button and handles Enter itself. A
        // textarea is excluded because Enter there is the newline.
        // Indexed rather than `.at(-1)`: `Array.prototype.at` is Chrome 92, above
        // Manifest V3's own 88, and this file claims `baseline`.
        const inContent = fields();
        const last = inContent[inContent.length - 1];
        const here = document.activeElement;
        if (last !== undefined && here === last && last.tagName !== 'TEXTAREA') {
          event.preventDefault();
          settle(true);
        }
      }
    };

    dialog.addEventListener('keydown', onKeydown);
    document.addEventListener('focusin', onFocusIn);
    root.append(scrim, dialog);
    entry().focus();
  });
}

/**
 * The panel services bound to one Module.
 *
 * ```js
 * const panel = panelFor('read-page');
 * panel.setStatus(`${rows.length} items`);
 * panel.flashStatus('copied to clipboard');
 * if (await panel.openDialog({ title: 'Unlock', content: [field], commitLabel: 'Unlock' })) { ... }
 * ```
 *
 * Every service is **inert while this Module is not the active view** and a
 * **no-op when the landmark it needs is absent**. Neither reports anything: an
 * absent landmark is a host's choice rather than a failure, and a background view
 * writing to the status line is the thing being prevented, not a thing to
 * announce. A Module keeps working through both.
 *
 * The returned object is frozen and holds exactly three functions. There is no
 * fourth service and no place to graft one, because everything else a view needs
 * it already owns: banners are rendered by the view inside its own root, and the
 * view's markup is `core/render.js`'s job.
 *
 * @param {string} moduleName The Module's directory name, kebab-case.
 * @returns {{
 *   setStatus: (text: string) => void,
 *   flashStatus: (text: string) => void,
 *   openDialog: (spec: {
 *     title: string,
 *     content: Element | Element[],
 *     commitLabel: string,
 *     cancelLabel?: string,
 *   }) => Promise<boolean>,
 * }}
 * @throws {TypeError} If `moduleName` is not a Module directory name.
 */
export function panelFor(moduleName) {
  if (typeof moduleName !== 'string' || !MODULE_NAME.test(moduleName)) {
    throw new TypeError(`panelFor() needs a Module directory name, received ${shown(moduleName)}.`);
  }

  /** The standing count, remembered here and never read back out of the DOM. */
  let standing = '';
  /** @type {number | undefined} */
  let pending;

  const revert = () => {
    pending = undefined;
    // Re-checked, not assumed: three seconds is long enough for the user to have
    // switched views or for the shell to have gone away.
    const status = writableStatus(moduleName);
    if (status !== null) {
      status.textContent = standing;
    }
  };

  /**
   * Set the standing count. `''` is legal and means this view has nothing to say.
   *
   * The text is recorded whether or not it is written. Recording is invisible;
   * writing is the hijack, so only the write is gated -- and a count recorded
   * while the view was in the background is the right thing to revert to once it
   * is on screen again.
   *
   * @param {string} text
   * @returns {void}
   * @throws {TypeError} If `text` is not a string.
   */
  const setStatus = (text) => {
    if (typeof text !== 'string') {
      throw new TypeError(`setStatus() needs a string, received ${shown(text)}.`);
    }
    standing = text;
    const status = writableStatus(moduleName);
    if (status !== null) {
      status.textContent = text;
    }
  };

  /**
   * Show a completed outcome, then revert to the standing count after 3 seconds.
   *
   * Flashing again while a revert is pending **cancels the first deadline**.
   * Without that, the first flash's timer lands in the middle of the second one
   * and replaces a fresh outcome with the count -- an action that reports itself
   * for one second instead of three, with nothing raised. It is worse if the
   * standing text were read back from the element: the first flash would then
   * become the count, permanently.
   *
   * Inert while the view is in the background, and that includes the timer. A
   * background view must not own a pending write to a shared element.
   *
   * @param {string} text
   * @returns {void}
   * @throws {TypeError} If `text` is not a non-blank string.
   */
  const flashStatus = (text) => {
    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new TypeError(`flashStatus() needs a non-blank string, received ${shown(text)}.`);
    }
    const status = writableStatus(moduleName);
    if (status === null) {
      return;
    }
    clearTimeout(pending);
    status.textContent = text;
    pending = setTimeout(revert, FLASH_MS);
  };

  /**
   * Open the panel's one overlay and resolve when the user closes it.
   *
   * Resolves `true` on commit and `false` on cancel -- including the cancels
   * nobody performed: an absent `#dialog-root` and a view that is not on screen
   * both resolve `false` with nothing rendered, so `if (await openDialog(...))`
   * degrades to "the user did not commit" rather than to a hang.
   *
   * A second dialog while one is open **throws**. EXPERIENCE.md says dialogs are
   * never nested, and unlike an absent landmark this is not something a host can
   * do to a Module -- it is a call site opening two.
   *
   * @param {{
   *   title: string,
   *   content: Element | Element[],
   *   commitLabel: string,
   *   cancelLabel?: string,
   * }} spec
   * @returns {Promise<boolean>}
   * @throws {TypeError} On a malformed spec, or a second dialog while one is open.
   */
  const openDialog = (spec) => {
    const checked = dialogSpec(spec);
    const root = document.getElementById('dialog-root');
    if (root === null || !isActive(moduleName)) {
      return Promise.resolve(false);
    }
    if (root.firstChild !== null) {
      throw new TypeError('openDialog() found #dialog-root occupied; dialogs are never nested.');
    }
    return openIn(root, checked);
  };

  return Object.freeze({ setStatus, flashStatus, openDialog });
}
