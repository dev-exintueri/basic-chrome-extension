// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall A full re-render replaces every row, so focus and selection inside the list are lost.
 * @alternative innerHTML templating -- page text becomes markup and every view carries an escaper.
 * @scales-to list state outgrows a full re-render (per-row local state) -> a framework with a diff
 */

import { shown } from './errors.js';

/**
 * Three functions and no fourth: build an element, re-render a keyed list, empty
 * a container. Everything else a view needs is a direct DOM write on the element
 * this file hands back.
 *
 * **Why it is this small.** A view built here carries no rendering runtime into
 * the project it is copied into. The moment this file gains a template syntax,
 * a component lifecycle, or a diff, every copied view depends on it being
 * present and correct, and the copy stops being a copy.
 *
 * **What it holds.** Nothing. There is no module-scope state, no registry, no
 * cache and no side effect on import: importing this file twice and calling it
 * in either order produces the same DOM. That is what makes a full re-render
 * safe to reason about, and it is the property `list()` would have to give up to
 * become a reconciler.
 *
 * **Where the DOM is written directly.** Attributes go through `el()`; live
 * properties do not. `setAttribute('value', ...)` sets an input's *default*
 * value -- once the user has typed, the attribute and the value the element
 * actually holds diverge, and the element ignores the attribute with no error.
 * The same is true of `checked`, of `selected`, and of a `<progress>`'s `value`.
 * A caller that needs the live value writes it:
 *
 * ```js
 * const query = el('input', { type: 'text', id: 'q' });
 * query.value = state.query;              // the property, not the attribute
 * ```
 *
 * **Where this file can run.** In a document, and nowhere else. It calls
 * `document.createElement` at the first use, so importing it into `sw.js` is a
 * `ReferenceError` inside a service worker whose module graph then never
 * finishes evaluating -- a failure that presents as every later call to the
 * worker timing out with nothing logged anywhere. The six-tag vocabulary has no
 * tag for a realm, so it is said here.
 */

/**
 * A child `el()` accepts. `null`, `undefined` and `false` are skipped so that
 * `cond && el(...)` is writable; anything else that is not text or a node is a
 * call-site mistake rather than an empty render.
 *
 * @typedef {string | number | Node | null | undefined | false} Child
 */

/**
 * The two DOM *property* names whose HTML attributes are spelled differently.
 * `setAttribute` accepts both, lower-cases them, and yields an element that is
 * silently unstyled (`classname`) or a label bound to nothing (`htmlfor`). No
 * type checker sees it, because `props` is a bag of strings. Rejecting exactly
 * two names is cheap; growing this map is how the file becomes a framework.
 */
const MISSPELLED = new Map([
  ['className', 'class'],
  ['htmlFor', 'for'],
]);

/**
 * Reject a container that is not an element, rather than rendering into nothing.
 *
 * A no-op on an absent container is the failure this repository exists to
 * remove: the view reports success, the panel stays empty, and no error is
 * raised anywhere. Tolerating an absent landmark is `core/panel.js`'s job, and
 * it is a decision that belongs to the Module that knows the landmark is
 * optional -- not to the function holding the only reference to the DOM.
 *
 * @param {Element} container
 * @param {string} fn Name of the calling export, for the message.
 * @returns {Element}
 * @throws {TypeError} If `container` is not an `Element`.
 */
function asElement(container, fn) {
  if (!(container instanceof Element)) {
    throw new TypeError(`${fn}() needs an Element container, received ${shown(container)}.`);
  }
  return container;
}

/**
 * Apply one entry of `props` to an element.
 *
 * One rule per value class, in this order, so a reader can predict the output
 * from the value alone:
 *
 * - `null`, `undefined`, `false` -- the attribute is **not set at all**.
 *   Absence and `""` are different claims in HTML: `hidden=""` hides.
 * - `true` -- `name=""`, the boolean-attribute form. Note that `aria-*` are
 *   **not** boolean attributes: they take the literal strings `"true"` and
 *   `"false"`, which a caller writes as strings.
 * - a function -- bound with `addEventListener`. Written as an attribute it
 *   would be stringified into an inline handler, which an extension page's
 *   content security policy drops without a word.
 * - anything else -- `setAttribute(name, String(value))`.
 *
 * @param {Element} element
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 * @throws {TypeError} On a property spelling, or a function on a non-`on` name.
 */
function applyProp(element, name, value) {
  const attribute = MISSPELLED.get(name);
  if (attribute !== undefined) {
    throw new TypeError(`el() takes the attribute "${attribute}", not the property "${name}".`);
  }
  if (value === null || value === undefined || value === false) {
    return;
  }
  if (typeof value === 'function') {
    if (!/^on[a-z]/i.test(name)) {
      throw new TypeError(`el() binds a function only on an on<event> name, received "${name}".`);
    }
    element.addEventListener(name.slice(2).toLowerCase(), /** @type {EventListener} */ (value));
    return;
  }
  if (value === true) {
    element.setAttribute(name, '');
    return;
  }
  element.setAttribute(name, String(value));
}

