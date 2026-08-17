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
 * **Three functions read and two write.** `get`, `set` and `subscribe` are the
 * vocabulary a Surface sees; `migrate` is the second writer, it runs from the
 * service worker on `chrome.runtime.onInstalled`, and **nothing serialises it
 * against `set`**. Its own documentation names the window that makes a lost write
 * likely rather than theoretical.
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
 * worked example, `v => v + 1`, is exactly that shape. The runner is `migrate` at
 * the end of this file, and its documentation carries the rest of the residue --
 * including the `managed` tier, which it cannot migrate and which outranks
 * whatever it does migrate.
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

import { keys, migrations, version } from './config.schema.js';
import { makeError, shown } from './errors.js';
import { get as readArea, set as writeArea, subscribe as watchArea } from './storage.js';

/** @typedef {import('./config.schema.js').ConfigKey} ConfigKey */
/** @typedef {import('./storage.js').Result} Result */
/** @typedef {keyof typeof keys} Name */

/**
 * The `onInstalled` event's own argument.
 *
 * Derived from Chrome's declaration rather than restated: `chrome-types` gives
 * the details an anonymous inline type, so it is reached through the listener's
 * parameter list. Copying the shape would put a second copy of somebody else's
 * closed vocabulary here, and `reason` is exactly the part that must not drift.
 * This is a type position only -- nothing in this file calls a `chrome.*` API.
 *
 * @typedef {Parameters<Parameters<typeof chrome.runtime.onInstalled.addListener>[0]>[0]} InstalledDetails
 */

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

/**
 * Where the store records which schema version its values are shaped for.
 *
 * **It is deliberately not a `cfg:` key and not an entry in `keys`.** Every
 * entry in `keys` becomes a field in the generated options form, and a version
 * is not a setting a user has an opinion about. `core` is an owner
 * `core/storage.js`'s grammar names explicitly, and `core/logger.js` already
 * owns `log:ring` by the same pattern. Story 2.1's Q11 raised this with three
 * candidates; the other two were a reserved `cfg:` name -- and there is no
 * reserved space inside `cfg:`, because 2.1 measured the schema's own name
 * grammar and `core/storage.js`'s `KEY_PATTERN` to be exactly total against each
 * other -- and a fifth per-key field, which 2.1's own acceptance criteria forbid.
 */
const VERSION_KEY = 'core:schema-version';

/**
 * Every area a declared key lives in, and therefore every area that carries its
 * own copy of `VERSION_KEY`. **One stamp per area, not one per store.**
 *
 * An earlier version of this file kept a single stamp in `local`, reasoning that
 * a synced version tells a second machine that migrations it has never run are
 * already done. That direction is real. The reasoning was still wrong, because
 * it assumed the values are all in one store and `keys` permits `area: 'sync'`:
 * machine A migrates the `sync` value, stamps its own **`local`** version, and
 * `sync` carries the migrated value to B. B updates later, reads a `local`
 * version of 0, applies the same migration to the already-migrated value, and
 * syncs the doubly-applied result back to A. Both machines are wrong, the type
 * never changes, and nothing raises. Idempotence is the only thing that would
 * have saved it, and `Migration`'s own worked example `v => v + 1` is not.
 *
 * A stamp per area closes both directions, because the stamp then travels
 * exactly as far as the values it describes.
 *
 * **The half that is still open**, since a version stamped per area invites the
 * assumption it is now airtight: `sync` does not promise to deliver two writes in
 * the order they were made, so B can receive A's new stamp before A's migrated
 * value. B then skips a migration whose value has not arrived yet, and the
 * read-time type gate is the only thing between that and a wrong answer -- which
 * catches a type change and nothing else.
 *
 * **Derived from `keys` rather than written down.** A literal list would be a
 * second declaration of where configuration lives and would go stale the first
 * time a key declares a different area. `managed` cannot appear: it is not one of
 * the schema's user areas, it is read-only, and `migrate` cannot touch it.
 *
 * @type {ReadonlyArray<ConfigKey['area']>}
 */
const STAMPED_AREAS = Object.freeze([
  ...new Set(Object.values(keys).map((entry) => /** @type {ConfigKey} */ (entry).area)),
]);

/** A store nobody has written is at version 0, which is what a fresh install is. */
const FRESH = 0;

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

/**
 * Read the version one area's values are shaped for.
 *
 * Absent means `FRESH`, because a store nobody has written and a store that has
 * run every migration are the same arithmetic rather than two cases -- the
 * schema says so where it declares `version`. Anything that is not a whole
 * number is a store this code does not understand: not a failure to report, but
 * not a starting point either.
 *
 * **`Number.isInteger` is that check, and no mutation control can redden it.**
 * `typeof NaN === 'number'` and `NaN` compares false against every bound, so
 * without this line `NaN` reaches a loop whose first comparison is false and
 * which runs zero steps; `2.5` reaches `migrations[2.5]`, which is `undefined`,
 * and the run stops there. **Every unusable version converges on the same
 * outcome -- run nothing, write nothing** -- so removing this line changes no
 * observable behaviour today. It is here because the sentence above is the
 * contract, and because that convergence is a property of the loop below rather
 * than of the idea.
 *
 * @param {ConfigKey['area']} area
 * @returns {Promise<number | null>} The version, or `null` if it is unusable.
 */
