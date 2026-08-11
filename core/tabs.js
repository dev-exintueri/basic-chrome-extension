// @ts-check
/**
 * @tier required
 * @chrome-min 92
 * @permissions activeTab, scripting
 * @pitfall An injected function is serialized and cannot close over outer scope.
 * @alternative Declarative content_scripts -- forces broad host_permissions this repo avoids.
 * @scales-to One injection per gesture is not enough -> registerContentScripts with a lifecycle.
 */

import { makeError, shown } from './errors.js';
import { log } from './logger.js';

/**
 * The active tab, and the one way a Leaf Content Script is run against it.
 *
 * **The extension touches a page only when asked.** There is no
 * `content_scripts` entry anywhere in this repository, so nothing is injected on
 * navigation, on panel open, or on tab switch. Nothing here holds standing
 * access to any site.
 *
 * **`activeTab` is granted by four gestures and by nothing else**: clicking the
 * extension's action, choosing one of its context-menu items, pressing one of
 * its `commands` shortcuts, and accepting one of its omnibox suggestions. The
 * grant covers the tab that was active at that moment and lasts until it
 * navigates to another origin. **A click inside an extension document is not one
 * of them** -- not in a popup's page, not in the side panel. Measured: a real
 * trusted click inside an extension page grants nothing, and the injection is
 * refused with *"Cannot access contents of the page."* What makes the panel flow
 * work is the grant the *toolbar click* already made on that tab, still live when
 * the panel's button is pressed. A Consuming Agent copying this file into an
 * extension whose UI is opened some other way inherits that dependency, and this
 * paragraph is the only warning they will get.
 *
 * **The injection is issued where the gesture is, not routed through the service
 * worker.** A hop through the worker adds a place to hang without adding a
 * capability, and the worker may be asleep. Only work that spans Surfaces or
 * needs a privileged cross-origin `fetch` belongs there.
 *
 * **A leaf returns by returning.** Its value arrives as the `result` of the
 * `chrome.scripting.executeScript()` promise, and that is the whole return path:
 * a leaf does not message, does not export, and does not know its caller. That
 * is also why a leaf never logs -- an injected logger would need a
 * page-reachable file. This file records the injection and its outcome on the
 * leaf's behalf, tagged `cs`, which is how a leaf appears in the log stream
 * without ever calling into one.
 *
 * **Two silent failures, and only one fits the Annotation Block.**
 *
 * The first is on the tag: an injected *function* is serialised and re-created
 * inside the page, so it closes over nothing. A reference to an outer binding is
 * not an error -- it is `undefined` inside the page, and the leaf returns a
 * confidently wrong answer. Measured on Chrome 151: a function referring to an
 * outer `const` saw `undefined`, and the same value passed through `args`
 * arrived intact.
 *
 * The second has no room and lives here. **A leaf that throws is reported as
 * success.** `executeScript` resolves, and the `InjectionResult` for a leaf that
 * threw is `{ documentId, frameId, result: null }` -- byte for byte what a leaf
 * that returned `undefined` produces. There is no `error` property on the result
 * (measured on Chrome 151: `'error' in result` is `false`; the documented
 * `InjectionResult` fields are `result`, `frameId` and `documentId` and nothing
 * else). So this file **cannot** report a raised leaf as `failed` today, and it
 * does not pretend to: a leaf that wants its failure seen has to return it as
 * data. `unwrap()` below reads an `error` property anyway, so the day Chrome
 * grows one -- `chrome.userScripts.InjectionResult` already has it -- this file
 * starts reporting it without an edit.
 *
 * **A leaf's returned value crosses a JSON boundary.** A `Map`, a `Set`, a
 * `Date` and a DOM node all arrive as `{}`; a circular object arrives with the
 * cycle replaced by `null`. Nothing is raised, exactly as `chrome.storage`
 * reshapes rather than refuses. Leaves return plain data.
 *
 * **A tab's isolated world is shared across injections into it.** Measured on
 * Chrome 151: two files each declaring `function collect()` at top level both
 * ran and each returned its own value, and a third injection calling `collect()`
 * afterwards got the **second** file's -- the binding is overwritten and nothing
 * is raised. That is why a file leaf is a single IIFE creating no top-level
 * binding.
 *
 * **Why the active tab is resolved but never handed out.** The grant exists
 * because of the gesture. Exporting a `tabId` invites resolving on mount and
 * injecting later, which is the standing access this file exists to avoid, so
 * resolution and injection happen together or not at all.
 */

