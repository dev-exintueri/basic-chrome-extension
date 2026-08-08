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
 * Render a rejected argument for a diagnostic message without throwing again.
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
