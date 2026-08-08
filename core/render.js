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
 * The same is true of a checkbox's `checked` and an option's `selected`, both of
 * which carry a dirtiness flag. A caller that needs the live value writes it:
 *
 * ```js
 * const query = el('input', { type: 'text', id: 'q' });
 * query.value = state.query;              // the property, not the attribute
 * ```
 *
 * `<progress>` is **not** in that set: its `value` has no dirtiness flag and
 * reflects the attribute, so `el('progress', { max: 100, value: 40 })` is enough.
 *
 * **Where this file can run.** In a document, and nowhere else. Nothing here
 * touches `document` at module scope, so importing it into `sw.js` evaluates
 * cleanly and the worker starts normally; the `ReferenceError` arrives at the
 * first `el()` **call**, inside whatever handler made it, and surfaces as one
 * rejected response rather than as a dead worker. That is the harder failure to
 * trace, not the easier one. The six-tag vocabulary has no tag for a realm, so
 * it is said here.
 */

/**
 * A child `el()` accepts. `null`, `undefined` and `false` are skipped so that
 * `cond && el(...)` is writable; anything else that is not text or a node is a
 * call-site mistake rather than an empty render.
 *
 * A **number** is text, `0` included -- so guard with a boolean, never a count:
 * `matches.length && el(...)` renders a bare `0` when there are none, while
 * `matches.length > 0 && el(...)` renders nothing.
 *
 * @typedef {string | number | Node | null | undefined | false} Child
 */

/**
 * Reject a container that is not an element, rather than rendering into nothing.
 *
 * A no-op on an absent container is the failure this repository exists to
 * remove: the view reports success, the panel stays empty, and no error is
 * raised anywhere. Tolerating an absent landmark is `core/panel.js`'s job, and
 * it is a decision that belongs to the Module that knows the landmark is
 * optional -- not to the function holding the only reference to the DOM.
 *
 * `null` is named literally rather than through `shown()`, which reports it as
 * `a object` -- and an absent landmark is exactly the case this message exists
 * to diagnose.
 *
 * @param {Element} container
 * @param {string} fn Name of the calling export, for the message.
 * @returns {Element}
 * @throws {TypeError} If `container` is not an `Element`.
 */
