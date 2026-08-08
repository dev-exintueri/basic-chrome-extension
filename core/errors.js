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
 * Build the structured error every failure path in this repository returns.
 *
 * The result is a plain object, never a class instance, so it survives the
 * JSON serialisation that crossing a Surface boundary performs. `cause` is
 * present only when supplied, so exactly two shapes exist.
 *
 * An unrecognised code throws. That is a programmer error rather than a
 * runtime failure -- no user, page, or network can produce one -- and
 * absorbing it would let a typo ship as a banner label.
 *
 * @param {ErrorCode} code One of the four words.
 * @param {string} message Cause then remedy, sentence case, ending in a full stop.
 * @param {unknown} [cause] Whatever explains the failure to a maintainer.
 * @returns {{ code: ErrorCode, message: string, cause?: unknown }}
 * @throws {TypeError} If `code` is outside the set, or `message` is not a non-empty string.
 */
export function makeError(code, message, cause) {
  if (!ERROR_CODES.includes(code)) {
    throw new TypeError(
      `Unknown error code ${JSON.stringify(code)}. Use one of: ${ERROR_CODES.join(', ')}.`,
    );
  }
  if (typeof message !== 'string' || message.length === 0) {
    throw new TypeError(
      `Error message must be a non-empty string, received ${JSON.stringify(message)}.`,
    );
  }
  return arguments.length > 2 ? { code, message, cause } : { code, message };
}
