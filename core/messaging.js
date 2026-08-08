// @ts-check
/**
 * @tier required
 * @chrome-min 99
 * @permissions none
 * @pitfall Tracing core/log makes one panel log re-send it without bound and flood the buffer.
 * @alternative Returning a promise from onMessage -- silently dropped before Chrome 148.
 * @scales-to Hand-registered actions outgrow roughly a dozen -> a typed event bus with a registry.
 */

import { ERROR_CODES, makeError } from './errors.js';

/**
 * The Surfaces a request can come from. Closed, and exported because the set
 * itself is the contract: the tag is the log stream's second column, and a
 * reader validating one should not need a second source of truth.
 */
export const SURFACES = Object.freeze(
  /** @type {const} */ (['panel', 'sw', 'cs', 'options', 'popup', 'offscreen']),
);

/** @typedef {(typeof SURFACES)[number]} Surface */
/** @typedef {{ code: string, message: string, cause?: unknown }} StructuredError */
/** @typedef {{ id: string, from: Surface, t: number }} Meta */
/** @typedef {{ action: string, payload: unknown, meta: Meta }} Request */
/** @typedef {{ ok: true, data?: unknown } | { ok: false, error: StructuredError }} Response */
/** @typedef {(payload: unknown, meta: Meta) => unknown} Handler */
/**
 * @typedef {object} TraceEntry
 * @property {'req' | 'res'} direction
 * @property {string} action
 * @property {string} id Pairs a response with its request and yields elapsed time.
 * @property {Surface} from
 * @property {number} t Epoch milliseconds, formatted only at render.
 * @property {boolean} [ok] Present on a response.
 * @property {string} [code] Present on a failed response.
 */

const ACTION_PATTERN = /^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/;

/**
 * The one action the tracer ignores. Recording it would have the recorder send
 * it again: log() sends core/log, tracing that send calls log(), which sends
 * core/log. Nothing in the log stream would ever show the flood, because every
 * entry in it is a message that really was sent.
 */
const LOG_ACTION = 'core/log';

const NO_MESSAGING = 'Extension messaging is not available here. It works only inside an extension Surface.';
const NO_ANSWER = 'No Surface answered this action. It is answered only while a Surface that registers it is loaded.';
const UNSENDABLE = 'The request could not be serialised for transport. A payload carries JSON-safe values only.';
const MALFORMED = 'The response did not match the message envelope. Reload the extension and try again.';
const HANDLER_FAILED = 'The action did not complete. Try again.';

/** @type {Map<string, Handler>} */
const handlers = new Map();

/** @type {(entry: TraceEntry) => void} */
let tracer = () => {};

let listening = false;

/**
 * Name a rejected argument without risking a second throw. Only a string is
 * quoted; anything else is reported by type, because an arbitrary value has no
 * safe universal rendering.
 *
 * @param {unknown} value
 * @returns {string}
 */
