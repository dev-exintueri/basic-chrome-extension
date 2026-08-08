// @ts-check
/**
 * @tier required
 * @chrome-min baseline
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
 * no round trip.
 *
 * **The realm decides which path a call takes, and the Surface a caller names is
 * the entry's label.** An earlier version routed on the label, which does not
 * hold: `core/messaging.js` lets any Surface pass `from: 'sw'`, so a panel
 * calling `request(action, payload, 'sw')` produced trace entries that appended
 * directly -- and they would have succeeded, because extension pages reach
 * `storage.session` too. Two writers, no error, no symptom. Routing on the realm
 * makes the one-writer rule structural rather than a convention callers keep.
 * Naming the wrong Surface is still a call-site `TypeError`, in both directions.
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
 * read once at load and refreshed by a subscription through `core/storage.js`.
 * It is never read per call, because this is the hottest path in the repository.
 * With the flag off `log()` does no storage and no messaging work at all. A
 * change delivered while the load-time read is still in flight wins over it: the
 * read is a snapshot of the past, and toggling the mode is itself one of the
 * things that wakes a terminated worker, so the two race by construction.
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

/**
 * `<owner>:<key>`. The Consistency Conventions name this exact key as an
 * instance of that rule rather than an exception to it.
 */
const RING_KEY = 'log:ring';

/**
 * One line, and a generous one. The cap is not cosmetic: `CAPACITY` bounds the
 * entry *count* and nothing else, so without it 500 large entries can push the
 * stored array past the area quota -- after which every later write fails
 * against the same oversized value and logging is dead until the browser
 * restarts, with no signal anywhere.
 */
const MESSAGE_LIMIT = 1000;

/** Enough for any `<module>/<verb>` and any UUID, and a bound rather than none. */
const FIELD_LIMIT = 200;

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
 * scope does not change identity afterwards. This is what routes an append, and
 * what makes "the worker is the only writer" a property of the code rather than
 * of every caller getting its own `from` argument right.
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
    // Only if nothing newer has arrived. A change event delivered while this
    // read was in flight carries the current value; this result carries the
    // value from before the write, and letting it land last would turn the mode
    // back off for the whole worker lifetime with the flag reading true in
    // storage the entire time.
    if (!seedSettled) devMode = result.ok && 'data' in result && result.data === true;
    seedSettled = true;
  },
  () => {
    seedSettled = true;
  },
);

