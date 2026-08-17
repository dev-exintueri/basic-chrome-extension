// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall Exceeding the sync write-rate limit fails the write, not the UI, and nothing raises.
 * @alternative A debounce at each call site -- one writer forgets and the whole quota is theirs.
 * @scales-to A Surface reads the same key on a hot path -> cache it, invalidated by onChanged.
 */

/**
 * Configuration, resolved. `core/config.schema.js` declares the keys; this file
 * is the only thing that reads them, writes them, or notices them change.
 *
 * **Three tiers, in one order.** An administrator's policy in `managed` wins;
 * then the user's own value in the area the key declares; then the declared
 * default. Reading the `managed` area with **no managed schema declared in the
 * manifest** is harmless: measured on Chrome 151 by story 1.4, against a probe
 * whose manifest carried no such key, `chrome.storage.managed.get` resolves
 * `{}`. That is the configuration this repository is in today and the one it
 * returns to if `policy/` is deleted. The other case -- a schema declared and no
 * policy set -- is story 2.5's and is **not** measured here. Either way the
 * managed tier is read through `core/storage.js` rather than through a Feature
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
 * **The second pitfall this file owns, and the half of it that is not
 * defended.** The register's *reading configuration before migration completes*
 * is met here by the type gate: no Surface waits on `chrome.runtime.onInstalled`
 * and none has to, because a value whose migration would have **changed its
 * type** does not match the declaration and resolves to the default like any
 * other read. **A migration that keeps the type is not caught** -- a unit, a
 * format, or a meaning changing within `boolean` or `string` passes the gate and
 * is returned as the answer, with nothing raised. `core/config.schema.js`'s own
 * worked example, `v => v + 1`, is exactly that shape. Story 2.3 owns the runner
 * and inherits the residue.
 *
 * **A third one is live and has no tag either.** The register's *assuming the
 * service worker persists* applies to the pending-write map below: it is module
 * scope, and terminating the worker -- or closing the options page -- inside the
 * debounce window drops the write and leaves its caller's promise unsettled.
 *
 * DESIGN.md's *Overflow* rule would send both of these to `core/AGENTS.md` with
 * the tag line ending `More: AGENTS.md`. That file does not exist and no story
 * owns it, so they are written here as prose instead.
 *
 * **This file logs nothing, and must not start.** `core/logger.js` imports this
 * one for its Developer Mode flag, so a log call from here would close the
 * cycle, and an ES module cycle does not fail loudly -- it resolves one side to a
 * partially initialised namespace and the symptom surfaces somewhere else.
 * Nothing enforces this: no lint rule and no dependency check stops the import,
 * and the gate asserts its absence only because it is written down here. It is a
 * rule with a consequence, not a property of the code.
 *
 * **It calls no `chrome.*` API.** Every area is reached through
 * `core/storage.js`, which is why the block declares `@permissions none` and
 * `@chrome-min baseline` whatever that file declares -- its own block is the one
 * owner of those two facts and they are not restated here. This is the reasoning
 * `core/storage.js`'s `subscribe` documentation already states for its callers.
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

/**
 * DESIGN.md owns this number so that no Module invents one, and it is the only
 * place in this file it appears -- the prose below names the constant rather
 * than repeating the value.
 */
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
 * Stands in for "this subscription has delivered nothing yet".
 *
 * A resolved value is `boolean | string` and nothing else, so `null` would have
 * served as well; the `Symbol` is what keeps that true without depending on it.
 * The declared default would **not** have served -- a first change that resolves
 * back to the default is a real delivery, and seeding with it swallows one.
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
 * Run the three tiers and return the first value that matches the declared type,
 * **and whether a read failed on the way**.
 *
 * `degraded` is the difference between *"nothing is stored"* and *"the store
 * could not be asked"*, which every tier otherwise collapses into the same
 * answer. `get` ignores it, because AD-13 says a read resolves to the declared
 * default whatever went wrong. `subscribe` cannot ignore it: handing a
 * subscriber the default because one read failed would tell it a value changed
 * when the stored value did not move, and would leave it holding that answer
 * until some later event happened to arrive.
 *
 * A failed **policy** read sets it too. Falling through to the user's own value
 * is the right answer for `get`, but it means a machine under an administrator
 * policy may momentarily resolve the value that policy exists to override, and
 * that is not a change worth waking a subscriber for.
 *
 * The user area is read only when the policy tier answered nothing, so a
 * machine under policy pays one round trip rather than two. **No such machine
 * exists yet** — `policy/` and its manifest key are story 2.5's — so today every
 * read pays two, and the ordering is the rule's own order rather than a
 * measured optimisation.
 *
 * **The first read is issued synchronously**, before this function returns its
 * promise, so a `TypeError` from `core/storage.js`'s key grammar reaches the
 * caller of `get` as a throw rather than as a rejection. Written `async`, the
 * `await` on the first line would swallow it into the promise and `get`'s
 * "never rejects" would be false for a declared name outside that grammar.
 *
 * @param {ConfigKey} entry
 * @param {string} key
 * @returns {Promise<{ value: boolean | string, degraded: boolean }>}
 * @throws {TypeError} Synchronously, if the composed key is outside
 *   `core/storage.js`'s grammar.
 */
