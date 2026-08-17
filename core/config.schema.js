// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall A secret declared here is plaintext on disk, and leaves the machine when area is sync.
 * @alternative A separate migrations file -- it would be a tenth Core Module and AD-4 closes nine.
 * @scales-to Keys outgrow one screen -> a section field on each entry, and a form that groups.
 */

/**
 * The single declaration of every configuration key.
 *
 * **This file is data.** It imports nothing, calls no `chrome.*` API, and runs
 * nothing beyond building the three values it exports and freezing them and the
 * declarations inside them. That is why its floor is `baseline` and its
 * permission cost is `none`: a permission is declared by the file that *calls*
 * the API, and this one calls nothing.
 *
 * **Nothing here checks itself, and nothing in a clone checks it either.** The
 * invariants stated below -- the four fields, the type of each default, the name
 * grammar, the freeze depth, `version === migrations.length`, and the agreement
 * with `core/logger.js` -- are asserted by a harness that lives outside the
 * repository and does not travel with a copy. Until the unit suite exists they
 * are conventions a reader has to hold, which is why each of them is written
 * down here with its reason rather than merely obeyed.
 *
 * **The zero imports are a decision, not an accident.** Dependency direction
 * would permit `core/` to reach `core/`, so taking `AREAS` from
 * `core/storage.js` or a validator from `core/errors.js` would be legal. Both
 * are refused, because the Acceptance Check copies the *transitive closure* a
 * Module names under `## Depends on`. Every dependency taken here would land in
 * the closure of every slice that ever reaches configuration. At zero imports,
 * this file costs a copier nothing but itself.
 *
 * **What it is not.** It resolves nothing, reads nothing, and writes nothing.
 * `core/config.js` does that, and the three-tier order is its business:
 * administrator policy from the managed area, then the user area declared here,
 * then the default declared here.
 */

/**
 * A declared key names four things and no fifth.
 *
 * | Field | Is |
 * | --- | --- |
 * | `type` | The declared type. `typeof stored === type` is the whole of the read-time check |
 * | `default` | The value a read resolves to when nothing valid is stored |
 * | `area` | Where the user's own value lives -- per key, so the two can coexist |
 * | `label` | The text a generated form field is labelled with |
 *
 * **There is deliberately no fifth field.** No description, no help text, no
 * section name, no pattern, no minimum or maximum. The schema is said to drive
 * five outputs -- default, form field, validation rule, migration entry, JSDoc
 * type -- and the fifth of those, validation, has no field of its own because
 * **the type is the validation rule**. A stored value that does not match its
 * declared type resolves to the default, which is what makes a read safe during
 * a migration, an unset key, and a hand-edited storage entry alike, with one
 * mechanism rather than three.
 *
 * **Adding a key is one entry in one file, and the entry is all four fields.**
 * Pick a name that fits the grammar below; give it a `type` from the two below
 * and a `default` of that type; give it an `area`, which is the only field with
 * no safe guess, because it decides whether the setting follows the user to
 * another machine; and give it a `label`, which becomes the accessible name of
 * the control generated for it and is the reason its wording is decided here
 * rather than in the form. Nothing else anywhere needs to be written for the key
 * to exist: the form field, the JSDoc type, and the read-time check all come
 * from that entry.
 *
 * **A default is a value `JSON` can carry, and that is structural rather than
 * disciplined.** `chrome.storage` does not refuse a value it cannot serialise --
 * it reshapes it and the write resolves. A `Date` and a `Set` each come back as
 * `{}`, a circular reference comes back as `null`, and an `undefined` property
 * disappears, with nothing raised on any path. Closing the type vocabulary at
 * `boolean` and `string` puts every one of those shapes out of reach of a
 * declaration, so the register's entry for it cannot apply to this file. Widening
 * the vocabulary would make it apply again, and would need this paragraph turned
 * into a guard.
 *
 * The one thing that is not covered by "exactly one file": a **Feature Module**
 * adding a key also carries its entry *verbatim* in its own `AGENTS.md` copy
 * procedure. That is a copy for a copier's benefit, in the same spirit as the
 * two lines the shell needs -- not a second declaration.
 */