function storedVersion(area) {
  return readArea(area, VERSION_KEY).then((result) => {
    if (!result.ok) return null;
    if (!('data' in result) || result.data === undefined) return FRESH;
    return Number.isInteger(result.data) ? /** @type {number} */ (result.data) : null;
  });
}

/**
 * Record, in every stamped area, that a store nobody has migrated is already at
 * the current version.
 *
 * **This is the whole of the `install` path, and an earlier version of this file
 * got it wrong on an argument that is true only of an empty store.** That
 * argument was: a fresh store is at `FRESH` by absence, so stamping it buys
 * nothing. It buys nothing *at that instant*. The moment the user writes a
 * setting, the store holds a value written by version *C* code while the stamp
 * says 0 -- and the next update to *C*+1 walks steps 1 … *C*+1 over values that
 * never had the old shape. **Idempotence does not help**: it says `f(f(x))` is
 * `f(x)`, and the hazard is `f1` applied to `f5(x)`.
 *
 * **`FRESH` is not stamped**, because a stamp of 0 says exactly what absence
 * already says, and writing it would spend a write on every install for nothing.
 *
 * **An area already holding a stamp is left alone.** Chrome fires `install` for
 * a fresh install, where there is nothing to leave alone -- but `migrate` is
 * exported and the reason is an argument, so overwriting a real version with the
 * current one is a way to skip every migration in silence, and the read costs one
 * round trip to make it unwriteable.
 *
 * **A failed write leaves the hazard open with nothing to report it**, and
 * `onInstalled` does not fire again for the same install, so nothing retries.
 * That is the honest consequence of the "never rejects, never logs" contract and
 * it is recorded as a question rather than papered over.
 */
async function stampFreshStore() {
  const current = version;
  if (current === FRESH) return;

  for (const area of STAMPED_AREAS) {
    const held = await readArea(area, VERSION_KEY);
    if (!held.ok) return;
    if ('data' in held && held.data !== undefined) continue;

    const stamped = await writeArea(area, VERSION_KEY, current);
    if (!stamped.ok) return;
  }
}

/**
 * Walk each stamped area from its own stored version up to the schema's.
 *
 * **The outer loop is over areas, not over steps.** Each area's keys are
 * migrated against the stamp living in that same area, which is what
 * `STAMPED_AREAS` explains at length; a step naming keys in two areas is applied
 * once per area and stamped once per area, and the two proceed independently.
 *
 * **Any storage failure ends the whole run, including the areas not reached
 * yet.** One rule rather than two: a per-area recovery would leave some areas
 * stamped and some not, with nothing anywhere saying which -- and the version is
 * deliberately raised only after a step's writes have landed, so stopping is
 * always resumable and continuing is not always correct.
 */
async function runMigrations() {
  const current = version;

  for (const area of STAMPED_AREAS) {
    const stored = await storedVersion(area);
    if (stored === null || stored < FRESH || stored > current) return;

    // There is deliberately no `stored === current` early return. The loop's own
    // bounds already run zero steps in that case, and a branch that cannot change
    // an outcome reads as load-bearing to the next person -- the gate proved this
    // one was not by mutating it away and watching nothing move.
    for (let step = stored + 1; step <= current; step += 1) {
      const migration = migrations[step - 1];
      if (migration === undefined) return;

      for (const name of Object.keys(migration)) {
        const entry = /** @type {Readonly<Record<string, ConfigKey | undefined>>} */ (keys)[name];
        if (entry === undefined) continue;
        if (entry.area !== area) continue;

        const key = storageKey(name);
        const held = await readArea(entry.area, key);
        if (!held.ok) return;
        if (!('data' in held) || held.data === undefined) continue;

        const next = migration[name](held.data);

        // The declared type, checked before the write and not after. `set`
        // refuses a wrong-typed value at its call site; these writes do not go
        // through `set`, so without this line a migration is the one writer that
        // can store a value every later read then refuses -- answering the
        // declared default forever, with the version stamped as complete. It
        // also catches the three shapes a migration reaches by accident: a
        // forgotten `return` (`undefined`), a promise from an `async` migration
        // (`object`, which Chrome stores as `{}`), and `v => v + 1` on a string
        // (`NaN`, a `number` no declared type admits).
        if (typeof next !== entry.type) return;

        // An unchanged value is not written. Identity is the right comparison
        // because the check above has already refused everything that is not
        // `boolean` or `string`.
        if (next === held.data) continue;

        const written = await writeArea(entry.area, key, next);
        if (!written.ok) return;
      }

      const stamped = await writeArea(area, VERSION_KEY, step);
      if (!stamped.ok) return;
    }
  }
}