function resolveValue(entry, key) {
  const asked = readArea(POLICY_AREA, key);

  return asked.then(async (policy) => {
    if (policy.ok && 'data' in policy && typeof policy.data === entry.type) {
      return { value: /** @type {boolean | string} */ (policy.data), degraded: false };
    }

    const stored = await readArea(entry.area, key);
    if (stored.ok && 'data' in stored && typeof stored.data === entry.type) {
      return { value: /** @type {boolean | string} */ (stored.data), degraded: !policy.ok };
    }

    return { value: entry.default, degraded: !policy.ok || !stored.ok };
  });
}

/**
 * Read one setting.
 *
 * Resolves administrator policy, then the user area the key declares, then the
 * declared default. Never resolves `undefined`, and never rejects: a storage
 * failure, an absent key, and a value of the wrong type all give the declared
 * default.
 *
 * **Two failures resolve to something other than the stored truth, and both are
 * silent.** A failed read of the user area gives the declared default, which is
 * indistinguishable from an unset key. A failed read of the *policy* area gives
 * the **user's** value, so a machine under an administrator policy obeys its
 * user for as long as that read keeps failing. Both are the price of AD-13's
 * rule that a read always has an answer; neither is reported, because there is
 * no outcome to report it as.
 *
 * @template {Name} K
 * @param {K} name A name declared in `core/config.schema.js`.
 * @returns {Promise<Value<K>>} The resolved value.
 * @throws {TypeError} Synchronously, if nothing declares `name`, or if the key
 *   it composes is outside `core/storage.js`'s grammar.
 */
export function get(name) {
  const entry = declaration(name);
  return /** @type {Promise<Value<K>>} */ (
    resolveValue(entry, storageKey(name)).then((resolved) => resolved.value)
  );
}

/**
 * Write one setting into the area its declaration names.
 *
 * **A write to a `sync` key is debounced by `SYNC_DEBOUNCE_MS`, inside this
 * function.** Exceeding the area's write-rate cap fails the *write* while the
 * interface goes on looking correct -- the register's own entry, and the reason
 * the protection lives here rather than at each call site, where one writer
 * forgetting it would spend the whole quota. Both the delay and the cap are
 * DESIGN.md's numbers; the constant carries the delay and this sentence
 * deliberately repeats neither, because a number restated in prose is a number
 * that drifts.
 *
 * **It bounds this Surface, not the extension.** The map below is keyed by
 * storage key and lives in module scope, so N `sync` keys edited at once are N
 * independent windows, and two Surfaces holding the module are two more. The cap
 * Chrome enforces is global. A `local` write is issued immediately: the limit is
 * a property of `sync`, and delaying `local` would cost latency the quota does
 * not buy back.
 *
 * **A read taken before the window closes still sees the old value.** `get`
 * goes to storage and the write has not been issued yet, so a read-after-write
 * inside the window resolves what was there before.
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
        // REACHABLE, and not for the reason an earlier version of this comment
        // claimed. core/storage.js reduces every runtime failure to a Result,
        // but it still throws synchronously from assertArea, assertKey,
        // assertWritable and assertStorable -- and the schema's name grammar is
        // prose that nothing enforces, so a declared name outside
        // core/storage.js's key grammar reaches here. On the undebounced path
        // that same defect throws out of set() at the call site; here set() has
        // already returned, so it can only be reported. A call-site defect
        // wearing a retryable `failed` is the cost, and it is recorded as a
        // question rather than papered over. Do not delete this catch: without
        // it the caller waits on a promise nothing will ever settle.
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
 * **A resolution built on a failed read delivers nothing at all.** Every tier
 * resolves to the declared default when it cannot be read, which is correct for
 * `get` and wrong here: it would announce a change the store never made. The
 * subscription keeps the value it last delivered and waits for a change it can
 * actually resolve.
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
      ({ value, degraded }) => {
        if (mine !== generation) return;
        // A resolution built on a failed read is not evidence of a change. The
        // stored value did not move; one of the two reads did not arrive, and
        // delivering the declared default for it would report a change that
        // never happened AND leave this subscription holding that answer until
        // some later event happened to come along. That is the shape of the
        // defect core/logger.js's own seed guard exists to prevent, reached
        // through a door nobody had guarded.
        if (degraded) return;
        if (value === delivered) return;
        try {
          fn(/** @type {never} */ (value));
        } catch {
          // A subscriber that throws must not escape into the resolution that
          // called it, where it would arrive detached from the subscription
          // that caused it. core/storage.js protects its own listener, and
          // core/messaging.js its tracer, for the same reason.
          return;
        }
        // Only after `fn` returned. Advancing it first would record a delivery
        // that threw, and a subscriber that failed once on this value would
        // never be offered it again.
        delivered = value;
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
