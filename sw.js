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
 * The service-worker composition root. Wiring only: below the imports there are
 * exactly two kinds of statement, one `onRequest` line per privileged handler and
 * the `onInstalled` registration that runs configuration migrations. Every kind
 * costs a static `import` as well, which is the two-lines-not-one rule below. No
 * feature logic lives here, and no state -- the worker is terminated after roughly
 * 30 s idle and anything held in a module variable is gone when it wakes. What has
 * to outlive that goes in `storage.session`, which is where the activity buffer
 * already is.
 *
 * **Why every registration costs two lines, in a worker specifically.** The
 * one-line forms all need `import()`, and dynamic `import()` is **disallowed on
 * `ServiceWorkerGlobalScope`** -- measured by story 1.5, and the reason
 * `logger-worker-check.cjs` appends a static import to its probe. DESIGN.md
 * records the same two-line shape for the shell and argues it from NFR-3, which
 * forbids auto-registration; that argument holds here too and is the second
 * reason rather than the operative one. `core/config.js` owns what the runner
 * does; this file owns only when it runs.
 *
 * **`sw.js` is the update handler, so the Pitfall Register's *Reading
 * configuration before migration completes -- Update handler races other
 * Surfaces* now applies to this file.** L6 permits one `@pitfall` line and this
 * file's is spent on worker termination; DESIGN.md's *Overflow* rule sends the
 * surplus to the owning Module's `AGENTS.md`, and **this file belongs to no
 * Module and is exempt from L12** -- so the entry is stated here as prose, and
 * that is why it is prose. **Nothing waits on the migration.** A Surface reading
 * configuration while one is in flight gets the declared default for anything not
 * matching its declared type, which is AD-13's rule and `core/config.js`'s
 * read-time gate. **That defence is half of one.** It catches a migration that
 * changes a value's *type*; a unit, a format or a meaning changing within
 * `boolean` or `string` passes it and is returned as the answer with nothing
 * raised, and `core/config.schema.js`'s own worked example `v => v + 1` is that
 * shape. Do not read the sentence before this one as the race being closed.
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

// Configuration migrations. `migrate` is passed directly rather than wrapped:
// the reason arrives on the event's own argument and it decides what happens --
// `update` walks the migrations, `install` stamps the current version so the
// first later update does not replay them. A wrapper that dropped the argument
// would make every reason look alike and nothing would raise.
chrome.runtime.onInstalled.addListener(migrate);
