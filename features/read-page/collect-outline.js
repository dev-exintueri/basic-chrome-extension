// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall An unfiltered walk collects headings the page never renders. More: AGENTS.md
 * @alternative checkVisibility() -- it is Chrome 105 and would raise this leaf above baseline.
 * @scales-to The outline must cover frames or shadow roots -> a leaf per frame under allFrames.
 */

/*
 * The Leaf Content Script. One operation: collect the page's rendered document
 * outline.
 *
 * WHY THIS FILE HAS NO IMPORT, NO EXPORT AND NO NAME. It is not a module. It is
 * injected by `core/tabs.js` through `chrome.scripting.executeScript({ files })`
 * at the moment of a user gesture, it runs in the tab's ISOLATED world, and its
 * value reaches the caller as the `result` of that promise. It does not
 * sendMessage, does not know its caller, and does not log -- an injected logger
 * would need `web_accessible_resources` or a page-visible global, and both break
 * R3. `core/tabs.js` records the request and the outcome on this file's behalf,
 * tagged `cs` (AR-5, AD-5).
 *
 * WHY IT IS ONE ANONYMOUS IIFE. A tab's isolated world is SHARED across every
 * injection into it. Story 1.8 measured the consequence on Chrome 151: two files
 * each declaring a top-level `function collect()` both ran and each returned its
 * own value, and a third injection calling `collect()` afterwards got the SECOND
 * file's -- the binding is overwritten and nothing is raised. A leaf that creates
 * no top-level binding cannot collide with one it has never heard of.
 *
 * WHY IT RETURNS ITS FAILURE INSTEAD OF THROWING. Also measured in story 1.8: a
 * leaf that throws, a leaf that rejects and a leaf that returns `undefined` all
 * resolve to `{ documentId, frameId, result: null }`, byte for byte, and there is
 * no `error` key on the result. `core/tabs.js` therefore reports a raised leaf as
 * `{ ok: true, data: undefined }` and cannot do otherwise. So the whole body sits
 * inside one `try`, and a failure comes back as data the caller can recognise.
 *
 * THE TWO SHAPES IT CAN RETURN, AND NOTHING ELSE:
 *
 *   { ok: true,  headings: [ { level: 1..6, text: '...', at: n }, ... ], skipped: n }
 *   { ok: false, message: '...' }
 *
 * `at` is the heading's position among EVERY h1-h6 in the document, counted
 * before the rendered filter runs. It is what lets the second operation scroll to
 * this exact heading without re-deriving what "rendered" means: a predicate
 * duplicated across two files is a predicate that will disagree with itself.
 * `document.querySelectorAll('h1, h2, h3, h4, h5, h6')[at]` is the same element
 * this walk saw, because both are document order over the same tree.
 *
 * `skipped` counts the subtrees this walk could not enter -- open shadow roots
 * and frames. It is not an error: the walk worked, and it worked on less than the
 * whole page. The view raises a `degraded` banner when it is non-zero, because a
 * documented limitation in force while the feature works is exactly what that
 * label is for, and reporting `0 headings` for a page whose headings all live
 * inside custom elements would be a confident wrong answer.
 *
 * Everything returned is plain JSON. The value crosses a JSON boundary on its way
 * back: a Map, a Set, a Date and a DOM node all arrive as `{}` and a circular
 * reference has its cycle replaced by `null`, with nothing raised. A number and a
 * string survive, which is the whole reason a row carries `level` rather than its
 * element.
 */