/** @typedef {{ code: string, message: string, cause?: unknown }} StructuredError */
/**
 * `data` is the leaf's returned value. It is **optional** for the same reason
 * `core/storage.js` and `core/messaging.js` make theirs optional: a leaf that
 * returns nothing produces an own key whose value is `undefined`, and JSON drops
 * it on the first hop across a Surface boundary. Typing it as required would
 * make a `Result` stop satisfying its own type by being forwarded.
 *
 * @typedef {{ ok: true, data?: unknown } | { ok: false, error: StructuredError }} Result
 */

/** The Surface tag every entry this file writes carries, on the leaf's behalf. */
const LEAF_SURFACE = 'cs';

/**
 * Bounds the **label** -- the path or function name -- never the assembled
 * message. Truncating the message instead would cut the ` -> ok` off the end of
 * a long path's completion line and make it identical to its own opening line,
 * which is the one thing a request/result pair exists to distinguish.
 * `core/logger.js` caps a message at 1000 characters; 120 for the label leaves
 * the assembled line far inside it.
 */
const LABEL_LIMIT = 120;

const NO_ACTIVE_TAB =
  'There is no active page to act on. Open a page in this window and try again.';
const CHROME_PAGE =
  'Chrome pages cannot be read by extensions. Open a normal page and try again.';
const WEB_STORE =
  'The Chrome Web Store cannot be read by extensions. Open a normal page and try again.';
const NOT_GRANTED =
  'This page has not granted access. Invoke the extension again on this page, then try again.';
const TAB_GONE =
  'The page closed or navigated before the extension could reach it. Open a page and try again.';
const NO_SCRIPTING =
  'Script injection is not available here. This is not an extension page or service worker, or this browser predates Chrome 92.';
const FILE_MISSING =
  'The injected file could not be loaded, which is a packaging defect in this extension.';
const UNSERIALISABLE =
  'The arguments could not be serialised for injection. Pass only values JSON can carry.';
const NO_RESULT = 'The injection produced no result for the page. Open a page and try again.';
const TAB_LOOKUP_FAILED =
  'The active page could not be identified. Open a page in this window and try again.';
const UNRECOGNISED =
  'The injection did not complete and the browser gave a reason this extension does not recognise.';

/**
 * How Chrome's refusals map onto the four failure words.
 *
 * Every string matched below was **produced** rather than remembered: the
 * harness made Chrome 151 reject each way and recorded the message verbatim.
 * That matters because there is nothing else to match on -- a rejected
 * `executeScript` throws a plain `Error` with no code, no name of its own, and
 * no structured cause. So this table matches English prose Chrome owns and can
 * reword, and a reworded message falls through to `unknown` rather than to a
 * wrong diagnosis. The fall-through direction is the whole reason the last row
 * is `unknown` and not `restricted`: telling someone to switch tabs when the
 * real fault is a defect in this extension sends them somewhere no fix lives.
 *
 * **Order is significant, and the first row is why.** Chrome's measured wording
 * for a privileged page is `Cannot access a chrome:// URL`, but the generic
 * no-access wording embeds the target URL -- `Cannot access contents of url
 * "..."` -- so a privileged URL arriving in that form would otherwise match the
 * permission row and be answered with "invoke the extension again", advice that
 * can never succeed there. The scheme test runs first for that reason.
 *
 * **`restricted` for the permission row is a judgement, recorded here.** The
 * four words are closed and each names who can act: nobody, the user by
 * switching tabs, the user by retrying, the user by probing. A page with no
 * live `activeTab` grant fits none exactly -- the remedy is a gesture, not a
 * tab switch and not a retry. `restricted` is chosen because its *meaning* --
 * "the target page is one this extension may not touch" -- is exactly true right
 * now, and because `failed` would invite the retry that cannot work. The message
 * carries the real remedy, since under the closed vocabulary the code is the
 * banner label and there is no mapping layer that could add one.
 *
 * @type {ReadonlyArray<{ match: RegExp, code: 'unavailable' | 'restricted' | 'failed' | 'unknown', message: string }>}
 */
