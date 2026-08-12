# AGENTS.md

Working rules for any agent operating in this repository.

> **Note for story 3.8.** AR-21 gives this path a second job: the repository
> conventions and every runnable command, verbatim. That inventory belongs in
> this file alongside the rules below — do not create a second root `AGENTS.md`,
> and do not move these rules out to make room for it.

## Handing over when work completes

**"Work complete" means a story — or an independent unit of work — reaches
`done`.** Intermediate pipeline steps are not completion: an implementation
commit, a review, a fix commit. Producing a handover at each of those would
contradict the pipeline rule that says not to stop between them.

On completion, when work remains, write a handover **on the assumption that the
next session knows nothing about this one**. Show it, and write the same content
to `_bmad-output/NEXT-SESSION.md`; a prompt that exists only in a closed session
does not exist.

The handover carries five things:

1. **Repository state** — branch, HEAD, position against origin and whether it
   is pushed, unmerged branches, working-tree state.
2. **The next task and where it starts** — story number, file path, current
   status.
3. **What the next task must know** — open questions it is the first consumer
   of, requirements an earlier story handed to it explicitly, and traps an
   earlier story paid to discover.
4. **How to verify** — the commands to run, and for each one, what it does
   **not** measure. "It loads" is not "it parsed"; a clean type-check with no
   control run is not evidence.
5. **What is out of bounds** — files outside the task's scope, and actions that
   need separate approval (push, merge).

**The test: if a fresh session cannot start from the handover alone, it is
incomplete.** A line naming the next story number does not satisfy this rule.

## Amending DESIGN.md and EXPERIENCE.md

Both carry `status: final`, and both may still be revised **until story 7.5 tags
a release**. That is the boundary because 7.5 is the point at which every claim
has been proven and the documents stop being working drafts and start being the
contract a consumer reads. Before it, a rule that measurement contradicts is a
defect in the rule.

Four constraints on the amendment:

- **Measurement, not preference.** Amend a rule because something demonstrated
  it wrong, and say in the commit message what was measured. A rule that is
  merely inconvenient to implement is a rule the implementation should satisfy.
- **Its own commit.** Never fold a document amendment into a story commit —
  the story commit says what was built, the amendment says what the repository
  now believes. Stories 1.6, 1.7 and 1.9 all landed theirs separately.
- **Precedence is unchanged.** The PRD outranks `DESIGN.md`, which outranks
  `EXPERIENCE.md`. This rule grants no permission over the PRD: an amendment
  that would contradict it is a product decision, not a documentation fix. Where
  `DESIGN.md` and `EXPERIENCE.md` disagree, `DESIGN.md` wins and `EXPERIENCE.md`
  is the defect.
- **Nothing else is covered.** `ARCHITECTURE-SPINE.md` and the PRD are outside
  this rule and still need approval — story 1.8 Q1 found an error in the spine's
  floor-audit table and correctly left it standing.

When an amendment lands, update every planning artifact that restates the same
rule. `requirements-inventory.md` summarises `DESIGN.md`, and a summary that
outlives its source is how a later story inherits a rule nobody holds any more.
