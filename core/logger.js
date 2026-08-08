// @ts-check
/**
 * @tier required
 * @chrome-min 102
 * @permissions none
 * @pitfall Two Surfaces appending both rewrite the buffer and each drops the other's entry.
 * @alternative Reading the dev-mode flag per call -- a storage round trip on the hottest path.
 * @scales-to Entries outpace one rewrite per append -> IndexedDB with append-only writes.
 */

/**
 * The activity log: what every Surface did, in one bounded buffer, written by
 * the service worker and by nobody else.
 *
 * **One writer.** An append is a read-modify-write of the whole array, so two
 * Surfaces appending at once would each overwrite the other's entry and neither
 * would see an error. A document Surface therefore sends action `core/log` and
 * the worker writes; inside the worker the same function appends directly, with
 * no round trip. Which path a call takes is decided by the Surface it names --
 * the same argument `core/messaging.js` already requires -- rather than by
 * inspecting the environment, so the routing is visible at the call site.
 *
 * **Why this file cannot recurse.** `log()` sends through `core/messaging.js`,
 * and `core/messaging.js` traces every message through this file. Composed
 * literally that does not terminate. It terminates because messaging does not
 * trace the action `core/log`, and because the import direction is one-way: this
 * file imports messaging, and messaging receives the recorder through the single
 * `setTracer` call at the bottom of this one.
 *
 * **Ordering.** Appends serialise through a module-scope promise chain, so
 * concurrent calls cannot interleave their read-modify-writes. Terminating the
 * worker destroys the chain and the concurrency together, so there is no
 * cross-lifetime race to defend against and no lock here.
 *
 * **Cost when it is off.** The Developer Mode flag is cached in module scope,
 * read once at load and refreshed by a `chrome.storage.onChanged` subscription.
 * It is never read per call, because this is the hottest path in the repository.
 * With the flag off `log()` does no storage and no messaging work at all.
 *
 * **Never log a secret.** A message is a string and a non-string is refused,
 * because handing the logger a whole object is how a secret actually reaches a
 * log. Anything in the buffer is readable by every content script this extension
 * injects: the buffer lives in `storage.session`, which `core/storage.js` opens
 * to untrusted contexts so a consumer's own content script can reach it.
 *
 * The buffer holds 500 entries, discards oldest first, survives service-worker
 * termination, and is cleared on browser restart -- the properties of
 * `storage.session`, and the reason it lives there.
 */

import { makeError } from './errors.js';
import { SURFACES, request, setTracer } from './messaging.js';
import { get, set, subscribe } from './storage.js';

/** @typedef {(typeof SURFACES)[number]} Surface */
/** @typedef {import('./messaging.js').Meta} Meta */
/** @typedef {import('./messaging.js').TraceEntry} TraceEntry */
/** @typedef {{ direction: 'note', from: Surface, t: number, message: string }} NoteEntry */
/**
 * @typedef {object} TraceLogEntry
 * @property {'req' | 'res'} direction
 * @property {Surface} from
 * @property {number} t Epoch milliseconds, formatted only at render.
 * @property {string} action
 * @property {string} id Pairs a response with its request and yields elapsed time.
 * @property {boolean} [ok] Present on a response.
 * @property {string} [code] Present on a failed response.
 */
/** @typedef {NoteEntry | TraceLogEntry} LogEntry */

/** DESIGN.md owns this number so that no Module invents one. */
const CAPACITY = 500;

/** `<owner>:<key>`, and the key DESIGN.md names for this buffer. */
const RING_KEY = 'log:ring';

/**
 * Read directly from `local` because `core/config.js` does not exist yet. When
 * it does, this read moves behind it and the default below stops being declared
 * in two places. `local` is the area DESIGN.md gives machine-local flags.
 */
const DEV_MODE_KEY = 'cfg:dev-mode';
const DEV_MODE_DEFAULT = false;

/** The one action `core/messaging.js` does not trace. Changing it here alone would recurse. */
const LOG_ACTION = 'core/log';

