// @ts-check
/**
 * @tier required
 * @chrome-min 102
 * @permissions storage
 * @pitfall storage.session is invisible to a content script until setAccessLevel grants it.
 * @alternative A default area -- the caller stops choosing and meets a quota it never picked.
 * @scales-to Stored payload passes ~5 MB or needs key-range queries -> IndexedDB.
 */

/**
 * Area-explicit `chrome.storage`. The area is the first argument of every call
 * and there is no default, because the limit that applies is a property of the
 * area and choosing it is the caller's job.
 *
 * | Area      | Hard limits                                                        |
 * | --------- | ------------------------------------------------------------------ |
 * | `local`   | 10 MB (5 MB on Chrome <= 113)                                        |
 * | `sync`    | ~100 KB total, 8 KB per item, 120 writes/minute, 1,800/hour           |
 * | `session` | 10 MB (1 MB on Chrome <= 111), in-memory, cleared on browser restart  |
 * | `managed` | read-only; set by enterprise policy, never by the extension           |
 *
 * `chrome.storage.local` is **plaintext in the profile directory**. Chrome's
 * OSCrypt layer protects Chrome's own password database, not extension storage,
 * so a secret written here is readable without running any of this code. That is
 * why `features/secret-box/` exists.
 *
 * `sync` is **never a place for a secret**: it reaches Google's servers and is
 * not end-to-end encrypted.
 *
 * **Loading this module opens `session` to every content script, for the whole
 * profile.** The grant below is what makes the area reachable from a content
 * script at all, and it is not scoped to the importer: a Surface that only ever
 * uses `local` still makes it. The setting is stored with the profile and
 * **survives a browser restart**, so deleting the call does not close the area
 * again on a profile where it has already run. Anything in `session` is
 * therefore readable by any content script this extension injects -- which
 * includes the unlocked encryption key `features/secret-box/` keeps there. The
 * isolated world keeps it away from the page itself, not from your own leaves.
 *
 * This module performs no encryption. Sealing a value is FR-20's concern and
 * lives in `features/secret-box/`; what arrives here is stored as it was handed
 * over.
 */

import { makeError } from './errors.js';

/**
 * The four storage areas. Exported because the set itself is the contract: a
 * caller validating an area should not need a second source of truth.
 */
export const AREAS = Object.freeze(
  /** @type {const} */ (['local', 'session', 'sync', 'managed']),
);

/** @typedef {(typeof AREAS)[number]} Area */
/** @typedef {{ code: string, message: string, cause?: unknown }} StructuredError */
/** @typedef {{ ok: true, data?: unknown } | { ok: false, error: StructuredError }} Result */

/**
 * `<owner>:<key>`, where owner is a Module directory name or `core`. The right
 * half allows dot-separated segments because a slice's configuration key is
 * itself namespaced -- `cfg:find-text.match-limit`.
 *
 * The shape is enforced; the namespace is not. Nothing here can know which
 * directories exist, and a hardcoded list is exactly what a copied file must not
 * carry, so `zzz:x` is accepted. What the check does own is the defect AR-25
 * names: a bare key, which two slices copied into one extension would claim.
 */
const KEY_PATTERN = /^[a-z][a-z0-9-]*:[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$/;

// Measured: an extension whose manifest omits the storage permission has no
// chrome.storage at all, inside its own service worker. The first wording named
// only the context, which is the one cause that is provably false there.
const NO_STORAGE = 'Extension storage is not available here. This is not an extension Surface, or the manifest declares no storage permission.';
const NO_SESSION_AREA = 'Session storage needs Chrome 102 or later. This browser does not provide the area.';
const NO_SESSION_ACCESS = 'Session storage is not open to this context. Only extension pages and the service worker reach it.';
const READ_FAILED = 'The stored value could not be read. Try again.';
const WRITE_FAILED = 'The value could not be stored. Try again.';
const REMOVE_FAILED = 'The stored value could not be removed. Try again.';

/**
 * How Chrome words a refusal to touch a storage area from an untrusted context.
 * Measured on Chrome 151: `Access to storage is not allowed from this context.`
 *
 * A failed grant alone is not evidence that a later failure was an access
 * problem -- the access level is stored with the profile, so a context whose own
 * grant was refused can still reach `session` because an earlier one succeeded.
 * Diagnosing from the grant alone reported a quota overflow as a closed area.
 * If Chrome rewords this the match stops firing and the failure reports as
 * `failed`, which is the safe direction.
 */
const ACCESS_DENIED = /not allowed from this context/i;

/**
 * Whether `session` is open to this context. A content script cannot grant its
 * own access -- only a trusted context can -- so the answer is settled once, on
 * load, and every `session` operation waits for it.
 *
 * @type {Promise<boolean> | null}
 */
let sessionAccess = null;

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
 * @param {unknown} area
 * @returns {asserts area is Area}
 */
function assertArea(area) {
  if (!AREAS.includes(/** @type {never} */ (area))) {
    throw new TypeError(`Invalid storage area ${shown(area)}. Use one of: ${AREAS.join(', ')}.`);
  }
}

/**
 * @param {unknown} key
 * @returns {asserts key is string}
 */
function assertKey(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new TypeError(
      `Invalid storage key ${shown(key)}. Use <owner>:<key>, matching ${KEY_PATTERN.source}.`,
    );
  }
}

