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
 * navigation, on panel open, or on tab switch. A Surface calls one of the two
 * functions below at the moment of a user gesture, `activeTab` covers that one
 * tab for as long as the user stays on it, and nothing here holds standing
 * access to any site.
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
 * else). So this file **cannot** report a raised leaf as `failed`, and it does
 * not pretend to: a leaf that wants its failure seen has to return it as data.
 * That is a rule for whoever writes a leaf, and it is stated here because this
 * is the file that would otherwise be expected to catch it.
 *
 * **A leaf's returned value crosses a JSON boundary.** A `Map`, a `Set`, a
 * `Date` and a DOM node all arrive as `{}`; a circular object arrives with the
 * cycle replaced by `null`. Nothing is raised, exactly as `chrome.storage`
 * reshapes rather than refuses. Leaves return plain data.
 *
 * **Why the active tab is resolved but never handed out.** The grant exists
 * because of the gesture. Exporting a `tabId` invites resolving on mount and
 * injecting later, which is the standing access this file exists to avoid, so
 * resolution and injection happen together or not at all.
 */

/** @typedef {{ code: string, message: string, cause?: unknown }} StructuredError */
/**
 * Success always carries `data` -- the leaf's returned value, which may itself
 * be `undefined`. `core/storage.js`'s `Result` leaves `data` optional because a
 * read of an absent key succeeds with nothing; there is no analogous case here,
 * so the two are written out separately rather than shared.
 *
 * @typedef {{ ok: true, data: unknown } | { ok: false, error: StructuredError }} Result
 */

/** The Surface tag every entry this file writes carries, on the leaf's behalf. */
const LEAF_SURFACE = 'cs';

/**
 * Keeps a log line short enough that `core/logger.js` can never reject it for
 * length. Its cap is 1000 characters; a path or a function name well under that
 * keeps the whole message inside it with room to spare.
 */
const LABEL_LIMIT = 120;

const NO_ACTIVE_TAB =
  'There is no active page to act on. Open a page in this window and try again.';
const CHROME_PAGE =
  'Chrome pages cannot be read by extensions. Open a normal page and try again.';
const WEB_STORE =
  'The Chrome Web Store cannot be read by extensions. Open a normal page and try again.';
const NOT_GRANTED =
  'This page has not granted access. Invoke the extension from its toolbar icon on this page, then try again.';
const TAB_GONE =
  'The page closed or navigated before the extension could reach it. Try again on an open page.';
const NO_SCRIPTING =
  'Script injection is not available in this browser. Requires Chrome 92 or later.';
const FILE_MISSING =
  'The injected file could not be loaded, which is a packaging defect in this extension.';
const UNSERIALISABLE =
  'The arguments could not be serialised for injection. Pass only values JSON can carry.';
const NO_RESULT =
  'The injection reported no result for the page. Try again on an open page.';
const UNRECOGNISED =
  'The injection did not complete and the browser gave a reason this extension does not recognise.';

/**
 * How Chrome's refusals map onto the four failure words.
 *
 * Every string below was **produced** rather than remembered: the harness made
 * Chrome 151 reject each way and recorded the message verbatim. That matters
 * because there is nothing else to match on -- a rejected `executeScript` throws
 * a plain `Error` with no code, no name of its own, and no structured cause. So
 * this table matches English prose Chrome owns and can reword, and a reworded
 * message falls through to `unknown` rather than to a wrong diagnosis. The
 * fall-through direction is the whole reason the last row is `unknown` and not
 * `restricted`: telling someone to switch tabs when the real fault is a defect
 * in this extension sends them somewhere no fix lives.
 *
 * Order is significant. The two `Cannot access` forms differ only in whether
 * Chrome knew the URL, which it does not for a page the extension cannot see.
 *
 * @type {ReadonlyArray<{ match: RegExp, code: 'unavailable' | 'restricted' | 'failed' | 'unknown', message: string }>}
 */
const REFUSALS = Object.freeze([
  { match: /Cannot access a chrome:\/\/ URL/i, code: 'restricted', message: CHROME_PAGE },
  { match: /Cannot access a chrome-extension:\/\/ URL/i, code: 'restricted', message: CHROME_PAGE },
  { match: /extensions gallery cannot be scripted/i, code: 'restricted', message: WEB_STORE },
  { match: /Cannot access contents of/i, code: 'restricted', message: NOT_GRANTED },
  { match: /No tab with id/i, code: 'restricted', message: TAB_GONE },
  { match: /No frame with id/i, code: 'restricted', message: TAB_GONE },
  { match: /Could not load file/i, code: 'failed', message: FILE_MISSING },
  { match: /unserializable/i, code: 'failed', message: UNSERIALISABLE },
]);

