// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall The worker is terminated after roughly 30 s idle and in-memory state vanishes.
 * @alternative A keepalive ping loop -- battery drain and Web Store rejection risk.
 * @scales-to Wiring outgrows one screen -> per-domain wiring modules imported here.
 */

/**
 * The service-worker composition root. Wiring only, and there are exactly two
 * kinds of line: one `onRequest` line per privileged handler, and the
 * `onInstalled` registration that runs configuration migrations. No feature
 * logic lives here, and no state -- the worker is terminated after roughly 30 s
 * idle and anything held in a module variable is gone when it wakes. What has to
 * outlive that goes in `storage.session`, which is where the activity buffer
 * already is.
 *
 * The migration line is the second kind, and it is two lines rather than one for
 * the reason DESIGN.md already recorded about the shell: static ESM cannot bind
 * an import and invoke it in one statement, and every one-line form that exists
 * is the auto-registration NFR-3 forbids. `core/config.js` owns what the runner
 * does; this file owns only when it runs. **Nothing waits on it** -- a Surface
 * reading configuration during a migration gets the declared default for
 * anything not matching its declared type, which is AD-13's rule and
 * `core/config.js`'s read-time gate.
 *
 * Three rules this file has to keep, each of which fails quietly if broken:
 *
 * 1. **Register during synchronous top-level evaluation.** A worker is only
 *    woken for an event whose listener was attached while its script first ran.
 *    A registration made after an `await` works until the first termination and
 *    then stops waking the worker at all -- roughly 30 s after everything looked
 *    correct.
 * 2. **Never `await` at the top level, here or in anything imported here.** A
 *    module service worker that top-level-awaits a `chrome.*` promise never
 *    finishes evaluating; the worker does not start and nothing reports why.
 *    `core/storage.js` and `core/logger.js` both start work at load and both
 *    leave it unawaited for this reason.
 * 3. **`"type": "module"` stays in the manifest.** MV3 service workers are
 *    classic workers by default, and the `import` statements below are a syntax
 *    error without it.
 *
 * This file belongs to no Module and declares no Manifest Fragment, so it is
 * exempt from lint L12. `background.service_worker` and `background.type` are
 * base manifest keys owned by the repository; no Module contributes them.
 */

import { migrate } from './core/config.js';
import { LOG_ACTION, onRequest } from './core/messaging.js';
import { receiveLog } from './core/logger.js';

// The worker is the ring buffer's only writer. Every other Surface sends here.
onRequest(LOG_ACTION, receiveLog);

// Configuration migrations, on update only. `migrate` is passed directly rather
// than wrapped: the reason arrives on the event's own argument, and a wrapper
// that dropped it would make every reason look like an update.
chrome.runtime.onInstalled.addListener(migrate);