const REJECTED_ENTRY = 'The log entry did not match the record shape and was not stored.';

/**
 * Whether this realm is the service worker. Read once, at load, because a global
 * scope does not change identity afterwards.
 *
 * This is an assertion rather than the router: a document Surface that named
 * `sw` would append directly and succeed, because `storage.session` is open to
 * extension pages too, and would break the one-writer rule with no symptom.
 */
const IS_SERVICE_WORKER = globalThis.constructor?.name === 'ServiceWorkerGlobalScope';

let devMode = DEV_MODE_DEFAULT;
let seedSettled = false;

/**
 * Appends run one at a time through this chain. The `catch` is load-bearing:
 * without it a single rejected write leaves the chain rejected for the lifetime
 * of the worker and every later append is dropped in silence.
 *
 * @type {Promise<unknown>}
 */
let chain = Promise.resolve();

/**
 * The load-time read of the flag. Deliberately **not** awaited at module scope:
 * a module service worker that top-level-awaits a `chrome.*` promise never
 * finishes evaluating, and every event it was registered for stops arriving.
 */
const seeded = get('local', DEV_MODE_KEY).then(
  (result) => {
    devMode = result.ok && 'data' in result && result.data === true;
    seedSettled = true;
  },
  () => {
    seedSettled = true;
  },
);

subscribe('local', DEV_MODE_KEY, (value) => {
  devMode = value === true;
});

/**
 * Name a rejected argument without risking a second throw. Only a string is
 * quoted; anything else is reported by type.
 *
 * @param {unknown} value
 * @returns {string}
 */
function shown(value) {
  return typeof value === 'string' ? `"${value}"` : `a ${typeof value}`;
}

/**
 * @param {unknown} from
 * @returns {asserts from is Surface}
 */
function assertSurface(from) {
  if (!SURFACES.includes(/** @type {never} */ (from))) {
    throw new TypeError(`Invalid surface ${shown(from)}. Use one of: ${SURFACES.join(', ')}.`);
  }
  if (from === 'sw' && !IS_SERVICE_WORKER) {
    throw new TypeError(
      'Only the service worker may log as "sw". Another Surface naming it would write the buffer directly and drop entries the worker wrote at the same time.',
    );
  }
}

/**
 * @param {unknown} message
 * @returns {asserts message is string}
 */
function assertMessage(message) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new TypeError(
      `A log message must be a non-blank string, received ${shown(message)}. Format the value at the call site: passing an object is how a secret reaches the log.`,
    );
  }
}

/**
 * Rewrite the buffer with one more entry, keeping the newest `CAPACITY`.
 *
 * A stored value that is not an array degrades to empty rather than throwing.
 * The buffer is diagnostic data with a Developer Mode view over it, and losing
 * a corrupted history is better than a writer that stops writing.
 *
 * @param {LogEntry} entry
 * @returns {Promise<void>}
 */
async function write(entry) {
  const found = await get('session', RING_KEY);
  const held = found.ok && 'data' in found && Array.isArray(found.data) ? found.data : [];
  const next =
    held.length < CAPACITY ? [...held, entry] : [...held.slice(held.length - CAPACITY + 1), entry];

  const stored = await set('session', RING_KEY, next);
  if (!stored.ok) throw new Error(stored.error.message);
}

/**
 * @param {LogEntry} entry
 * @returns {Promise<unknown>}
 */
function append(entry) {
  chain = chain.then(() => write(entry)).catch(() => {});
  return chain;
}

/**
 * Put one entry where it belongs, and resolve either way. There is nowhere to
 * report a failed log to: the reporter is what failed.
 *
 * @param {LogEntry} entry
 * @returns {Promise<void>}
 */
function dispatch(entry) {
  return Promise.resolve()
    .then(() => (entry.from === 'sw' ? append(entry) : request(LOG_ACTION, entry, entry.from)))
    .then(
      () => {},
      () => {},
    );
}