/**
 * Truncate a label to something a log line can carry.
 *
 * @param {string} value
 * @returns {string}
 */
function short(value) {
  return value.length <= LABEL_LIMIT ? value : `${value.slice(0, LABEL_LIMIT - 3)}...`;
}

/**
 * Record one line on the leaf's behalf.
 *
 * **Never awaited**, and never able to fail an injection. `log()` from a
 * document Surface crosses `core/messaging.js` to the service worker, which can
 * mean waking it; putting that in front of `executeScript` would spend the
 * user's gesture on bookkeeping.
 *
 * There is **no `try` around it**, and that is a claim rather than an omission.
 * `log()` throws synchronously in exactly two cases -- a Surface name outside
 * the set, and a message that is blank or longer than its 1000-character cap --
 * and both are closed here by construction: the Surface is a module constant,
 * and `short()` bounds the message whatever the caller passed as a path. Every
 * other failure, an unreachable worker included, is swallowed inside
 * `core/logger.js`, which is documented never to reject. A `catch` here would be
 * a branch no test could ever enter, which is a worse thing to ship than the
 * risk it pretends to cover.
 *
 * The **value a leaf returned is never recorded**: it is page content, and page
 * content is one accident away from being a secret. What is recorded is what was
 * injected and how it ended.
 *
 * @param {string} message
 * @returns {void}
 */
function record(message) {
  void log(LEAF_SURFACE, short(message));
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
  // An injected file is named by the extension's own code, never by the page.
  // Rejecting a scheme, a protocol-relative prefix and a parent segment is what
  // keeps that true if a path ever reaches here from data: R1 lets identifiers
  // travel up the privilege gradient and forbids URLs and executable strings,
  // and `files` is the one argument on this surface that looks like a location.
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) {
    throw new TypeError(
      `${name} must be a path inside this extension, received ${shown(value)}. A URL is not an injection target.`,
    );
  }
  if (value.split('/').includes('..')) {
    throw new TypeError(
      `${name} must not contain a ".." segment, received ${shown(value)}.`,
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
 * URL cannot be read, and there is no prefilter to write. Every refusal below is
 * therefore Chrome's, caught and translated. **Adding the `tabs` permission
 * would make the URL readable and would also give this extension standing
 * access to every tab, which is the one thing it exists to demonstrate the
 * absence of.**
 *
 * @returns {Promise<number | null>}
 */
async function activeTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const [tab] = tabs;
  return tab && typeof tab.id === 'number' ? tab.id : null;
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
 * Resolve the active tab, inject once, reduce every outcome to a `Result`.
 *
 * @param {Omit<chrome.scripting.ScriptInjection, 'target'>} spec Everything but `target`.
 * @param {string} label What is being injected, for the record this leaves.
 * @returns {Promise<Result>}
 */
async function inject(spec, label) {
  if (typeof chrome === 'undefined' || !chrome.scripting || !chrome.tabs) {
    return { ok: false, error: makeError('unavailable', NO_SCRIPTING) };
  }

  record(`inject ${label}`);

  try {
    const tabId = await activeTabId();
    if (tabId === null) {
      const error = makeError('restricted', NO_ACTIVE_TAB);
      record(`inject ${label} -> ${error.code}`);
      return { ok: false, error };
    }

    const results = await chrome.scripting.executeScript({ ...spec, target: { tabId } });
    // One injection into the top frame yields exactly one result. An empty array
    // means the frame stopped existing between the query and the injection --
    // reported rather than unwrapped, because `results[0].result` on an empty
    // array is `undefined`, which is also what a leaf returning nothing gives.
    if (results.length === 0) {
      const error = makeError('unknown', NO_RESULT);
      record(`inject ${label} -> ${error.code}`);
      return { ok: false, error };
    }
    record(`inject ${label} -> ok`);
    return { ok: true, data: results[0].result };
  } catch (thrown) {
    const error = refusal(thrown);
    record(`inject ${label} -> ${error.code}`);
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
 * written as a single IIFE that creates no top-level binding. Measured on
 * Chrome 151: two different files each declaring `function collect()` at top
 * level both ran and each returned its own value, and injecting one file twice
 * ran it twice -- so the collision is real but silent in the direction that
 * matters, with the last declaration winning inside a shared scope.
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
 * @throws {TypeError} If `func` is not a function or `args` is not an array.
 */
export function runFunction(func, args) {
  if (typeof func !== 'function') {
    throw new TypeError(`The injected function must be a function, received ${shown(func)}.`);
  }
  if (!Array.isArray(args)) {
    throw new TypeError(
      `The injected function's args must be an array, received ${shown(args)}. Pass [] when it takes none.`,
    );
  }
  const name = func.name || '(anonymous)';
  return inject({ func, args }, `function ${name}`);
}