const REFUSALS = Object.freeze([
  { match: /(?:chrome|chrome-extension|chrome-untrusted|devtools):\/\//i, code: 'restricted', message: CHROME_PAGE },
  { match: /extensions gallery cannot be scripted/i, code: 'restricted', message: WEB_STORE },
  { match: /Cannot access contents of/i, code: 'restricted', message: NOT_GRANTED },
  { match: /No tab with id/i, code: 'restricted', message: TAB_GONE },
  { match: /No frame with id/i, code: 'restricted', message: TAB_GONE },
  { match: /Could not load file/i, code: 'failed', message: FILE_MISSING },
  { match: /unserializable/i, code: 'failed', message: UNSERIALISABLE },
]);

/**
 * Bound to `LABEL_LIMIT`, cutting on a code point rather than a UTF-16 unit so
 * that a non-BMP character in a path cannot leave a lone surrogate in the log.
 *
 * @param {string} value
 * @returns {string}
 */
function short(value) {
  const points = [...value];
  return points.length <= LABEL_LIMIT ? value : `${points.slice(0, LABEL_LIMIT - 3).join('')}...`;
}

/**
 * Record one line on the leaf's behalf.
 *
 * **Never awaited**, and never able to fail an injection. `log()` from a
 * document Surface crosses `core/messaging.js` to the service worker, which can
 * mean waking it; putting that in front of `executeScript` would spend the
 * user's gesture on bookkeeping.
 *
 * **The `catch` is load-bearing, and an earlier version of this file was wrong
 * about why.** `core/logger.js` throws synchronously in *three* cases, not two:
 * a Surface name outside the set, a blank or over-long message, and -- the one
 * that matters here -- **a realm mismatch**. `assertSurface` rejects any tag but
 * `sw` from inside the service worker, so `log('cs', ...)` throws there. This
 * file's tag is fixed at `cs` by AD-5, and `core/tabs.js` is a Core Module a
 * consumer may legitimately call from `sw.js`. Without this `catch` that throw
 * escapes an `async` function as a **rejected promise**, so a caller written to
 * the documented contract -- `const r = await runFile(p); if (!r.ok) ...` --
 * gets an exception instead of a `Result`. Found by review, not by the first
 * harness, because every realm it built was a document realm.
 *
 * The cost is stated rather than hidden: **an injection issued from the service
 * worker records nothing.** The tag it would need is `sw`, and choosing it here
 * would contradict AD-5's "tagged `cs`, on the leaf's behalf". That is an
 * architecture decision, not one this file takes on its own.
 *
 * The **value a leaf returned is never recorded**: it is page content, and page
 * content is one accident away from being a secret. What is recorded is what was
 * injected and how it ended.
 *
 * @param {string} label What is being injected, already bounded.
 * @param {string} [outcome] The code, or `ok`; absent for the opening line.
 * @returns {void}
 */
function record(label, outcome) {
  try {
    void log(LEAF_SURFACE, outcome === undefined ? `inject ${label}` : `inject ${label} -> ${outcome}`);
  } catch {
    // The realm mismatch above. Diagnostics do not get to break the thing they
    // are describing.
  }
}

/**
 * @param {unknown} value
 * @param {string} name
 * @returns {asserts value is string}
 */
function assertPath(value, name) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-blank string, received ${shown(value)}.`);
  }
  // Surrounding whitespace and C0 controls are rejected outright rather than
  // trimmed, because the guards below are anchored at the first character and
  // Chrome strips exactly those characters when it resolves the path. Trimming
  // silently would leave the checks testing one string and the injection using
  // another; refusing says which argument was wrong.
  if (value !== value.trim() || /[\u0000-\u001F\u007F]/.test(value)) {
    throw new TypeError(
      `${name} must carry no surrounding whitespace or control characters, received ${shown(value)}.`,
    );
  }
  // An injected file is named by the extension's own code, never by the page.
  // Rejecting a scheme and a protocol-relative prefix keeps that true if a path
  // ever reaches here from data. It is a cheap guard on a cheap mistake rather
  // than a security boundary -- Chrome clamps `files` resolution to the
  // extension package, so the blast radius of a bad path is a failed load. The
  // real protection is that this argument is a constant at every call site.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    throw new TypeError(
      `${name} must be a path inside this extension, received ${shown(value)}. A URL is not an injection target.`,
    );
  }
  if (value.split('/').includes('..')) {
    throw new TypeError(`${name} must not contain a ".." segment, received ${shown(value)}.`);
  }
}

/**
 * Refuse a function that cannot survive being serialised into the page.
 *
 * Measured on Chrome 151: a **bound** function, a **native** function and a
 * **class** all satisfy `typeof x === 'function'`, are accepted by
 * `executeScript`, and resolve with `result: null` -- indistinguishable from a
 * leaf that returned nothing. Their `toString()` is `[native code]` or a class
 * body, neither of which is an invocable expression in the page. That is a
 * silent wrong answer produced by a call-site mistake, so it is refused here
 * where the mistake is, rather than reported later as a value.
 *
 * @param {unknown} func
 * @returns {asserts func is (...args: any[]) => unknown}
 */
function assertInjectable(func) {
  if (typeof func !== 'function') {
    throw new TypeError(`The injected function must be a function, received ${shown(func)}.`);
  }
  const source = Function.prototype.toString.call(func);
  if (/\{\s*\[native code\]\s*\}/.test(source)) {
    throw new TypeError(
      'The injected function must have a body. A bound or built-in function serialises to [native code] and runs as nothing in the page.',
    );
  }
  if (/^class[\s{]/.test(source)) {
    throw new TypeError(
      'The injected function must not be a class. A class body is not an invocable expression in the page.',
    );
  }
}

/**
 * The active tab of the current window, or `null` when there is none.
 *
 * `tab.url` is deliberately not consulted. Under this extension's permissions it
 * is **empty**: `url`, `pendingUrl`, `title` and `favIconUrl` are readable only
 * with the `tabs` permission, a matching host permission, or a live `activeTab`
 * grant, and this repository declares neither of the first two. Measured on
 * Chrome 151: with `activeTab` + `scripting` alone a queried tab carries `id`
 * and `status` and nothing else -- and a `chrome://` tab carries no `url` even
 * with `<all_urls>` granted, because `<all_urls>` does not match it.
 *
 * So the pages a URL filter would exist to refuse are exactly the pages whose
 * URL cannot be read, and there is no prefilter to write. Every refusal is
 * therefore Chrome's, caught and translated. **Adding the `tabs` permission
 * would make the URL readable and would also give this extension standing
 * access to every tab, which is the one thing it exists to demonstrate the
 * absence of.**
 *
 * `chrome.tabs.TAB_ID_NONE` is `-1` and belongs to a window with no real tab --
 * a devtools window, an app window. It is a number, so a bare `typeof` test
 * admits it and the injection is then refused with `No tab with id: -1`, a
 * vanished-tab diagnosis for a tab that never existed. Non-negative is the test.
 *
 * @returns {Promise<number | null>}
 */
async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const [tab] = tabs;
  return tab && typeof tab.id === 'number' && tab.id >= 0 ? tab.id : null;
}

