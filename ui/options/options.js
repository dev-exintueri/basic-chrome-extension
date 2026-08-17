// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall input writes per keystroke; local is undebounced and a write returns to move the caret.
 * @alternative A Save button committing every field -- a failed write becomes a batch's outcome.
 * @scales-to Keys outgrow one screen -> a section field on each entry, and a form that groups.
 */

/**
 * The options surface's generator. It reads `core/config.schema.js` and writes
 * one field per declared key; **it contains no key name, and that is the
 * assertion rather than a stylistic claim.** Add a key to the schema and a field
 * appears here with nothing else edited, which is the whole of FR-17.
 *
 * **What a declaration gives it, and what it therefore cannot draw.** Four
 * fields: `type`, `default`, `area`, `label`. `core/config.schema.js` states that
 * the absence of a fifth is deliberate -- no description, no help text, no
 * section name, no pattern, no minimum. So a field is a label and a control, and
 * nothing else. The UX mockup draws per-field help text, which has no source in
 * the schema at all, and a per-key `sync`/`local` badge, which is refused for a
 * different reason: `area` **is** declared, so the badge is drawable, and
 * DESIGN.md closes badges to two uses -- tier and Chrome floor -- and says they
 * are never coloured. The fact reaches the surface as the section it groups
 * under. An earlier version of this paragraph said the badge had no source
 * either; it does, and the reason it is refused is the closure, not the schema.
 *
 * **Two things DESIGN.md specifies that this file cannot produce, named here
 * because a reader should not have to discover them.** A secret field is
 * `type="password"` with a reveal toggle, and a declaration has no field that
 * marks one -- so a token or key declared today renders as plain text. And a
 * namespaced name (`find-text.match-limit`, the shape the schema says to expect)
 * yields `id="cfg-find-text.match-limit"`, which is a valid IDREF -- so `label`
 * and `aria-describedby` hold -- but is not selectable as `#cfg-find-text.match-limit`,
 * because a CSS parser reads the dot as a class. Nothing here selects by id;
 * anything that does needs `CSS.escape`, which `core/render.js` already carries.
 * Both are entries for the fifth-field question, not defects of this file.
 *
 * **Two controls, because two are specified.** `core/config.schema.js` closes the
 * declared type vocabulary at `boolean` and `string` for exactly this reason: the
 * text input is in DESIGN.md's components and the checkbox is what
 * EXPERIENCE.md's accessibility floor requires a toggle to be. There is no third
 * branch below because a third type would hand this file a control the design
 * system does not describe.
 *
 * **Sections come from `area`, which is the only groupable fact a declaration
 * carries.** `AREA_LABELS` is per-AREA and closed at two by `UserArea`, so adding
 * a key never touches it and no layout is written per key. Section order is the
 * order areas first appear in `keys`, so the schema's author owns it.
 *
 * **It binds `change`, never `input`, and the reason is not the one this file
 * used to give.** The earlier claim was that a write per keystroke exceeds the
 * `sync` write-rate cap. **That is false, and `core/config.js` is where it is
 * false:** `set` debounces every `sync` write inside itself and re-arms the timer
 * on each call (`core/config.js:397-441`), so sixty keystrokes into a `sync`
 * field produce **one** write 750 ms after typing stops. A rule whose stated
 * mechanism does not reproduce is a rule the next reader is right to ignore, so
 * the two mechanisms that do reproduce are stated instead:
 *
 * 1. **A `local` key is not debounced at all.** `set` returns `writeArea`
 *    directly for any area that is not `sync`, so `input` would store every
 *    intermediate keystroke -- and every stored value is delivered to every other
 *    realm, which means a half-typed endpoint becomes the configuration the
 *    worker and the panel read.
 * 2. **Every landed write comes back through `subscribe` to this same field.**
 *    The delivery calls `reflect`, which assigns the control's value -- so writing
 *    while the user types means rewriting the field while the user types. That is
 *    the caret loss `list()` is refused for, arriving through the property
 *    instead of through the node, and it is why `reflect` now refuses a focused
 *    text input.
 *
 * The quota numbers stand and were measured on Chrome 151 --
 * `QUOTA_BYTES_PER_ITEM` is 8192, `MAX_WRITE_OPERATIONS_PER_MINUTE` is 120, both
 * reported by the platform rather than read off a document. The 8192 is what
 * makes a failed write reachable at all; the 120 is not what `change` protects.
 * The failure lands on the *write*, and the interface goes on looking correct --
 * which is why the control below is told what happened instead of assuming it
 * succeeded.
 *
 * **Every change re-reads, and the re-read is the contract.** EXPERIENCE.md
 * requires a control to reflect the **stored** value and a failed write to
 * visibly revert. A success `Result` is `{ ok: true }` and carries no value, so a
 * caller whose write was superseded inside the `sync` debounce cannot learn from
 * it what landed -- story 2.2's open question, and `get` after the write settles
 * is the only mechanism that answers it today. So this file re-reads on success
 * as well as on failure: reverting only on failure would leave a superseded field
 * showing a value the store does not hold.
 *
 * **The values are written as PROPERTIES.** `setAttribute('value', ...)` sets an
 * input's *default* value and a checkbox's `checked` attribute is the same, both
 * carrying a dirtiness flag -- so once the user has touched the control the
 * attribute is ignored with no error, and a revert performed that way leaves the
 * failed choice on screen. The register names it and `core/render.js` carries the
 * worked example; `el()` builds the attributes and the two lines in `reflect`
 * write the live state.
 *
 * **`list()` is deliberately not used.** It is a full keyed re-render, so every
 * row is replaced and focus inside it is lost. A form is the one place in this
 * repository where that is fatal: a field re-rendered while its author is typing
 * takes the caret with it. The fields are built once and only their values move.
 *
 * **A missing landmark is a no-op, not a throw.** A copy of this file in a
 * document without `#fields` renders nothing and reports nothing, which is
 * `core/panel.js`'s rule for the same situation and NFR-6's requirement.
 */