function asElement(container, fn) {
  if (!(container instanceof Element)) {
    const seen = container === null ? 'null' : shown(container);
    throw new TypeError(`${fn}() needs an Element container, received ${seen}.`);
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
 * - a name starting with `on` -- an event binding, and the value **must** be a
 *   function. A string there would be written as an inline handler, which an
 *   extension page's content security policy drops without a word, so it is
 *   rejected rather than accepted into a control that never responds. The name
 *   is passed to `addEventListener` unchanged and must therefore be lower-case:
 *   DOM event types are case-sensitive, so `onRowSelected` would bind something
 *   no dispatcher ever sends. Bind a mixed-case custom event directly.
 * - `true` -- `name=""`, the boolean-attribute form. Note that `aria-*` are
 *   **not** boolean attributes: they take the literal strings `"true"` and
 *   `"false"`, which a caller writes as strings.
 * - an object -- rejected. `String({})` is `"[object Object]"`, so a style or
 *   dataset object would produce a silently unstyled element.
 * - anything else -- `setAttribute(name, String(value))`.
 *
 * @param {Element} element
 * @param {string} name
 * @param {unknown} value
 * @returns {void}
 * @throws {TypeError} On a property spelling, a bad handler, or an object value.
 */
function applyProp(element, name, value) {
  if (name === 'className' || name === 'htmlFor') {
    const attribute = name === 'className' ? 'class' : 'for';
    throw new TypeError(`el() takes the attribute "${attribute}", not the property "${name}".`);
  }
  if (value === null || value === undefined || value === false) {
    return;
  }
  if (/^on[a-z]/i.test(name)) {
    if (typeof value !== 'function') {
      throw new TypeError(`el() needs a function for "${name}", received ${shown(value)}.`);
    }
    if (!/^on[a-z][a-z0-9]*$/.test(name)) {
      throw new TypeError(`el() passes "${name}" to addEventListener as written; use a lower-case event name.`);
    }
    element.addEventListener(name.slice(2), /** @type {EventListener} */ (value));
    return;
  }
  if (typeof value === 'function') {
    throw new TypeError(`el() binds a function only on an on<event> name, received "${name}".`);
  }
  if (value === true) {
    element.setAttribute(name, '');
    return;
  }
  if (typeof value === 'object') {
    throw new TypeError(`el() cannot write "${name}" from ${shown(value)}; an attribute is text.`);
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
 * @throws {DOMException} `document.createElement` and `setAttribute` reject a
 *   name HTML does not allow -- `el('my tag')`, `el('div', {'data key': 1})` --
 *   and those messages name the offending token themselves.
 */
export function el(tag, props, children) {
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new TypeError(`el() needs a tag name, received ${shown(tag)}.`);
  }
  const element = document.createElement(tag);
  if (props !== null && props !== undefined) {
    // A plain object, and nothing else. A node or an array reaching `props` is
    // the omitted-props slip -- `el('li', el('span', null, text))` -- and both
    // pass a `typeof` test while `Object.entries` finds no keys on them, so the
    // child would be dropped and an empty element returned with no error.
    const proto = typeof props === 'object' ? Object.getPrototypeOf(props) : undefined;
    if (proto !== Object.prototype && proto !== null) {
      throw new TypeError('el() takes props as a plain object; a node or a list belongs in the third argument.');
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
 * container.querySelector(`[data-key=${CSS.escape(key)}]`)?.scrollIntoView();
 * ```
 *
 * `CSS.escape` is not decoration: a key taken from page text can hold a quote or
 * a bracket, and an unescaped one either raises `SyntaxError` or matches a
 * different row.
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
 * @throws {TypeError} On a bad argument, an unusable or duplicate key, a
 *   non-element row, a row returned twice, or a row whose own `data-key` differs.
 */
export function list(container, items, keyOf, renderItem) {
  const root = asElement(container, 'list');
  if (typeof items === 'string') {
    throw new TypeError('list() takes a collection of items; a string iterates per character.');
  }
  if (typeof (/** @type {any} */ (items)?.[Symbol.iterator]) !== 'function') {
    throw new TypeError(`list() needs an iterable of items, received ${shown(items)}.`);
  }
  if (typeof keyOf !== 'function') {
    throw new TypeError(`list() needs a keyOf function, received ${shown(keyOf)}.`);
  }
  if (typeof renderItem !== 'function') {
    throw new TypeError(`list() needs a renderItem function, received ${shown(renderItem)}.`);
  }

  // Rows land in a fragment, not in the container, so the container is untouched
  // until the last line: a throw anywhere below leaves the previous render
  // standing. One argument rather than a spread of rows also means no list is
  // large enough to exhaust the call's argument limit.
  const fragment = document.createDocumentFragment();
  const seen = new Set();
  const returned = new Set();
  let index = 0;
  for (const item of items) {
    const raw = keyOf(item, index);
    // Coercion is where a key goes silently wrong: String(undefined) is the
    // nine-character key "undefined", which passes every emptiness test and then
    // matches a lookup nobody meant to write.
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      throw new TypeError(`list() needs a string or number key, item ${index} produced ${shown(raw)}.`);
    }
    if (typeof raw === 'number' && !Number.isFinite(raw)) {
      throw new TypeError(`list() needs a finite key, item ${index} produced ${raw}.`);
    }
    const key = String(raw);
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
    // One node cannot be two rows: appending it twice moves it, so the list
    // would render fewer rows than it has items and say nothing.
    if (returned.has(row)) {
      throw new TypeError(`list() received one element for two items, again at item ${index}.`);
    }
    returned.add(row);

    const own = row.getAttribute('data-key');
    if (own !== null && own !== key) {
      throw new TypeError(`list() would overwrite data-key "${own}" with "${key}" at item ${index}.`);
    }
    row.setAttribute('data-key', key);
    fragment.append(row);
    index += 1;
  }
  root.replaceChildren(fragment);
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