/**
 * Append children as text and nodes. **A string is text, never markup.**
 *
 * Row text in this repository comes out of the page being read, so parsing a
 * child as HTML would put page-controlled markup into the panel -- a wrong
 * result, raised by nothing.
 *
 * @param {Element} element
 * @param {Child | Child[]} children
 * @returns {void}
 * @throws {TypeError} On a child that is neither text, a node, nor skippable.
 */
function appendChildren(element, children) {
  const each = Array.isArray(children) ? children : [children];
  for (const child of each) {
    if (child === null || child === undefined || child === false) {
      continue;
    }
    if (child instanceof Node) {
      element.append(child);
      continue;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      element.append(document.createTextNode(String(child)));
      continue;
    }
    throw new TypeError(`el() takes text or a Node as a child, received ${shown(child)}.`);
  }
}

/**
 * Build one element.
 *
 * ```js
 * const root = el('section', { class: 'm-find-text', 'data-module': 'find-text',
 *                              'data-label': 'Find text', hidden: true });
 * ```
 *
 * HTML only -- there is no namespace argument and no SVG. Nothing in the visual
 * system needs one: the single circular thing in it, the 8 px capability dot, is
 * a `<span>` a stylesheet rounds.
 *
 * @param {string} tag Element name, passed to `document.createElement`.
 * @param {Record<string, unknown> | null} [props] Attributes, or `on<event>` handlers.
 * @param {Child | Child[]} [children]
 * @returns {HTMLElement}
 * @throws {TypeError} On a bad tag, a bad prop, or a child that is not text or a node.
 */
export function el(tag, props, children) {
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new TypeError(`el() needs a tag name, received ${shown(tag)}.`);
  }
  const element = document.createElement(tag);
  if (props !== null && props !== undefined) {
    if (typeof props !== 'object') {
      throw new TypeError(`el() needs an object of props, received ${shown(props)}.`);
    }
    for (const [name, value] of Object.entries(props)) {
      applyProp(element, name, value);
    }
  }
  if (children !== undefined) {
    appendChildren(element, children);
  }
  return element;
}

/**
 * Render `items` into `container` as a **full keyed re-render**: every row is
 * built again and every previous row is discarded. There is no diff, no
 * reconciliation, no node reuse and no per-row state.
 *
 * **What the key is for.** Not reconciliation -- there is none. Each row carries
 * its key as `data-key`, which is the only way a caller can find a row again
 * after the re-render that threw away the node it was holding:
 *
 * ```js
 * container.querySelector(`[data-key="${key}"]`)?.scrollIntoView();
 * ```
 *
 * A duplicate key is rejected, because two rows nothing can tell apart is a
 * selection that lands on either one and a scroll that lands on the wrong match.
 *
 * **What it costs.** Focus and selection inside the list do not survive, because
 * the elements holding them are gone. Restore them from the key after the call
 * if they matter. When that stops being enough -- when a row owns state of its
 * own -- the replacement is a framework with a diff, not a cleverer `list()`.
 *
 * Rows are built first and swapped in with one `replaceChildren`, so a throw
 * from `renderItem` leaves the previous render standing rather than an empty
 * container, and a duplicate key is caught before anything is mutated.
 *
 * @template T
 * @param {Element} container Emptied and refilled. Must exist.
 * @param {Iterable<T>} items
 * @param {(item: T, index: number) => string | number} keyOf Stable, unique per item.
 * @param {(item: T, index: number) => Element} renderItem Returns the row's root element.
 * @returns {void}
 * @throws {TypeError} On a bad argument, an empty key, a duplicate key, or a non-element row.
 */
export function list(container, items, keyOf, renderItem) {
  const root = asElement(container, 'list');
  if (typeof (/** @type {any} */ (items)?.[Symbol.iterator]) !== 'function') {
    throw new TypeError(`list() needs an iterable of items, received ${shown(items)}.`);
  }
  if (typeof keyOf !== 'function') {
    throw new TypeError(`list() needs a keyOf function, received ${shown(keyOf)}.`);
  }
  if (typeof renderItem !== 'function') {
    throw new TypeError(`list() needs a renderItem function, received ${shown(renderItem)}.`);
  }

  const rows = [];
  const seen = new Set();
  let index = 0;
  for (const item of items) {
    const key = String(keyOf(item, index));
    if (key.length === 0) {
      throw new TypeError(`list() needs a non-empty key, item ${index} produced an empty one.`);
    }
    if (seen.has(key)) {
      throw new TypeError(`list() received the duplicate key "${key}" at item ${index}.`);
    }
    seen.add(key);
    const row = renderItem(item, index);
    if (!(row instanceof Element)) {
      throw new TypeError(`list() needs an Element per item, item ${index} produced ${shown(row)}.`);
    }
    row.setAttribute('data-key', key);
    rows.push(row);
    index += 1;
  }
  root.replaceChildren(...rows);
}

/**
 * Remove every child of `container`. Idempotent.
 *
 * @param {Element} container
 * @returns {void}
 * @throws {TypeError} If `container` is not an `Element`.
 */
export function clear(container) {
  asElement(container, 'clear').replaceChildren();
}