/**
 * The declared types, closed at two.
 *
 * Two form controls are specified anywhere: the text input in `DESIGN.md`'s
 * components, and the checkbox `EXPERIENCE.md`'s accessibility floor requires a
 * toggle to be. A third type would hand the options surface a control with no
 * specification, which is a change to the design documents rather than to this
 * file. Both of these also map to exactly one `typeof` result, which is what
 * keeps the read-time check a single expression.
 *
 * It is frozen for the same reason the failure vocabulary and the storage areas
 * are: the set itself is the contract. It is **not exported**, because the
 * export surface of this file is fixed at three names.
 */
const TYPES = Object.freeze(/** @type {const} */ (['boolean', 'string']));

/**
 * The areas a user's own configuration value may live in.
 *
 * **Deliberately narrower than `core/storage.js`'s `AREAS`, which has four.**
 * `session` is cleared on browser restart and is therefore not configuration by
 * definition. `managed` is the administrator tier that *overrides* a user area
 * rather than being one -- resolution runs managed, then this area, then the
 * declared default. The two remaining areas are the two the options surface
 * writes, and the difference between them is the only one a user can feel:
 * `sync` follows them to another machine and `local` does not.
 *
 * Written here rather than imported, per the zero-import rule above.
 */
const USER_AREAS = Object.freeze(/** @type {const} */ (['local', 'sync']));

/** @typedef {(typeof TYPES)[number]} ConfigType */
/** @typedef {(typeof USER_AREAS)[number]} UserArea */

/**
 * The two fields an entry carries whatever its type is.
 *
 * @typedef {object} ConfigCommon
 * @property {UserArea} area Where the user's own value lives.
 * @property {string} label The label of the generated form field, and its accessible name.
 */

/**
 * A declared key.
 *
 * **`type` and `default` are one choice rather than two.** Declaring `default`
 * as `boolean | string` alongside a `type` of either would let the two disagree
 * and would let the disagreement past the type checker -- after which every read
 * of that key fails `typeof stored === type` for every value it could ever hold,
 * and resolves to the mistyped default instead. Nothing raises. Pairing them in
 * a union makes the mistake unwriteable.
 *
 * Each member's `type` is intersected with `ConfigType` so the pair stays tied
 * to `TYPES` above: drop a word from that array and the member it names becomes
 * `never`, which the declaration below then fails to satisfy. The two say the
 * same thing, and cannot come to say different ones.
 *
 * @typedef {(ConfigCommon & { type: ConfigType & 'boolean', default: boolean })
 *   | (ConfigCommon & { type: ConfigType & 'string', default: string })} ConfigKey
 */

/**
 * One migration. Its index + 1 is the version it produces.
 *
 * A migration maps a declared key name to a function taking that key's stored
 * value and returning its replacement, so one entry can cover several keys the
 * way one version bump does, and a run is per key.
 *
 * **Idempotence is a property of the function, not of this shape.** `v => v + 1`
 * is a legal migration under this signature and running it twice is not the same
 * as running it once -- and a runner can re-fire, because the update event can
 * arrive again before the new version is stored. Write each function so that
 * applying it to its own output changes nothing.
 *
 * **Story 2.3 owns the runner** and may need to refine this: a rename, a
 * removal, and a move between areas are all migrations this shape cannot
 * express. The array below is empty, so nothing is bound by it yet. Every
 * migration appended to it is frozen, for the reason `keys` is.
 *
 * @typedef {Readonly<Record<string, (value: unknown) => unknown>>} Migration
 */

/**
 * The schema version, and the count of migrations that have ever been needed.
 *
 * **`version === migrations.length` is an invariant, not a coincidence.** A
 * migration's index + 1 is the version it produces, so the migration that
 * reaches version *V* is `migrations[V - 1]` and a store at version *V* has run
 * exactly *V* of them. A store that has never been written is at version 0,
 * which is what a fresh install is -- so a fresh install and a fully migrated
 * one are the same arithmetic rather than two cases.
 *
 * Raising this number without appending a migration, or appending one without
 * raising this number, breaks that. Do neither.
 */
export const version = 0;