/**
 * `chrome.storage.set({ k: undefined })` is a no-op object: Chrome resolves,
 * writes nothing, and leaves any previous value in place. Returning `{ ok:true }`
 * for that is the one shape this module exists to prevent, so it is refused
 * before the call rather than reported after it.
 *
 * @param {unknown} value
 * @returns {void}
 * @throws {TypeError} If the value cannot be stored.
 */
function assertStorable(value) {
  if (value === undefined) {
    throw new TypeError(
      'A value of undefined cannot be stored. Chrome drops the key and reports success; store null, or call remove().',
    );
  }
}

/**
 * @param {Area} area
 * @returns {void}
 * @throws {TypeError} If the area cannot be written.
 */
function assertWritable(area) {
  if (area === 'managed') {
    throw new TypeError(
      'chrome.storage.managed is read-only. A policy value is set by an administrator, not by the extension.',
    );
  }
}

/**
 * The area object, or `undefined` where this context has no `chrome.storage` at
 * all -- and where the Chrome running this is below 102, in which case
 * `chrome.storage.session` is absent while the other three are present. The type
 * declares all four as always available, which is true of the API surface and
 * not of every Chrome.
 *
 * @param {Area} area
 * @returns {chrome.storage.StorageArea | undefined}
 */
function resolveArea(area) {
  if (typeof chrome === 'undefined' || !chrome.storage) return undefined;
  switch (area) {
    case 'local':
      return chrome.storage.local;
    case 'session':
      return chrome.storage.session;
    case 'sync':
      return chrome.storage.sync;
    case 'managed':
      return chrome.storage.managed;
  }
}

/**
 * Open `session` to content scripts, once, on load.
 *
 * The grant has to happen here rather than at a call site, because the context
 * that needs the access can never make the call: `setAccessLevel` works only in
 * a trusted context, and a content script is not one. Waiting until something in
 * this Surface touches `session` would be too late for a content script in a
 * Surface that never does.
 *
 * A rejection is an answer, not an error: it means this context is untrusted, and
 * that is what lets a later failure be diagnosed rather than reported as a
 * generic one.
 *
 * @returns {Promise<boolean>} Whether the grant was made from this context.
 */
