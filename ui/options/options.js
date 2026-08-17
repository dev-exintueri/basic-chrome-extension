// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall A write per keystroke exceeds the sync rate cap and fails the write, not the interface.
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
 * nothing else. The UX mockup draws per-field help text and a `sync`/`local`
 * badge; neither has a source in the schema, and DESIGN.md wins over any mock.
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
 * **It binds `change`, never `input`, and that is the pitfall above rather than a
 * preference.** `change` on a text input fires when the field is left; `input`
 * fires per keystroke, and a write per keystroke is what exceeds the `sync`
 * write-rate cap. Measured on Chrome 151: `QUOTA_BYTES_PER_ITEM` is 8192 and
 * `MAX_WRITE_OPERATIONS_PER_MINUTE` is 120, both reported by the platform rather
 * than read off a document. The failure lands on the *write*, and the interface
 * goes on looking correct -- which is why the control below is told what happened
 * instead of assuming it succeeded.
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
import { el } from '../../core/render.js';

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
 */
const AREA_LABELS = Object.freeze(
  /** @type {Readonly<Record<ConfigKey['area'], string>>} */ ({
    local: 'This machine',
    sync: 'Synced',
  }),
);

/** The one landmark this file writes into. */
const FIELDS_ID = 'fields';

/**
 * Write the live state of one control from a resolved value.
 *
 * The two casts are the only ones in this file and they are where the declared
 * type stops being expressible. `Value<K>` narrows to `boolean` only when `K` is
 * a literal key; inside a walk over `Object.keys()` it is `string`, so the type
 * resolves to `string` for every key including the boolean ones. The branch below
 * tests `entry.type`, which is the same fact `core/config.js` gates every read
 * and write on, so the narrowing is sound at runtime and merely unavailable to
 * the checker.
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
 * @param {HTMLInputElement} control
 * @param {HTMLElement} slot
 * @param {string | null} message
 * @returns {void}
 */
function report(control, slot, message) {
  if (message === null) {
    control.removeAttribute('aria-invalid');
    // textContent = '' removes the children, so :empty matches again and the
    // slot collapses. Assigning a space would leave a text node behind and the
    // empty box would stand -- the trap story 1.10 paid for on #status.
    slot.textContent = '';
    return;
  }
  control.setAttribute('aria-invalid', 'true');
  slot.textContent = message;
}

/**
 * Build one field, wire it, and start it.
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
  const slot = el('p', { class: 'field-error', id: slotId });

  // A checkbox's label is its name, so it follows the control; a text input's
  // label is a caption, so it sits above. Neither affects the tab order -- the
  // control is the only focusable node in the field either way.
  const field = el(
    'div',
    { class: toggle ? 'field switch' : 'field' },
    toggle ? [control, label, slot] : [label, control, slot],
  );

  control.addEventListener('change', () => {
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
      .then((stored) => reflect(control, entry, stored));
  });

  // No initial value is delivered by `subscribe` -- deliberately, so the seed
  // read is explicit and visible here rather than hidden in the kernel.
  get(name).then((stored) => reflect(control, entry, stored));

  // A change written anywhere else -- another options page, a migration, a
  // policy arriving -- lands here without a reload and without polling. There
  // is no interval and no repeated read in this file.
  subscribe(name, (value) => reflect(control, entry, value));

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
    container.append(
      el('section', { class: 'section' }, [
        el('p', { class: 'section-label' }, AREA_LABELS[area]),
        ...names.map((name) => fieldFor(name, keys[name])),
      ]),
    );
  }
}

mount(document.getElementById(FIELDS_ID));
