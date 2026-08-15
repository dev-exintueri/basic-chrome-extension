// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall An API key declared here reaches Google's servers the moment its area is sync.
 * @alternative A separate migrations file -- it would be a tenth Core Module and AD-4 closes nine.
 * @scales-to Keys outgrow one screen -> a declared section per key, and a form that groups by it.
 */

/**
 * The single declaration of every configuration key.
 *
 * **This file is data.** It imports nothing, calls no `chrome.*` API, and runs
 * nothing beyond building three frozen values. That is why its floor is
 * `baseline` and its permission cost is `none`: a permission is declared by the
 * file that *calls* the API, and this one calls nothing.
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
 * **Adding a key is four lines in one file.** Pick a name that fits the grammar
 * below, add an entry to `keys`, give it a type from the two below, and give it
 * a default of that type. Nothing else anywhere needs to be written for the key
 * to exist: the form field, the JSDoc type, and the read-time check all come
 * from that entry.
 *
 * The one thing that is not covered by "exactly one file": a **Feature Module**
 * adding a key also carries its entry *verbatim* in its own `AGENTS.md` copy
 * procedure. That is a copy for a copier's benefit, in the same spirit as the
 * two lines the shell needs -- not a second declaration.
 */

/**
 * The declared types, closed at two.
 *
 * The visual system specifies exactly two form controls: a text input and a
 * checkbox. A third type would hand the options surface a control with no
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
 * @typedef {object} ConfigKey
 * @property {ConfigType} type The declared type; the read-time check is `typeof stored === type`.
 * @property {boolean | string} default A value of the declared type. Never a function or a getter.
 * @property {UserArea} area Where the user's own value lives.
 * @property {string} label The label of the generated form field, and its accessible name.
 */

/**
 * One migration. Its index + 1 is the version it produces.
 *
 * A migration maps a declared key name to a function taking that key's stored
 * value and returning its replacement, so a run is per key and running it twice
 * changes nothing a run once did not. **Story 2.3 owns the runner** and may
 * refine this signature; the array below is empty, so no migration is bound by
 * it yet.
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
 * Every configuration key. The name is the key; there is no `name` field,
 * because an object cannot hold the same name twice and an array can.
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
 * @type {Readonly<Record<string, ConfigKey>>}
 */
export const keys = Object.freeze({
  /**
   * Developer Mode. `local`, because the setting is about this machine and
   * should not follow the user to another one; `false`, because a mode that
   * costs nothing when off has to be off to begin with.
   *
   * `core/logger.js` has been reading this key at `cfg:dev-mode` in `local`
   * with a fallback of `false` since it was written, from a time before this
   * file existed. The two agree, and a check asserts that they still do rather
   * than trusting it. That duplicate leaves `core/logger.js` when its read
   * moves behind `core/config.js`.
   */
  'dev-mode': Object.freeze({
    type: 'boolean',
    default: false,
    area: 'local',
    label: 'Developer Mode',
  }),
});

/**
 * The migrations, in order. Empty, and present rather than omitted: absence and
 * zero are different claims, and this one says no stored shape has ever needed
 * changing.
 *
 * Nothing here registers or awaits anything. The update event is wired in the
 * service worker by story 2.3, as one line that can be read and removed as a
 * unit, and **no Surface waits on it** -- a read during a migration resolves
 * through the declared default like any other read that finds no value of the
 * declared type.
 *
 * @type {ReadonlyArray<Migration>}
 */
export const migrations = Object.freeze(/** @type {Migration[]} */ ([]));