import { get, set, subscribe } from '../../core/config.js';
import { keys } from '../../core/config.schema.js';
import { clear, el } from '../../core/render.js';

/** @typedef {import('../../core/config.schema.js').ConfigKey} ConfigKey */
/** @typedef {keyof typeof keys} Name */

/**
 * One label per storage area, and there are exactly two areas a declaration may
 * name. This is the one place this file writes words of its own, and it is
 * per-AREA: a new key lands in an existing section without touching it, and a
 * third entry here is impossible while `UserArea` stays closed.
 *
 * The raw area name was the alternative and it lost: `SYNCED` and `LOCAL` set in
 * the section-label role read as machine facts, and DESIGN.md reserves monospace
 * for those. These say what the grouping means to the person reading it.
 *
 * **`@satisfies` and not `@type`, because the difference is the whole claim.** A
 * `@type` on an object literal is an *assertion*: measured, `tsc` accepts a
 * two-entry map against `Record<'local'|'sync'|'session', string>` in silence,
 * because a narrower object is assignable to a wider one and a cast asks nothing
 * further. `@satisfies` checks the literal against the type without widening it
 * and reports `TS1360: Property 'session' is missing`. So with `@type` the
 * sentence above -- a third entry is impossible while `UserArea` stays closed --
 * was enforced by nothing: widening `UserArea` gave `AREA_LABELS[area] ===
 * undefined`, `el()` skips an `undefined` child, and the section rendered with an
 * empty unlabelled heading. Now it is a compile error.
 */
const AREA_LABELS = Object.freeze(
  /** @satisfies {Readonly<Record<ConfigKey['area'], string>>} */ ({
    local: 'This machine',
    sync: 'Synced',
  }),
);

/** The one landmark this file writes into. */
const FIELDS_ID = 'fields';

/**
 * Write the live state of one control from a resolved value.
 *
 * **The two casts here are where the declared type stops being expressible** --
 * they are not the only casts in the file, and an earlier version of this
 * sentence said they were. `Value<K>` narrows to `boolean` only when `K` is a
 * literal key; inside a walk over `Object.keys()` it is `string`, so the type
 * resolves to `string` for every key including the boolean ones. The branch below
 * tests `entry.type`, which is the same fact `core/config.js` gates every read
 * and write on, so the narrowing is sound at runtime and merely unavailable to
 * the checker. The file's other casts are `AREA_LABELS`'s target type, the
 * `HTMLInputElement` on `el()`'s return, `byArea`'s `Name[]`, and the `never` on
 * `set`'s value -- that last one is the widest and the argument for it is in the
 * listener, not here.
 *
 * **A focused text input is left alone, and that is a decision with a cost.** The
 * value arrives from a subscription or from the re-read after a write, and
 * assigning `.value` to a field somebody is typing in discards the edit and moves
 * the caret -- the same loss `list()` is refused for. So a text input that holds
 * focus is not overwritten. The cost is that such a field can be stale for as
 * long as the user keeps it focused; it re-reads on the user's own `change`,
 * which is the next thing that happens when they leave it. A CHECKBOX is
 * overwritten even while focused, because there is no caret to lose and AC7's
 * revert of a failed toggle must land on the control the user just clicked.
 *
 * @param {HTMLInputElement} control
 * @param {ConfigKey} entry
 * @param {boolean | string} value
 * @returns {void}
 */
