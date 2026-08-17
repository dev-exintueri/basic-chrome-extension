// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall Exceeding the sync write-rate limit fails the write, not the UI, and nothing raises.
 * @alternative A debounce at each call site -- one writer forgets and the whole quota is theirs.
 * @scales-to Reads outgrow two round trips each -> cache per key, invalidated by onChanged.
 */

/**
 * Configuration, resolved. `core/config.schema.js` declares the keys; this file
 * is the only thing that reads them, writes them, or notices them change.
 *
 * **Three tiers, in one order.** An administrator's policy in `managed` wins;
 * then the user's own value in the area the key declares; then the declared
 * default. Reading an unpopulated `managed` area is harmless -- measured on
 * Chrome 151, `chrome.storage.managed.get` with no policy present resolves `{}`
 * -- so this works before `policy/` exists and keeps working if it is deleted.
 * That is why the managed tier is read here rather than through a Feature
 * Module: `core/` must not import a slice, and it does not have to.
 *
 * **A tier is only consulted through its declared type.** `typeof value ===
 * entry.type` gates every one of them, which is the whole of the read-time
 * check -- the type *is* the validation rule, and `core/config.schema.js` says
 * so at length. One mechanism therefore covers an unset key, a hand-edited
 * storage entry, a value left half-migrated by an interrupted update, and a
 * policy an administrator typed wrongly. A managed value of the wrong type does
 * not win **and does not shadow the user's value either**: it is skipped, and
 * resolution continues.
 *
 * **`get` returns a value, never a `Result`, and never `undefined`.** Every path
 * that could report a failure already has the correct answer to return, so
 * reporting one would force every caller to invent a second default. The cost is
 * real and is stated rather than hidden: **a transient storage read failure is
 * indistinguishable from an unset key**, and both resolve to the declared
 * default. `set` is the opposite case and returns `core/storage.js`'s `Result`,
 * because a failed write has no correct substitute -- a toggle that cannot learn
 * its write failed cannot visibly revert.
 *
 * **The second pitfall this file owns, which the block has no room for.** The
 * register's *reading configuration before migration completes* is defended
 * here, by the type gate above: no Surface waits on `chrome.runtime.onInstalled`
 * and none has to, because a value that has not been migrated yet does not match
 * its declared type and resolves to the default like any other. DESIGN.md's
 * *Overflow* rule would send this to `core/AGENTS.md`, which does not exist yet,
 * so it is written here as prose.
 *
 * **This file logs nothing, and that is structural.** `core/logger.js` imports
 * this one for its Developer Mode flag. A log call from here would close the
 * cycle, and an ES module cycle does not fail loudly -- it resolves one side to a
 * partially initialised namespace and the symptom surfaces somewhere else.
 *
 * **It calls no `chrome.*` API.** Every area is reached through
 * `core/storage.js`, which is why the block declares `@permissions none` and
 * `@chrome-min baseline` while the file it calls declares `storage` and `102`.
 * That is the same reasoning `core/storage.js`'s own `subscribe` documentation
 * states for its callers.
 *
 * `core/config.js` is the ninth and last Core Module. AD-4 closes the list, so
 * `core/` is complete: a tenth file needs a demonstrated second consumer *and*
 * the removal or merger of an existing one. It is also the ninth Module owing
 * `core/AGENTS.md` a section and a Manifest Fragment -- `{}` here, because
 * `@permissions none` and no numeric `@chrome-min` contribute no manifest key.
 * That file does not exist yet and no story owns it; Epic 3 nominally does.
 */

import { keys } from './config.schema.js';
import { makeError, shown } from './errors.js';
import { get as readArea, set as writeArea, subscribe as watchArea } from './storage.js';

/** @typedef {import('./config.schema.js').ConfigKey} ConfigKey */
/** @typedef {import('./storage.js').Result} Result */
/** @typedef {keyof typeof keys} Name */

/**
 * The type one declared key resolves to.
 *
 * Taken from the entry's `type` rather than from the type of its `default`,
 * which is the **literal** `false` for the one key declared today. Reading
 * `Promise<false>` back would type-check at the assignment and then refuse
 * `true` at the next line, which is a wrong answer arriving one statement late.
 * Widening here keeps the two `type` words the only vocabulary a consumer sees.
 *
 * @template {Name} K
 * @typedef {(typeof keys)[K] extends { type: 'boolean' } ? boolean : string} Value
 */

/**
 * What a declared name is prefixed with to become a storage key.
 *
 * `core/storage.js` owns the `<owner>:<key>` grammar and `cfg` is this owner's
 * name in it, so `dev-mode` reaches storage as `cfg:dev-mode` and a future
 * `find-text.match-limit` as `cfg:find-text.match-limit`. The schema declares
 * bare names on purpose and hands the composition here; composing it in one
 * named place is what stops a second caller composing it differently.
 */
const KEY_PREFIX = 'cfg:';

/** DESIGN.md owns this number so that no Module invents one. */
const SYNC_DEBOUNCE_MS = 750;