/**
 * Translate anything thrown by the injection into one of the four words.
 *
 * @param {unknown} thrown
 * @returns {StructuredError}
 */
function refusal(thrown) {
  const message = thrown instanceof Error ? thrown.message : String(thrown);
  for (const known of REFUSALS) {
    if (known.match.test(message)) return makeError(known.code, known.message, thrown);
  }
  return makeError('unknown', UNRECOGNISED, thrown);
}

/**
 * Reduce the injection results to a `Result`.
 *
 * One injection into the top frame yields exactly one entry. An empty array
 * means the frame stopped existing between the query and the injection --
 * reported rather than unwrapped, because `results[0].result` on an empty array
 * is `undefined`, which is also what a leaf returning nothing gives.
 *
 * The `error` read is forward-looking and inert today: `scripting`'s
 * `InjectionResult` has no such property on Chrome 151, while
 * `chrome.userScripts.InjectionResult` already declares `error?: string` with
 * "`error` and `result` are mutually exclusive". One line now means a raised
 * leaf starts being reported as `failed` on the Chrome that adds it, instead of
 * staying a silent success until someone notices.
 *
 * @param {chrome.scripting.InjectionResult[]} results
 * @returns {Result}
 */
function unwrap(results) {
  const [first] = results;
  if (first === undefined) return { ok: false, error: makeError('failed', NO_RESULT) };
  const reported = /** @type {{ error?: unknown }} */ (/** @type {unknown} */ (first)).error;
  if (typeof reported === 'string' && reported.length > 0) {
    return { ok: false, error: makeError('failed', UNRECOGNISED, reported) };
  }
  return { ok: true, data: first.result };
}