/**
 * The one place the flag is consulted. Off and settled is the common case and
 * costs a boolean; off and still seeding waits for the module-scope promise
 * once, which is not a per-call read and is what keeps the events emitted during
 * startup -- the ones most worth having.
 *
 * @param {LogEntry} entry Already built, so it carries the time of the event.
 * @returns {Promise<void>}
 */
function emit(entry) {
  if (devMode) return dispatch(entry);
  if (seedSettled) return Promise.resolve();
  return seeded.then(() => (devMode ? dispatch(entry) : undefined));
}

/**
 * The recorder `core/messaging.js` is handed on load. It is a separate named
 * function so that the one hand-off is greppable from either side.
 *
 * @param {TraceEntry} entry
 * @returns {void}
 */
function recordTrace(entry) {
  void emit(entry);
}

/**
 * Rebuild an entry that arrived over the wire.
 *
 * `from` is taken from the **envelope**, never from the payload: the envelope's
 * `meta.from` is what `core/messaging.js` stamped for the sending Surface, and a
 * sender that could name its own Surface in the record could attribute its
 * entries to another one.
 *
 * @param {unknown} payload
 * @param {Meta} meta
 * @returns {LogEntry}
 */
function fromWire(payload, meta) {
  if (payload === null || typeof payload !== 'object') {
    throw makeError('failed', REJECTED_ENTRY);
  }

  const wire = /** @type {Record<string, unknown>} */ (payload);
  const t = typeof wire.t === 'number' ? wire.t : meta.t;

  if (wire.direction === 'note') {
    if (typeof wire.message !== 'string' || wire.message.trim().length === 0) {
      throw makeError('failed', REJECTED_ENTRY);
    }
    return { direction: 'note', from: meta.from, t, message: wire.message };
  }

  if (wire.direction === 'req' || wire.direction === 'res') {
    if (typeof wire.action !== 'string' || typeof wire.id !== 'string') {
      throw makeError('failed', REJECTED_ENTRY);
    }
    /** @type {TraceLogEntry} */
    const entry = { direction: wire.direction, from: meta.from, t, action: wire.action, id: wire.id };
    if (typeof wire.ok === 'boolean') entry.ok = wire.ok;
    if (typeof wire.code === 'string') entry.code = wire.code;
    return entry;
  }

  throw makeError('failed', REJECTED_ENTRY);
}

/**
 * Record one line of activity.
 *
 * Never rejects and never throws for a runtime failure -- an unreachable worker,
 * a full area, or a browser with no extension APIs all end with the entry simply
 * not recorded. The two conditions below throw **synchronously**, because
 * neither a user, a page, nor a network can produce them: they mean the calling
 * code is wrong, and a logging call that failed into the console instead of at
 * the call site is a defect nobody would ever look for.
 *
 * @param {Surface} from The Surface making the call. Only the service worker may pass `sw`.
 * @param {string} message One non-blank line. Never a secret, and never an object.
 * @returns {Promise<void>} Resolves once the entry has been recorded or discarded.
 * @throws {TypeError} If `from` is outside the set or is `sw` from another
 *   Surface, or if `message` is not a non-blank string.
 */
export function log(from, message) {
  assertSurface(from);
  assertMessage(message);
  return emit({ direction: 'note', from, t: Date.now(), message });
}

/**
 * The handler for action `core/log`, wired once in `sw.js`.
 *
 * It is exported rather than registered here because this module is loaded in
 * every Surface: a self-registering handler would make `request('core/log', …)`
 * throw in the panel, which is the Surface the send exists for.
 *
 * The flag is not re-checked here. The sending Surface already decided, and a
 * second gate would drop entries in the window where one Surface has seen the
 * change event and another has not.
 *
 * @param {unknown} payload
 * @param {Meta} meta
 * @returns {Promise<void>}
 * @throws {{ code: string, message: string }} If the entry does not match the record shape.
 */
export function receiveLog(payload, meta) {
  return append(fromWire(payload, meta)).then(() => {});
}

setTracer(recordTrace);