/**
 * The area an administrator's policy arrives in. Read-only by the platform --
 * `core/storage.js` refuses a write to it synchronously -- and absent on a
 * machine with no policy, where it reads as empty rather than as a failure.
 */
const POLICY_AREA = 'managed';

/** Only `sync` carries a write-rate limit, so only `sync` is debounced. */
const DEBOUNCED_AREA = 'sync';

const WRITE_FAILED = 'The setting could not be stored. Try again.';

/**
 * Stands in for "this subscription has delivered nothing yet". A `Symbol` is
 * used because it can never equal a declared value, and every other candidate
 * -- `undefined`, `null`, the declared default -- is a value some key could
 * legitimately resolve to, which would suppress a real first delivery.
 */
const UNDELIVERED = Symbol('undelivered');

/**
 * Debounced writes in flight, keyed by **storage key** so that a write to one
 * key cannot cancel a pending write to another. `waiting` holds every caller
 * whose `set` has not resolved yet; they all resolve together with the `Result`
 * of the single write that eventually runs.
 *
 * @type {Map<string, { timer: ReturnType<typeof setTimeout>, waiting: Array<(result: Result) => void> }>}
 */
const pending = new Map();

/**
 * The declaration for a name, or a `TypeError`.
 *
 * **Synchronous by design.** No user, page, or network can produce an
 * undeclared name -- it means the calling code is wrong, and a configuration
 * read that failed into a rejected promise is a defect nobody would look for.
 * This is the same rule `core/storage.js`'s `assertArea` and `assertKey` follow.
 * It is also why `get` and `set` below are ordinary functions returning a
 * promise rather than `async` functions: an `async function` would convert this
 * throw into a rejection.
 *
 * **No `Object.hasOwn` guard, deliberately.** `keys` has a null prototype, so
 * `keys['constructor']` is already `undefined` rather than an inherited method
 * whose `type` and `default` would both be `undefined`. The structure carries
 * the guarantee; a second check here would imply it does not.
 *
 * @param {unknown} name
 * @returns {ConfigKey}
 * @throws {TypeError} If nothing declares this name.
 */
function declaration(name) {
  const entry =
    typeof name === 'string'
      ? /** @type {Readonly<Record<string, ConfigKey | undefined>>} */ (keys)[name]
      : undefined;

  if (entry === undefined) {
    throw new TypeError(
      `Unknown configuration key ${shown(name)}. Every key is declared in core/config.schema.js.`,
    );
  }
  return entry;
}

/**
 * @param {string} name A declared name.
 * @returns {string} The `<owner>:<key>` storage key it reaches storage as.
 */
function storageKey(name) {
  return KEY_PREFIX + name;
}

/**
 * Run the three tiers and return the first value that matches the declared type.
 *
 * The user area is read only when the policy tier did not answer, so a machine
 * under policy pays one round trip rather than two. Reading them in parallel
 * would be faster on the common path and would spend a read nobody uses on the
 * uncommon one; sequential is also the order the rule is written in, which is
 * the property worth optimising for here.
 *
 * @param {ConfigKey} entry
 * @param {string} key
 * @returns {Promise<boolean | string>}
 */
async function resolveValue(entry, key) {
  const policy = await readArea(POLICY_AREA, key);
  if (policy.ok && 'data' in policy && typeof policy.data === entry.type) {
    return /** @type {boolean | string} */ (policy.data);
  }

  const stored = await readArea(entry.area, key);
  if (stored.ok && 'data' in stored && typeof stored.data === entry.type) {
    return /** @type {boolean | string} */ (stored.data);
  }

  return entry.default;
}

/**
 * Read one setting.
 *
 * Resolves administrator policy, then the user area the key declares, then the
 * declared default. Never resolves `undefined`, and never rejects: a storage
 * failure, an absent key, and a value of the wrong type all give the declared
 * default.
 *
 * @template {Name} K
 * @param {K} name A name declared in `core/config.schema.js`.
 * @returns {Promise<Value<K>>} The resolved value.
 * @throws {TypeError} Synchronously, if nothing declares `name`.
 */
export function get(name) {
  const entry = declaration(name);
  return /** @type {Promise<Value<K>>} */ (resolveValue(entry, storageKey(name)));
}

/**
 * Write one setting into the area its declaration names.
 *
 * **A write to a `sync` key is debounced 750 ms, inside this function.** The
 * `sync` cap is 120 writes per minute and exceeding it fails the *write* while
 * the interface goes on looking correct -- the register's own entry, and the
 * reason the protection lives here rather than at each call site, where one
 * writer forgetting it would spend the whole quota. A `local` write is issued
 * immediately: the limit is a property of `sync`, and delaying `local` would
 * cost latency the quota does not buy back.
 *
 * **What the returned promise promises.** It resolves with the `Result` of the
 * write that actually ran, so a failed write is visible to its caller. Where a
 * later `set` arrived inside the window, that is the later write: **the
 * superseded value is never stored**, which is what a debounce is. Every caller
 * waiting on the same key resolves together, and a caller whose value was
 * superseded is told the write succeeded -- read that as *your value, or a newer
 * one, reached storage*, because the closed failure vocabulary has no word for
 * "superseded" and it is not a failure.
 *
 * **A value written beneath an administrator policy is stored and has no
 * effect**, because `get` prefers the policy. Nothing here refuses it; a
 * subsequent read is what shows the user the setting did not move.
 *
 * @template {Name} K
 * @param {K} name A name declared in `core/config.schema.js`.
 * @param {Value<K>} value A value of the declared type.
 * @returns {Promise<Result>} The outcome of the write that carried this value, or a newer one.
 * @throws {TypeError} Synchronously, if nothing declares `name`, or if `value`
 *   is not of the declared type.
 */