function reflect(control, entry, value) {
  if (entry.type === 'boolean') {
    control.checked = /** @type {boolean} */ (value);
    return;
  }
  if (control === document.activeElement) {
    return;
  }
  control.value = /** @type {string} */ (value);
}

/**
 * Show or clear one field's failure.
 *
 * Both halves move together, because DESIGN.md rules out either one alone: the
 * message is what says what happened, and `aria-invalid` is what the border rule
 * keys off, so the drawn state and the announced state cannot drift apart.
 *
 * `error.message` is a sentence `core/errors.js` produced. Chrome's own prose
 * travels as the error's `cause` and is not put on screen -- story 1.8's rule,
 * and a surface that rendered it would break on a Chrome that reworded it.
 *
 * **An empty message clears, and does not count as a message.** `core/errors.js`
 * builds no empty sentence today, so this is an invariant rather than a live
 * case: without it a `''` would set `aria-invalid` while `:empty` kept the slot
 * collapsed, which is the border-without-a-message state the paragraph above
 * says is ruled out.
 *
 * @param {HTMLInputElement} control
 * @param {HTMLElement} slot
 * @param {string | null} message
 * @returns {void}
 */
function report(control, slot, message) {
  if (message === null || message === '') {
    control.removeAttribute('aria-invalid');
    // clear() removes the children, so :empty matches again and the slot's
    // margin collapses. Assigning a space would leave a text node behind and the
    // gap would stand -- the trap story 1.10 paid for on #status. This is
    // core/render.js's third export doing the one job it has here; the
    // equivalent `slot.textContent = ''` said the same thing in this file's own
    // words rather than in the repository's.
    clear(slot);
    return;
  }
  control.setAttribute('aria-invalid', 'true');
  slot.textContent = message;
}

/**
 * Build one field, wire it, and start it.
 *
 * **Three readers write this one control and they are ordered by a counter.**
 * The seed read, the re-read after a write, and every subscription delivery all
 * resolve on their own schedule, and each is two storage round trips
 * (`core/config.js` resolves policy then the user's area). Without an order a
 * slow older resolution lands after a newer one and the control shows a value the
 * store does not hold -- permanently, because `core/config.js` de-duplicates a
 * change back to the value it already delivered, so nothing arrives to correct
 * it. `core/logger.js:155-177` carries the same guard for the same reason and
 * says the two-round-trip resolution is what widens the window; `core/config.js`
 * gives each SUBSCRIPTION a generation counter but nothing coordinates a
 * subscription with this file's own reads. `latest` is that coordination.
 *
 * @param {Name} name A name declared in `core/config.schema.js`.
 * @param {ConfigKey} entry Its declaration.
 * @returns {HTMLElement} The field's root.
 */