subscribe('local', DEV_MODE_KEY, (value) => {
  devMode = value === true;
  seedSettled = true;
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
  // Both directions. A document Surface naming `sw` mislabels every entry it
  // writes; the worker naming anything else would send `core/log` to the handler
  // it registered itself, which core/messaging.js refuses -- and the entry would
  // vanish with nothing on the console, from the one module whose job is to
  // leave a record.
  if ((from === 'sw') !== IS_SERVICE_WORKER) {
    throw new TypeError(
      `Surface "${from}" cannot log from ${IS_SERVICE_WORKER ? 'the service worker' : 'a document Surface'}. The worker logs as "sw" and every other Surface logs as itself.`,
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
  if (message.length > MESSAGE_LIMIT) {
    throw new TypeError(
      `A log message must be at most ${MESSAGE_LIMIT} characters, received ${message.length}. The buffer is bounded by entry count, so an unbounded entry is unbounded storage.`,
    );
  }
}

/**
 * Rewrite the buffer with one more entry, keeping the newest `CAPACITY`.
 *
 * A stored value that is not an array degrades to empty: the buffer is
 * diagnostic data, and losing a corrupted history beats a writer that stops
 * writing. **A failed read does not**, and the distinction is the whole of this
 * function's care. Treating `{ ok: false }` as "nothing stored yet" would write
 * a one-element array over five hundred accumulated entries because one storage
 * read happened to fail -- the history gone, `log()` resolving normally, and the
 * Developer Mode view showing an extension that looks freshly started. Failing
 * the append loses one entry instead.
 *
 * @param {LogEntry} entry
 * @returns {Promise<void>}
 * @throws {{ code: string, message: string }} If the area could not be read or written.
 */
async function write(entry) {
  const found = await get('session', RING_KEY);
  if (!found.ok) throw found.error;

  const held = 'data' in found && Array.isArray(found.data) ? found.data : [];
  const next =
    held.length < CAPACITY ? [...held, entry] : [...held.slice(held.length - CAPACITY + 1), entry];

  const stored = await set('session', RING_KEY, next);
  if (!stored.ok) throw stored.error;
}

/**
 * Queue one append behind the ones already running.
 *
 * The chain keeps the swallowed promise and the caller gets the real one. Both
 * halves matter: without the `catch` a single rejected write leaves the chain
 * rejected for the lifetime of the worker and every later append is dropped in
 * silence, and without handing the caller the uncaught promise `receiveLog`
 * would answer `{ ok: true }` for an entry that was never stored.
 *
 * @param {LogEntry} entry
 * @returns {Promise<void>} Rejects if this entry could not be stored.
 */
function append(entry) {
  const done = chain.then(() => write(entry));
  chain = done.catch(() => {});
  return done;
}

/**
 * Put one entry where it belongs, and resolve either way. There is nowhere to
 * report a failed log to: the reporter is what failed.
 *
 * The **realm** picks the path, not the entry's label. See the head
 * documentation: a Surface may name `sw` in `request()` without being the
 * worker, and routing on that label let a document Surface write the buffer.
 *
 * @param {LogEntry} entry
 * @returns {Promise<void>}
 */
function dispatch(entry) {
  return Promise.resolve()
    .then(async () => {
      if (IS_SERVICE_WORKER) await append(entry);
      else await request(LOG_ACTION, entry, entry.from);
    })
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
 * Every other field is treated the same way, because this handler answers
 * anything that can reach `chrome.runtime.sendMessage` -- a content script
 * included. A time is only accepted when it is close enough to the envelope's
 * own stamp to be an event time rather than a position in the rendered stream,
 * and every string is bounded.
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

  // The payload's own time is what makes an entry built before the dev-mode
  // seed resolved carry the moment it happened. It is accepted only within a
  // minute of the envelope, so a sender cannot place its rows at 1970 or in the
  // far future and reorder everything a reader sorts.
  const claimed = wire.t;
  const t =
    typeof claimed === 'number' && Number.isFinite(claimed) && Math.abs(claimed - meta.t) <= 60_000
      ? claimed
      : meta.t;

  /** @param {unknown} value @returns {value is string} */
  const bounded = (value) =>
    typeof value === 'string' && value.trim().length > 0 && value.length <= FIELD_LIMIT;

  if (wire.direction === 'note') {
    if (
      typeof wire.message !== 'string' ||
      wire.message.trim().length === 0 ||
      wire.message.length > MESSAGE_LIMIT
    ) {
      throw makeError('failed', REJECTED_ENTRY);
    }
    return { direction: 'note', from: meta.from, t, message: wire.message };
  }

  if (wire.direction === 'req' || wire.direction === 'res') {
    if (!bounded(wire.action) || !bounded(wire.id)) {
      throw makeError('failed', REJECTED_ENTRY);
    }
    /** @type {TraceLogEntry} */
    const entry = { direction: wire.direction, from: meta.from, t, action: wire.action, id: wire.id };
    if (typeof wire.ok === 'boolean') entry.ok = wire.ok;
    if (bounded(wire.code)) entry.code = wire.code;
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
 * every Surface: a self-registering handler would make `request('core/log', ...)`
 * throw in the panel, which is the Surface the send exists for.
 *
 * The flag is not re-checked here. The sending Surface already decided, and a
 * second gate would drop entries in the window where one Surface has seen the
 * change event and another has not.
 *
 * It reports a failed write rather than absorbing it. `log()` never rejects
 * because its caller has nothing to do about a lost log line, but this is the
 * one place a failure can still be named, and answering `{ ok: true }` for an
 * entry that was never stored would put the lie inside the record itself.
 *
 * @param {unknown} payload
 * @param {Meta} meta
 * @returns {Promise<void>}
 * @throws {{ code: string, message: string }} If the entry does not match the
 *   record shape, or if the buffer could not be read or written.
 */
export function receiveLog(payload, meta) {
  return append(fromWire(payload, meta)).then(() => {});
}

setTracer(recordTrace);