export function set(name, value) {
  const entry = declaration(name);
  if (typeof value !== entry.type) {
    throw new TypeError(
      `Configuration key "${String(name)}" is declared ${entry.type} and was given ${shown(value)}.`,
    );
  }

  const key = storageKey(name);
  if (entry.area !== DEBOUNCED_AREA) return writeArea(entry.area, key, value);

  return new Promise((settle) => {
    const held = pending.get(key);
    if (held !== undefined) clearTimeout(held.timer);

    // The same array across the whole window, so every superseded caller is
    // still holding a resolver the one surviving write will call.
    const waiting = held === undefined ? [] : held.waiting;
    waiting.push(settle);

    const timer = setTimeout(async () => {
      pending.delete(key);
      let result;
      try {
        result = await writeArea(DEBOUNCED_AREA, key, value);
      } catch (thrown) {
        // core/storage.js reduces every runtime failure to a Result and throws
        // only for a grammar the schema has already excluded. The catch is here
        // so that no path can leave a caller waiting on a promise that never
        // settles.
        const error = makeError('failed', WRITE_FAILED, thrown);
        result = { ok: /** @type {false} */ (false), error };
      }
      for (const settleOne of waiting) settleOne(result);
    }, SYNC_DEBOUNCE_MS);

    pending.set(key, { timer, waiting });
  });
}

/**
 * Watch one setting and call `fn` whenever its **resolved** value changes.
 *
 * Propagation is `chrome.storage.onChanged` through `core/storage.js`, in every
 * Surface, and **nothing polls**. Both the managed area and the declared user
 * area are watched, because a policy arriving or being withdrawn changes the
 * answer as surely as the user editing it does.
 *
 * **`fn` receives the resolved value, not the stored one.** The change event
 * carries the new value of one area; what a caller needs is what a subsequent
 * `get` would return, so every event triggers a fresh three-tier resolution and
 * the event's own value is discarded. A user-area write underneath an active
 * policy therefore does not deliver the user's value to anybody.
 *
 * **No initial value is delivered**, matching `core/storage.js`'s `subscribe`. A
 * caller that wants the current value calls `get`. Seeding one here would
 * introduce the read that races the first change event -- the race
 * `core/logger.js` already carries a defence against.
 *
 * **A change that does not change the resolved value is not delivered.** Each
 * subscription remembers what it last handed over, so a subscriber is never told
 * a value changed when it did not. The first delivery has no predecessor and
 * always fires, which is why a user-area write under an active policy delivers
 * the unchanged policy value exactly once.
 *
 * **Deliveries are ordered.** Two changes arriving together start two
 * resolutions, and the slower one must not land last with the older value; a
 * per-subscription counter drops any resolution a newer change has superseded.
 * Stopping the subscription supersedes every resolution still in flight, so
 * nothing is delivered after the returned function is called.
 *
 * @template {Name} K
 * @param {K} name A name declared in `core/config.schema.js`.
 * @param {(value: Value<K>) => void} fn Called with the newly resolved value.
 * @returns {() => void} Stops this subscription. Calling it twice is harmless.
 * @throws {TypeError} Synchronously, if nothing declares `name`, or if `fn` is
 *   not a function.
 */
export function subscribe(name, fn) {
  const entry = declaration(name);
  if (typeof fn !== 'function') {
    throw new TypeError(
      `Subscriber for "${String(name)}" must be a function, received ${shown(fn)}.`,
    );
  }

  const key = storageKey(name);
  let generation = 0;
  /** @type {boolean | string | typeof UNDELIVERED} */
  let delivered = UNDELIVERED;

  const changed = () => {
    const mine = (generation += 1);
    resolveValue(entry, key).then(
      (value) => {
        if (mine !== generation) return;
        if (value === delivered) return;
        delivered = value;
        try {
          fn(/** @type {never} */ (value));
        } catch {
          // A subscriber that throws must not escape into the resolution that
          // called it, where it would arrive detached from the subscription
          // that caused it. core/storage.js protects its own listener, and
          // core/messaging.js its tracer, for the same reason.
        }
      },
      () => {
        // resolveValue reads through core/storage.js, which reduces every
        // runtime failure to a Result rather than rejecting. Swallowing here
        // keeps an unhandled rejection out of a service worker that has no way
        // to report one.
      },
    );
  };

  const stopPolicy = watchArea(POLICY_AREA, key, changed);
  const stopUser = watchArea(entry.area, key, changed);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    generation += 1;
    stopPolicy();
    stopUser();
  };
}