function shown(value) {
  return typeof value === 'string' ? `"${value}"` : `a ${typeof value}`;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * @param {unknown} value
 * @returns {value is StructuredError}
 */
function isStructuredError(value) {
  return (
    isRecord(value) &&
    typeof value.message === 'string' &&
    ERROR_CODES.includes(/** @type {never} */ (value.code))
  );
}

/**
 * Recognise this repository's envelope. A copied Module runs inside a stranger's
 * extension where other code sends other shapes, and answering one of those
 * would take the channel away from whoever it was meant for.
 *
 * @param {unknown} value
 * @returns {value is Request}
 */
function isRequest(value) {
  return (
    isRecord(value) &&
    typeof value.action === 'string' &&
    'payload' in value &&
    isRecord(value.meta) &&
    typeof value.meta.id === 'string' &&
    typeof value.meta.t === 'number' &&
    SURFACES.includes(/** @type {never} */ (value.meta.from))
  );
}

/**
 * @param {unknown} action
 * @returns {asserts action is string}
 */
function assertAction(action) {
  if (typeof action !== 'string' || !ACTION_PATTERN.test(action)) {
    throw new TypeError(
      `Invalid action name ${shown(action)}. Use <module>/<verb>, matching ${ACTION_PATTERN.source}.`,
    );
  }
}

/**
 * @param {unknown} from
 * @returns {asserts from is Surface}
 */
function assertSurface(from) {
  if (!SURFACES.includes(/** @type {never} */ (from))) {
    throw new TypeError(`Invalid surface ${shown(from)}. Use one of: ${SURFACES.join(', ')}.`);
  }
}

/**
 * A recorder that fails must not take the door down with it.
 *
 * @param {TraceEntry} entry
 */
function record(entry) {
  try {
    const settling = tracer(entry);
    // A recorder that writes to storage returns a promise, and a rejected one
    // would surface as an unhandled rejection per traced message.
    if (settling !== undefined && typeof (/** @type {any} */ (settling).then) === 'function') {
      /** @type {Promise<unknown>} */ (settling).catch(() => {});
    }
  } catch {
    // Nothing to report it to: the reporter is what broke.
  }
}

/**
 * Reduce whatever came back over the wire to one of the two response shapes.
 * `data` is copied only when the key is present, so an absent value stays
 * absent rather than becoming an own key JSON would drop on the next hop.
 *
 * @param {unknown} value
 * @returns {Response}
 */
function normalise(value) {
  if (isRecord(value) && value.ok === true) {
    return 'data' in value ? { ok: true, data: value.data } : { ok: true };
  }
  if (isRecord(value) && value.ok === false && isStructuredError(value.error)) {
    return { ok: false, error: value.error };
  }
  if (value === undefined) {
    return { ok: false, error: makeError('unavailable', NO_ANSWER) };
  }
  return { ok: false, error: makeError('failed', MALFORMED, value) };
}

/**
 * Turn whatever a handler threw into a value that survives the wire.
 *
 * A structured error is rebuilt rather than forwarded: an `Error` carrying a
 * `code` satisfies the guard, because `message` is an own property, and then
 * loses that message to `JSON.stringify`, because it is a non-enumerable one.
 * The receiver would reject the messageless result as malformed and report
 * `failed` instead of the code the handler chose.
 *
 * @param {unknown} thrown
 * @returns {StructuredError}
 */
function toStructuredError(thrown) {
  return isStructuredError(thrown)
    ? makeError(/** @type {never} */ (thrown.code), thrown.message, thrown.cause)
    : makeError('failed', HANDLER_FAILED, thrown);
}

/**
 * The single `chrome.runtime.onMessage` listener in the repository.
 *
 * It returns `true` only when it has taken responsibility for the message, and
 * `undefined` otherwise. Returning `true` for a message this context cannot
 * answer would hold the channel open against the context that can.
 *
 * @param {unknown} message
 * @param {chrome.runtime.MessageSender} _sender
 * @param {(response?: unknown) => void} sendResponse
 * @returns {boolean | undefined}
 */
function listener(message, _sender, sendResponse) {
  if (!isRequest(message)) return undefined;
  const handler = handlers.get(message.action);
  if (handler === undefined) return undefined;

  const { payload, meta } = message;
  Promise.resolve()
    .then(() => handler(payload, meta))
    .then((data) => (data === undefined ? { ok: true } : { ok: true, data }))
    .catch((thrown) => ({ ok: false, error: toStructuredError(thrown) }))
    .then(sendResponse)
    .catch(() => {
      // sendResponse throws when the reply will not serialise, and when the
      // caller's context is already gone. Chrome rejects the caller's own
      // promise in both cases, so there is nothing left to report from here.
    });
  return true;
}

/**
 * Put one envelope on the wire and reduce whatever comes back to a response.
 *
 * Chrome fails this in two different places. It throws **synchronously** when
 * it cannot serialise the payload, which is a fault in the calling code, and it
 * **rejects** when no answer comes back at all -- no receiver, a context
 * invalidated by a reload, or a responder whose own reply would not serialise.
 * Reported through one code they would send every diagnosis to the wrong place.
 *
 * @param {string} action
 * @param {unknown} payload
 * @param {Meta} meta
 * @returns {Promise<Response>}
 */
async function deliver(action, payload, meta) {
  if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') {
    return { ok: false, error: makeError('unavailable', NO_MESSAGING) };
  }

  /** @type {Promise<unknown>} */
  let pending;
  try {
    pending = chrome.runtime.sendMessage({ action, payload: payload ?? null, meta });
  } catch (thrown) {
    return { ok: false, error: makeError('failed', UNSENDABLE, thrown) };
  }

  try {
    return normalise(await pending);
  } catch (thrown) {
    return { ok: false, error: makeError('unavailable', NO_ANSWER, thrown) };
  }
}

