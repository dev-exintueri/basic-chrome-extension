// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall An unrecognised code reaches a banner and renders as a label nobody defined.
 * @alternative Error subclasses -- sendMessage is JSON-only and drops the message property.
 */

/**
 * The closed failure vocabulary, ordered by who can change the outcome:
 * nobody, the user by switching tabs, the user by retrying, the user by
 * probing. The code is the banner label, so no mapping table exists.
 *
 * The set is closed by architecture decision. A fifth word is an amendment to
 * that decision, never something a caller introduces at a call site.
 */
export const ERROR_CODES = Object.freeze(
  /** @type {const} */ (['unavailable', 'restricted', 'failed', 'unknown']),
);

/** @typedef {(typeof ERROR_CODES)[number]} ErrorCode */

/**
 * Name a rejected argument in a message without risking a second throw.
 *
 * A string is quoted, because a typo is only readable when you can see it.
 * Anything else is reported **by type and never by value**, because an
 * arbitrary value has no safe universal rendering and because a message that
 * echoes what it was given is one accident away from putting a secret in a
 * console line, a log entry, or a bug report.
 *
 * This is the kernel's one such helper. It lived privately in three files
 * before, which NFR-2 calls a defect at the second occurrence; it is exported
 * here rather than from a tenth Core Module because AR-4 closes `core/` at nine
 * files and every file that needs it already imports this one.
 *
 * It is **not** `describe` below. This one hides the value on purpose; that one
 * shows it on purpose, and each is wrong where the other belongs.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function shown(value) {
  return typeof value === 'string' ? `"${value}"` : `a ${typeof value}`;
}

/**
 * Render a rejected argument **including its value**, for the one case where
 * the value is what the reader needs: an error code outside the closed set is a
 * typo, and naming its type instead of its text would hide the typo.
 *
 * `JSON.stringify` raises on a bigint and on a circular structure, and returns
 * `undefined` for a symbol, so every rejection path needs a fallback.
 *
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * Reduce an `Error` cause to the parts that survive transport. `message` and
 * `stack` are own non-enumerable properties, so an `Error` handed straight to
 * `JSON.stringify` arrives as `{}` -- the same loss this file's `@alternative`
 * rejects `Error` subclasses for, and it would return through the back door.
 *
 * @param {unknown} cause
 * @returns {unknown}
 */
function transportable(cause) {
  return cause instanceof Error ? { name: cause.name, message: cause.message } : cause;
}

/**
 * Build the structured error every failure path in this repository returns.
 *
 * The result is a plain object, never a class instance, so it survives the
 * JSON serialisation that crossing a Surface boundary performs. Exactly two
 * shapes exist: `cause` is omitted whenever it is `undefined`, so a caller
 * forwarding an absent cause produces the same object as one that never had
 * one, on both sides of the boundary.
 *
 * `cause` must otherwise be JSON-serialisable. An `Error` is reduced to its
 * name and message; a circular structure or a bigint is not repaired here and
 * will raise at the point of transport rather than here.
 *
 * An unrecognised code throws. That is a programmer error rather than a
 * runtime failure -- no user, page, or network can produce one -- and
 * absorbing it would let a typo ship as a banner label.
 *
 * @param {ErrorCode} code One of the four words.
 * @param {string} message Cause then remedy, sentence case, ending in a full stop.
 * @param {unknown} [cause] Whatever explains the failure to a maintainer.
 * @returns {{ code: ErrorCode, message: string, cause?: unknown }}
 * @throws {TypeError} If `code` is outside the set, or `message` is blank.
 */
export function makeError(code, message, cause) {
  if (!ERROR_CODES.includes(code)) {
    throw new TypeError(
      `Unknown error code ${describe(code)}. Use one of: ${ERROR_CODES.join(', ')}.`,
    );
  }
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new TypeError(
      `Error message must be a non-blank string, received ${describe(message)}.`,
    );
  }
  return cause === undefined ? { code, message } : { code, message, cause: transportable(cause) };
}