(async () => {
  try {
    /* A walk, not a query. `querySelectorAll` would find the same headings in one
     * uninterruptible pass; walking every element is what makes the cost real on
     * a large document, which is what NFR-10 is about, and a walk is the shape
     * every later leaf inherits (FR-7).
     *
     * The root is `documentElement` rather than `body`, because it is the one
     * element a document always has. A `<template>`'s content is not in this tree
     * at all, so the walker never reaches it -- stated because it is the case a
     * reviewer looks for and does not find a line for. Shadow roots and frames
     * are not in it either, and those are counted rather than passed over
     * silently. */
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);

    /** @type {{ level: number, text: string, at: number }[]} */
    const headings = [];

    /* One Range, reused. `element.getClientRects()` is the obvious rendered test
     * and it is wrong in one direction: an element with `display: contents`
     * generates no box of its own while its text renders normally, so it reads as
     * hidden. A Range over the element's CONTENTS has the rectangles its children
     * actually occupy, which is `display: none` and `display: contents` answered
     * by one question instead of two. */
    const box = document.createRange();

    let skipped = 0;

    /* Every h1-h6 the walk passes, rendered or not. The rendered ones carry their
     * position in THIS count, not their position in the result -- an index into a
     * filtered list cannot be resolved again on the page. */
    let seenHeadings = 0;

    /* Yielding is the whole point. `await` inside the loop hands the main thread
     * back to the page between chunks, so the page stays interactive while this
     * runs (NFR-10, UX-DR31). `setTimeout` and not `scheduler.yield()`, which is
     * Chrome 129 and would raise this file's floor; and not
     * `requestAnimationFrame`, which stops firing in a background tab and would
     * hang the walk there rather than slow it. */
    const CHUNK = 2000;
    let visited = 0;

    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      visited += 1;
      if (visited % CHUNK === 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 0);
        });

        /* THE COST OF YIELDING, AND THE REASON THIS CHECK EXISTS. A TreeWalker
         * computes its traversal live from the node it is parked on. Hand the
         * main thread back and the page may remove the subtree that node is in --
         * an infinite-scroll feed recycling its container, an ad slot swapping its
         * DOM, a route change in a single-page application. On resume the
         * ancestor chain no longer reaches the root, `nextNode()` returns `null`,
         * and the loop ends NORMALLY with a short list that looks complete. That
         * is a wrong result with no error, and at 2000 elements per chunk a
         * multi-yield walk is the ordinary case rather than an edge. */
        if (!node.isConnected) {
          return {
            ok: false,
            message: 'The page changed while it was being read. Try again.',
          };
        }
      }

      const element = /** @type {Element} */ (node);

      /* What this walk cannot enter. `shadowRoot` is null for a closed root, so
       * this undercounts rather than overcounts -- a closed root is invisible to
       * every API a leaf has, and claiming otherwise would be worse than counting
       * low. Frames need a separate injection, which is a permission decision and
       * not a leaf's to make. */
      if (element.shadowRoot !== null || element.localName === 'iframe' || element.localName === 'frame') {
        skipped += 1;
      }

      /* `localName`, not `nodeName`. `nodeName` is upper-cased only for HTML
       * elements in an HTML document; in a document served as
       * `application/xhtml+xml` it is the qualified name as authored, so an
       * upper-case test matches nothing and the outline comes back empty. */
      if (!/^h[1-6]$/.test(element.localName)) {
        continue;
      }
      seenHeadings += 1;

      /* THE PITFALL: a walk that does not ask what is rendered collects headings
       * the page never shows. No rectangles anywhere in the element's CONTENTS
       * means no box anywhere in its ancestry -- and asking about the contents
       * rather than about the element is what keeps `display: contents`, which
       * generates no box of its own while its text renders, from reading as
       * hidden.
       *
       * THERE IS NO SEPARATE `visibility` CHECK, AND THERE WAS. It was deleted
       * once `innerText` replaced `textContent` below, because a control proved
       * it had stopped measuring anything: `innerText` is layout-aware and
       * already excludes content whose computed `visibility` is not `visible`.
       * The one case where the two differ -- a hidden heading holding a visible
       * span -- the explicit check got WRONG, dropping text the page shows. A
       * rule that measures nothing is worse than a missing one: it reads as
       * coverage. */
      box.selectNodeContents(element);
      if (box.getClientRects().length === 0) {
        continue;
      }

      /* `innerText`, not `textContent`. The two clauses above establish that this
       * heading is RENDERED, and `textContent` then ignores rendering entirely:
       * `<h2>Docs<span style="display:none">(draft)</span></h2>` reads back as
       * text the page does not show, and it would go into the row's `title` too.
       * `innerText` is layout-aware and says what is on screen.
       *
       * A heading whose rendered content is an image has no text at all, and
       * dropping it would remove a heading this code has just established is
       * rendered. Its accessible name is the next best answer and the page
       * already wrote one. A heading with neither names nothing and is dropped. */
      const heading = /** @type {HTMLElement} */ (element);
      const text = (heading.innerText ?? heading.textContent ?? '').replace(/\s+/g, ' ').trim()
        || (heading.getAttribute('aria-label') ?? '').trim()
        || (heading.querySelector('img[alt]')?.getAttribute('alt') ?? '').trim();
      if (text === '') {
        continue;
      }

      headings.push({ level: Number(heading.localName.charAt(1)), text, at: seenHeadings - 1 });
    }

    return { ok: true, headings, skipped };
  } catch (cause) {
    /* The message is what the caller shows, so it names what happened and what
     * would change it. The cause itself does not travel: it is page-side, it may
     * carry page content, and page content is one accident away from being a
     * secret -- which is the same reason `core/tabs.js` never logs a payload. */
    return {
      ok: false,
      message: `The page could not be read: ${cause instanceof Error ? cause.name : 'unknown error'}. Try again.`,
    };
  }
})();