/**
 * @param {string} action
 * @param {unknown} payload
 * @param {Surface} from
 * @returns {Promise<Response>}
 */
async function exchange(action, payload, from) {
  /** @type {Meta} */
  const meta = { id: crypto.randomUUID(), from, t: Date.now() };
  const traced = action !== LOG_ACTION;
  if (traced) record({ direction: 'req', action, id: meta.id, from, t: meta.t });

  const response = await deliver(action, payload, meta);

  if (traced) {
    /** @type {TraceEntry} */
    const entry = { direction: 'res', action, id: meta.id, from, t: Date.now(), ok: response.ok };
    if (!response.ok) entry.code = response.error.code;
    record(entry);
  }
  return response;
}

/**
 * Send a named request to whichever Surface registered a handler for it, and
 * resolve with a response. This never rejects and never throws across a Surface
 * boundary: a missing answer, a thrown handler, an unsendable payload, and a
 * malformed reply all arrive as `{ ok:false, error }`.
 *
 * The three conditions below throw **synchronously**, before anything is sent,
 * because none can be produced by a user, a page, or a network -- they mean the
 * calling code is wrong. A rejection would let an unawaited call fail into the
 * console instead of at the call site, which is where a typo has to surface.
 *
 * @param {string} action `<module>/<verb>`, both kebab-case.
 * @param {unknown} payload Anything JSON-serialisable; `undefined` becomes `null`.
 * @param {Surface} from The Surface making the call.
 * @returns {Promise<Response>}
 * @throws {TypeError} If `action` or `from` is outside its set, or if this
 *   Surface is the one that registered the handler.
 */
export function request(action, payload, from) {
  assertAction(action);
  assertSurface(from);
  if (handlers.has(action)) {
    throw new TypeError(
      `This Surface registered the handler for "${action}", and a message never reaches its own sender. Call the handler directly.`,
    );
  }
  return exchange(action, payload, from);
}

/**
 * Register the one handler for an action. Called by hand from a composition
 * root, one verbatim line per action -- there is no discovery, no registry
 * scan, and no broker.
 *
 * The handler returns its data. To fail with a particular code it throws a
 * value `makeError` built; anything else it throws becomes `failed`.
 *
 * **Call this during a composition root's synchronous top-level evaluation.**
 * A service worker is only woken for an event whose listener was attached while
 * its script first ran, so registering after an `await` works until the worker
 * is terminated and then stops waking it at all.
 *
 * The duplicate check below sees this Surface only. Two Surfaces registering
 * one action both run their handler and Chrome keeps whichever replied first,
 * so an action belongs to exactly one Surface by convention, not by force.
 *
 * @param {string} action
 * @param {Handler} handler
 * @returns {void}
 * @throws {TypeError} If the action is malformed or already registered here.
 */
export function onRequest(action, handler) {
  assertAction(action);
  if (typeof handler !== 'function') {
    throw new TypeError(`Handler for "${action}" must be a function, received ${shown(handler)}.`);
  }
  if (handlers.has(action)) {
    throw new TypeError(`A handler for "${action}" is already registered in this Surface.`);
  }
  handlers.set(action, handler);

  if (!listening && typeof chrome !== 'undefined' && chrome.runtime?.onMessage !== undefined) {
    chrome.runtime.onMessage.addListener(listener);
    listening = true;
  }
}

/**
 * Hand the module its recorder. `core/logger.js` makes this call once on load,
 * which is the whole of the relationship between the two files: the logger
 * imports this module, and this module never imports the logger.
 *
 * A second call replaces the first rather than refusing it, so the one caller
 * this is written for stays the only caller by convention.
 *
 * @param {(entry: TraceEntry) => void} fn
 * @returns {void}
 * @throws {TypeError} If `fn` is not a function.
 */
export function setTracer(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`Tracer must be a function, received ${shown(fn)}.`);
  }
  tracer = fn;
}