/**
 * Every configuration key. The name is the key rather than a `name` field, so a
 * lookup is a lookup and a repeated name collapses to one entry instead of two
 * that both claim to be declared. It is not a guarantee: a duplicate property in
 * an object literal is legal JavaScript and the later one silently wins, which
 * the type checker refuses and the language does not.
 *
 * **Name grammar.** Lowercase kebab segments separated by dots:
 * `^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)*$`. No underscore, no camelCase, no
 * leading digit. A **kernel** key stays bare -- `dev-mode`. A **Feature
 * Module's** key is namespaced with its directory name -- `find-text.match-limit`
 * -- which keeps the two distinguishable at a glance and stops two
 * independently copied slices claiming one key, a collision that would surface
 * as an options form with two fields writing one storage entry.
 *
 * There is only one key today and it is a kernel key, so the namespaced half of
 * that rule has nothing to demonstrate. It is written down rather than shown,
 * and no key has been invented for a Module that does not exist.
 *
 * **A declared name is not a storage key.** The storage key is `cfg:` followed
 * by the declared name, which is what makes `dev-mode` reach storage as
 * `cfg:dev-mode` and would make `find-text.match-limit` reach it as
 * `cfg:find-text.match-limit`. Both are the worked examples already written
 * into `core/storage.js`'s own key grammar. Composing that prefix is
 * `core/config.js`'s job; this file declares bare names.
 *
 * **Frozen at both levels, because freezing is shallow.** Freezing this object
 * alone would leave every declaration inside it mutable, which is the whole of
 * what there is to protect.
 *
 * @satisfies {Readonly<Record<string, ConfigKey>>}
 */
const declared = {
  /**
   * Developer Mode. `local`, because the setting is about this machine and
   * should not follow the user to another one; `false`, because a mode that
   * costs nothing when off has to be off to begin with.
   *
   * `core/logger.js` has been reading this key at `cfg:dev-mode` in `local`
   * with a fallback of `false` since it was written, from a time before this
   * file existed. The two agree; nothing in a clone checks that they still do,
   * so the agreement is a thing to re-read rather than a thing that is held.
   * The duplicate leaves `core/logger.js` when its read moves behind
   * `core/config.js`.
   */
  'dev-mode': Object.freeze({
    type: 'boolean',
    default: false,
    area: 'local',
    label: 'Developer Mode',
  }),
};

/**
 * **The object has no prototype, and that is a correctness fix rather than
 * hardening.** An ordinary object answers a lookup for `constructor`, `toString`
 * or `valueOf` with something inherited and truthy, whose `type` and `default`
 * are both `undefined`. A resolver written exactly as this file describes it --
 * `typeof stored === entry.type ? stored : entry.default` -- then answers
 * `undefined` for a key nobody declared, which is the one value `core/storage.js`
 * refuses to write and the one thing a configuration read must never return.
 * Worse, it disagrees with itself: `Object.keys()` lists one key, so the form
 * generator and the resolver would not agree about which keys exist. A
 * null-prototype object inherits nothing, so a lookup and a walk answer alike.
 *
 * The declaration above is checked against `ConfigKey` and keeps its literal key
 * names, so a consumer's typo in `keys['dev-mdoe']` is a type error rather than
 * a runtime one.
 *
 * @type {Readonly<typeof declared>}
 */
export const keys = Object.freeze(Object.assign(Object.create(null), declared));

/**
 * The migrations, in order. Empty, and present rather than omitted: absence and
 * zero are different claims, and this one says no stored shape has ever needed
 * changing.
 *
 * Nothing here registers or awaits anything. The update event is wired in the
 * service worker by story 2.3, as two lines that can be read and removed as a
 * unit -- an `import` and a registration, because in a worker the one-line forms
 * all need dynamic `import()` and that is disallowed on
 * `ServiceWorkerGlobalScope`. **No Surface waits on it**, and the reason is worth
 * stating once rather than three times in three files: a read taken during a
 * migration resolves through whatever the store holds, and the declared default
 * only when that value does not match its declared type. **A migration that keeps
 * the type is therefore read as the answer, old shape or new** -- which is the
 * half of the defence that does not hold, and `v => v + 1` above is exactly that
 * shape. `core/config.js` is where the whole account lives.
 *
 * @type {ReadonlyArray<Migration>}
 */
export const migrations = Object.freeze(/** @type {Migration[]} */ ([]));