/**
 * Resolve the active tab, inject once, reduce every outcome to a `Result`.
 *
 * @param {Omit<chrome.scripting.ScriptInjection, 'target'>} spec Everything but `target`.
 * @param {string} label What is being injected, for the record this leaves.
 * @returns {Promise<Result>}
 */
async function inject(spec, label) {
  const bounded = short(label);
  // Recorded before the availability guard, so that the one outcome meaning
  // "this Surface cannot inject at all" is not the only one absent from the
  // stream. `log()` in a realm with no `chrome` at all does nothing and reports
  // nothing, which is the correct amount of noise.
  record(bounded);

  if (typeof chrome === 'undefined' || !chrome.scripting || !chrome.tabs) {
    const error = makeError('unavailable', NO_SCRIPTING);
    record(bounded, error.code);
    return { ok: false, error };
  }

  // Resolution has its own failure path. Folding it into the injection's catch
  // would report "the injection did not complete" for a call that never issued
  // one, and no REFUSALS row matches a tabs-query message anyway.
  /** @type {number | null} */
  let tabId;
  try {
    tabId = await activeTabId();
  } catch (thrown) {
    const error = makeError('restricted', TAB_LOOKUP_FAILED, thrown);
    record(bounded, error.code);
    return { ok: false, error };
  }
  if (tabId === null) {
    const error = makeError('restricted', NO_ACTIVE_TAB);
    record(bounded, error.code);
    return { ok: false, error };
  }

  try {
    const results = await chrome.scripting.executeScript({ ...spec, target: { tabId } });
    const outcome = unwrap(results);
    record(bounded, outcome.ok ? 'ok' : outcome.error.code);
    return outcome;
  } catch (thrown) {
    const error = refusal(thrown);
    record(bounded, error.code);
    return { ok: false, error };
  }
}

/**
 * Run a Leaf Content Script file against the active tab.
 *
 * The file is a path inside this extension. It is injected into the `ISOLATED`
 * world, which is the default and is where every leaf in this repository lives;
 * `world` is never passed, and passing `'ISOLATED'` explicitly to say so would
 * raise this file's Chrome floor from 92 to 95 to restate a default.
 *
 * A tab's isolated world is **shared across injections into it**, so a leaf is
 * written as a single IIFE that creates no top-level binding. See the head
 * documentation for what was measured.
 *
 * @param {string} path Extension-relative, e.g. `features/read-page/collect.js`.
 * @returns {Promise<Result>} `data` is the leaf's completion value.
 * @throws {TypeError} If `path` is not a plain extension-relative path.
 */
export function runFile(path) {
  assertPath(path, 'The injected file path');
  return inject({ files: [path] }, `file ${path}`);
}

/**
 * Run a function against the active tab, with values passed through `args`.
 *
 * The function is **serialised and re-created inside the page**. It closes over
 * nothing -- not an outer variable, not an import, not a module constant -- and a
 * reference to one is `undefined` there rather than an error. Everything it needs
 * arrives through `args`.
 *
 * `args` is required rather than defaulted. A default would accept the caller who
 * meant to pass something and passed a mistyped variable, and this is the one
 * argument whose absence is indistinguishable at the call site from its
 * emptiness. Pass `[]` and mean it.
 *
 * Every value in `args` must be one JSON can carry. `undefined` cannot be:
 * measured on Chrome 151, `args: [undefined]` rejects with *"Value is
 * unserializable"*, which arrives here as `failed`. There is no way to detect it
 * before the call without re-implementing structured clone, so it is reported
 * rather than refused.
 *
 * @param {(...args: any[]) => unknown} func Serialised; closes over nothing.
 * @param {unknown[]} args JSON-serialisable values, in the function's parameter order.
 * @returns {Promise<Result>} `data` is the function's return value in the page.
 * @throws {TypeError} If `func` cannot be serialised, or `args` is not an array.
 */
export function runFunction(func, args) {
  assertInjectable(func);
  if (!Array.isArray(args)) {
    throw new TypeError(
      `The injected function's args must be an array, received ${shown(args)}. Pass [] when it takes none.`,
    );
  }
  const name = func.name || '(anonymous)';
  return inject({ func, args }, `function ${name}`);
}