/**
 * Bring the store's values up to the schema's `version`, or stamp a fresh store
 * as already being at it.
 *
 * Wired to `chrome.runtime.onInstalled` in `sw.js`. Two lines there, no state
 * here: the worker is terminated after roughly 30 s idle, so an interrupted run
 * has to be resumable from what is in storage and from nothing else. **`sw.js` is
 * not the only possible caller** -- this is exported, nothing enforces one
 * caller, and the argument is validated below precisely because a second one can
 * reach it.
 *
 * **Two reasons do something, and they do different things.** `update` runs the
 * walk. `install` stamps the current version into every stamped area that has
 * none, which is what stops the *next* update replaying migrations 1 … *C* over
 * values that were written by version *C* code -- see `stampFreshStore`, whose
 * documentation carries the argument this file previously got wrong.
 * `chrome_update` and `shared_module_update` do nothing: Chrome updating itself
 * does not change this extension's stored shapes, and re-running a migration on
 * them would be a second application of a function only documented to be safe
 * under one.
 *
 * **`details.previousVersion` is not the previous schema version.** It is the
 * extension's previous `manifest.json` semver, a different number with a
 * different owner, and starting from it would migrate from `'1.0.0'` to a step
 * count. The starting point comes from `VERSION_KEY`, in the area whose keys are
 * being migrated, and from nowhere else.
 *
 * **The version is raised once per step, after that step's writes have landed.**
 * A run interrupted between two steps therefore resumes at the step it did not
 * finish rather than skipping it. That still means a migration can be applied to
 * its own output, which is why `Migration` requires each function to be
 * idempotent -- a requirement nothing can check, because the functions do not
 * exist yet.
 *
 * **What "resumes" does not mean: nothing retries.**
 * `chrome.runtime.onInstalled` fires once per real update and is **not**
 * re-dispatched when the worker restarts, so a run that stops -- on a failed
 * write, on a migration returning the wrong type, or on the worker being
 * terminated mid-run, which nothing here holds it alive against -- leaves the
 * store half-migrated **until the next release**. The stamp is what makes that
 * survivable rather than what fixes it.
 *
 * **A key a migration names but the store does not hold is skipped.** Applying a
 * function to an absent value invents one: the schema's own worked example,
 * `v => v + 1`, turns `undefined` into `NaN`, which is a `number` no declared
 * type admits and which would then resolve to the declared default forever.
 *
 * **Nothing escapes, and the aborts are indistinguishable from each other and
 * from success.** A migration that throws, a storage failure, a wrong-typed
 * result, an unusable stored version and a completed run all settle the same
 * `Promise<void>`. That is deliberate -- a report shape would be a fifth
 * vocabulary with no consumer -- and it is stated rather than implied, because
 * the caller that would most want to tell them apart is a harness. This file
 * cannot log either: `core/logger.js` imports it, and closing that cycle resolves
 * one side to a partially initialised namespace. So **a migration that fails
 * leaves the store un-migrated with no announcement**, and the only reason that
 * is survivable is the read-time type gate.
 *
 * **Three things the runner cannot reach, all of which can end in a wrong answer
 * with nothing raised.** (1) The gate it relies on catches a migration that
 * changes a value's *type*; a unit, a format or a meaning changing within
 * `boolean` or `string` passes it and is returned as the answer. (2) The
 * `managed` tier is read-only, so a policy value written in the old shape stays
 * in the old shape, passes the type gate, and **wins resolution** on every
 * machine under that policy, forever. (3) `set` and this function are two writers
 * of the same key with no mutual exclusion between them, and the `sync` debounce
 * is a 750 ms window in which a `set` can land between a read here and the write
 * that follows it -- after which the migrated *old* value silently wins and
 * `set`'s caller has already been told `{ ok: true }`.
 *
 * @param {InstalledDetails} [details] The event's own argument.
 * @returns {Promise<void>} Settles when the run is over. Never rejects, whatever
 *   `details` is.
 */
export async function migrate(details) {
  // `typeof` first, so `undefined` and `'update'` are both refused; `null` after
  // it, because `typeof null === 'object'` and reading `.reason` off it throws.
  // AC5 asks only for a missing argument to be safe; a caller that can pass no
  // argument can pass the wrong one.
  if (typeof details !== 'object' || details === null) return;

  const reason = details.reason;
  if (reason !== 'install' && reason !== 'update') return;

  try {
    if (reason === 'install') await stampFreshStore();
    else await runMigrations();
  } catch {
    // The reads and the writes are inside this, not only the migration call. Both
    // reach `core/storage.js`, which reduces runtime failures to a `Result` but
    // still throws **synchronously** from `assertArea`, `assertKey` and
    // `assertStorable` -- so a declared name outside the key grammar, or a value
    // structured-clone cannot carry, arrives here rather than as a `Result`. So
    // does `Object.keys(migrations[i])` when an entry is `null`, which the
    // `undefined` check above does not catch. Without this, `migrate` rejects,
    // and its contract says it does not.
  }
}