function fieldFor(name, entry) {
  const toggle = entry.type === 'boolean';
  const id = `cfg-${name}`;
  const slotId = `${id}-error`;

  const control = /** @type {HTMLInputElement} */ (
    el('input', {
      type: toggle ? 'checkbox' : 'text',
      class: toggle ? 'toggle' : 'input',
      id,
      'aria-describedby': slotId,
    })
  );

  // The accessible name is the declaration's label, bound rather than repeated.
  // `el()` takes the attribute `for`, never the property `htmlFor`.
  const label = el('label', { for: id }, entry.label);

  // A LIVE REGION, present from mount and populated on change, which is
  // EXPERIENCE.md's pattern and what `shell.html` does for #status and #banner.
  // `aria-describedby` alone was not enough and that was a real defect: it is
  // read when focus ARRIVES, and `change` on a text input fires on blur, so the
  // one moment a failure is written is the moment focus has just left. `status`
  // and not `alert`: a failed write is not an interruption, and `ui/popup/`
  // records where that line is drawn.
  const slot = el('p', { class: 'field-error', id: slotId, role: 'status' });

  // A checkbox's label is its name, so it follows the control; a text input's
  // label is a caption, so it sits above. Neither affects the tab order -- the
  // control is the only focusable node in the field either way.
  const field = el(
    'div',
    { class: toggle ? 'field switch' : 'field' },
    toggle ? [control, label, slot] : [label, control, slot],
  );

  // The declared default is written NOW, synchronously, before any read is
  // issued. It costs no storage and it is the value the store will hold unless
  // something has changed it, so a key declared `true` no longer paints `false`
  // and then flips when the seed read lands.
  reflect(control, entry, entry.default);

  // Which resolution is allowed to win. Every event that supersedes an earlier
  // one takes the next number, and a resolution carrying an older number is
  // dropped rather than drawn.
  let latest = 0;

  /**
   * @param {number} generation
   * @param {boolean | string} value
   * @returns {void}
   */
  const apply = (generation, value) => {
    if (generation < latest) {
      return;
    }
    reflect(control, entry, value);
  };

  control.addEventListener('change', () => {
    const generation = (latest += 1);
    const pending = toggle ? control.checked : control.value;
    // `set` throws synchronously for a value of the wrong declared type. It
    // cannot happen from here: a checkbox yields the boolean and a text input
    // the string, which are the two declared types, so the pairing is
    // structural rather than checked.
    set(name, /** @type {never} */ (pending))
      .then((result) => {
        report(control, slot, result.ok ? null : result.error.message);
        return get(name);
      })
      .then((stored) => apply(generation, stored));
  });

  // No initial value is delivered by `subscribe` -- deliberately, so the seed
  // read is explicit and visible here rather than hidden in the kernel. It
  // carries generation 0, so anything that happens while it is in flight wins.
  get(name).then((stored) => apply(0, stored));

  // A change written anywhere else -- another options page, a migration, a
  // policy arriving -- lands here without a reload and without polling. There
  // is no interval and no repeated read in this file.
  subscribe(name, (value) => {
    apply((latest += 1), value);
  });

  return field;
}

/**
 * Group the declared keys by the area they name, in the order the areas first
 * appear. A `Map` keeps insertion order, which is what makes the schema's
 * declaration order the section order.
 *
 * **The one cast in this file that is about the walk rather than about a value.**
 * `core/config.schema.js` types `keys` as its own literal shape, not as
 * `Record<string, ConfigKey>` -- which is what makes a consumer's typo in a key
 * name a compile error, the property story 2.2 paid for and this surface must not
 * throw away. `Object.keys()` returns `string[]` because that is all TypeScript
 * can promise for an arbitrary object, so a walk over the declarations loses that
 * narrowing at exactly this line and nowhere else. Casting here restores it for
 * every call below: `get`, `set` and `subscribe` all keep the declared name type,
 * and a name this file invented would still not type-check.
 *
 * @returns {Map<ConfigKey['area'], Name[]>}
 */
function byArea() {
  /** @type {Map<ConfigKey['area'], Name[]>} */
  const grouped = new Map();
  for (const name of /** @type {Name[]} */ (Object.keys(keys))) {
    const area = keys[name].area;
    const held = grouped.get(area);
    if (held === undefined) {
      grouped.set(area, [name]);
      continue;
    }
    held.push(name);
  }
  return grouped;
}

/**
 * Render every declared key into `container`.
 *
 * @param {HTMLElement | null} container
 * @returns {void}
 */
function mount(container) {
  if (container === null) {
    return;
  }
  for (const [area, names] of byArea()) {
    // The section is NAMED by its label, and the naming is what makes the
    // grouping reach a screen reader. `core/config.schema.js` calls the
    // local/sync distinction the only difference a user can feel; a bare
    // <section> is not exposed as a region and a <p> carries no heading
    // semantics, so without this the distinction was drawn and not conveyed.
    const labelId = `section-${area}`;
    container.append(
      el('section', { class: 'section', 'aria-labelledby': labelId }, [
        el('p', { class: 'section-label', id: labelId }, AREA_LABELS[area]),
        ...names.map((name) => fieldFor(name, keys[name])),
      ]),
    );
  }
}

mount(document.getElementById(FIELDS_ID));