function grantSessionAccess() {
  if (sessionAccess !== null) return sessionAccess;

  const area = resolveArea('session');
  if (area === undefined || typeof area.setAccessLevel !== 'function') {
    sessionAccess = Promise.resolve(false);
    return sessionAccess;
  }

  sessionAccess = Promise.resolve()
    .then(() => area.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' }))
    .then(
      () => true,
      () => false,
    );
  return sessionAccess;
}

grantSessionAccess();

/**
 * Run one storage operation and reduce every outcome to a `Result`.
 *
 * The grant is awaited rather than trusted: a `session` operation issued on the
 * same tick as module load would otherwise race it. The operation is attempted
 * even when the grant failed, because a trusted context can reach `session`
 * whether or not the call succeeded -- the failed grant only changes how a
 * failure is *reported*, never whether the attempt is made.
 *
 * @param {Area} area
 * @param {string} failure The message for a `failed` outcome.
 * @param {(store: chrome.storage.StorageArea) => Promise<Result>} operation
 * @returns {Promise<Result>}
 */
async function run(area, failure, operation) {
  const store = resolveArea(area);
  if (store === undefined) {
    const hasStorage = typeof chrome !== 'undefined' && Boolean(chrome.storage);
    const missing = hasStorage && area === 'session' ? NO_SESSION_AREA : NO_STORAGE;
    return { ok: false, error: makeError('unavailable', missing) };
  }

  const granted = area === 'session' ? await grantSessionAccess() : true;

  try {
    return await operation(store);
  } catch (thrown) {
    // Both halves are required. Without the grant result, a trusted context
    // would inherit the diagnosis; without the message, every session failure in
    // a content script -- a quota overflow included -- would be reported as a
    // closed area while the area is demonstrably open.
    const denied =
      !granted &&
      thrown instanceof Error &&
      ACCESS_DENIED.test(thrown.message);
    return denied
      ? { ok: false, error: makeError('unavailable', NO_SESSION_ACCESS, thrown) }
      : { ok: false, error: makeError('failed', failure, thrown) };
  }
}

/**
 * Read one key from one area.
 *
 * An absent key resolves `{ ok: true }` with **no `data` key**, mirroring
 * `chrome.storage` itself, which omits a missing key from the object it returns.
 * `'data' in result` therefore means exactly "the key exists", and a stored
 * `null` stays distinguishable from a key that was never written.
 *
 * @param {Area} area One of `AREAS`.
 * @param {string} key `<owner>:<key>`.
 * @returns {Promise<Result>}
 * @throws {TypeError} Synchronously, if `area` or `key` is outside its grammar.
 */
export function get(area, key) {
  assertArea(area);
  assertKey(key);

  return run(area, READ_FAILED, async (store) => {
    const found = await store.get(key);
    return found !== null && typeof found === 'object' && key in found
      ? { ok: true, data: found[key] }
      : { ok: true };
  });
}

/**
 * Write one key into one area.
 *
 * The value must be JSON-serialisable, and that is the platform's rule rather
 * than this module's -- enforced by nothing. Measured on Chrome 151: a `Date`
 * and a `Set` each come back as `{}`, an `undefined` property disappears, and a
 * circular reference is stored as `null`. Every one of those resolves without an
 * error, so a caller storing a live object gets a wrong value and no signal.
 *
 * Nothing is encrypted, hashed, or encoded on the way in.
 *
 * @param {Area} area One of `AREAS`, excluding `managed`.
 * @param {string} key `<owner>:<key>`.
 * @param {unknown} value Anything JSON-serialisable, and never `undefined`.
 * @returns {Promise<Result>}
 * @throws {TypeError} Synchronously, if the grammar is wrong, `area` is
 *   `managed`, or `value` is `undefined`.
 */
export function set(area, key, value) {
  assertArea(area);
  assertKey(key);
  assertWritable(area);
  assertStorable(value);

  return run(area, WRITE_FAILED, async (store) => {
    await store.set({ [key]: value });
    return { ok: true };
  });
}

/**
 * Delete one key from one area. Removing a key that is not there is not a
 * failure -- the requested end state is the state that results.
 *
 * @param {Area} area One of `AREAS`, excluding `managed`.
 * @param {string} key `<owner>:<key>`.
 * @returns {Promise<Result>}
 * @throws {TypeError} Synchronously, if the grammar is wrong or `area` is `managed`.
 */
export function remove(area, key) {
  assertArea(area);
  assertKey(key);
  assertWritable(area);

  return run(area, REMOVE_FAILED, async (store) => {
    await store.remove(key);
    return { ok: true };
  });
}

/**
 * Watch one key in one area and call `fn` whenever its stored value changes.
 *
 * Propagation in this repository is `chrome.storage.onChanged` and never
 * polling, and the subscription lives here rather than in each consumer for the
 * same reason `chrome.runtime.onMessage` lives in one file: `chrome.storage` is
 * reached through this module alone. A Module that only wants to notice a
 * changed value therefore still declares `@permissions none` -- it calls this
 * file, not the API.
 *
 * `fn` receives the new value, and `undefined` when the key was removed. The
 * two are distinguishable because `set()` refuses `undefined` outright, so a
 * stored value is never `undefined` and the absence can mean nothing else.
 *
 * Unlike `chrome.runtime.onMessage` there is no one-door rule here: multiple
 * listeners are legal and each subscription is independent.
 *
 * Where `chrome.storage.onChanged` is absent -- outside an extension Surface,
 * or with no storage permission -- nothing is subscribed and the returned
 * function is still callable, so a caller needs no second code path.
 *
 * @param {Area} area One of `AREAS`.
 * @param {string} key `<owner>:<key>`.
 * @param {(value: unknown) => void} fn Called with the new value, `undefined` if removed.
 * @returns {() => void} Stops this subscription.
 * @throws {TypeError} Synchronously, if the grammar is wrong or `fn` is not a function.
 */
export function subscribe(area, key, fn) {
  assertArea(area);
  assertKey(key);
  if (typeof fn !== 'function') {
    throw new TypeError(`Subscriber for "${key}" must be a function, received ${shown(fn)}.`);
  }

  const changed = typeof chrome === 'undefined' ? undefined : chrome.storage?.onChanged;
  if (changed === undefined) return () => {};

  /**
   * @param {Record<string, chrome.storage.StorageChange>} changes
   * @param {string} changedArea
   */
  const listener = (changes, changedArea) => {
    if (changedArea !== area) return;
    const change = changes[key];
    if (change === undefined) return;
    try {
      fn(change.newValue);
    } catch {
      // A subscriber that throws must not escape into Chrome's own event
      // dispatch, where it arrives detached from the subscription that caused
      // it. core/messaging.js protects its tracer for the same reason.
    }
  };

  changed.addListener(listener);
  return () => changed.removeListener(listener);
}
