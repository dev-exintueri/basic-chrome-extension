// @ts-check
/**
 * @tier required
 * @chrome-min baseline
 * @permissions none
 * @pitfall An unfiltered walk collects headings inside elements the page never renders.
 * @alternative checkVisibility() -- it is Chrome 105 and would raise this leaf above baseline.
 * @scales-to Headings arrive after load -> a MutationObserver, which a leaf may not hold.
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
 *   { ok: true,  headings: [ { level: 1..6, text: '...' }, ... ] }
 *   { ok: false, message: '...' }
 *
 * Both are plain JSON. The value crosses a JSON boundary on its way back: a Map,
 * a Set, a Date and a DOM node all arrive as `{}` and a circular reference has
 * its cycle replaced by `null`, with nothing raised. A number and a string
 * survive, which is the whole reason a row carries `level` rather than its
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
     * reviewer looks for and does not find a line for. */
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT);

    /** @type {{ level: number, text: string }[]} */
    const headings = [];

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
      }

      if (!/^H[1-6]$/.test(node.nodeName)) {
        continue;
      }

      const heading = /** @type {Element} */ (node);

      /* THE PITFALL, AND WHY THE TEST IS TWO CLAUSES RATHER THAN ONE.
       *
       * `getComputedStyle(heading).display === 'none'` is the obvious test and it
       * is wrong. For an element inside a `display: none` subtree the computed
       * `display` is that element's OWN value -- `block` for a heading -- not
       * `none`. The ancestor is where the box was lost and the descendant's
       * computed style does not say so. `getClientRects()` does: an element that
       * generates no box anywhere in its ancestry has no rectangles.
       *
       * That first clause misses `visibility: hidden`, which still generates a
       * box. `visibility` is inherited, so the heading's own computed value
       * already reports an ancestor's choice, and one property read closes it. */
      if (heading.getClientRects().length === 0) {
        continue;
      }
      if (getComputedStyle(heading).visibility !== 'visible') {
        continue;
      }

      /* Collapse runs of whitespace: markup indentation is not part of the
       * heading, and a row rendering " Getting   started " carries a wrong value
       * in its `title` as well as on screen. A heading whose text is only
       * whitespace names nothing and is dropped. */
      const text = (heading.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text === '') {
        continue;
      }

      headings.push({ level: Number(heading.nodeName.charAt(1)), text });
    }

    return { ok: true, headings };
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
