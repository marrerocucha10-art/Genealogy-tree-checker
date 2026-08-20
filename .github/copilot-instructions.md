# Working agreement for this repository

Read this before touching anything. These rules were set by the owner and are
not optional. They exist because each one was broken at least once.

## How to work here

1. **Never guess.** Verify by running the code and clicking through the screen
   before you say anything works. "It should work" is not an answer.
2. **Verify before you send a link.** Walk the actual flow on the deployed site
   yourself — upload, tree preview, error list — and only then hand over a URL.
3. **Post a refreshed test link after every change, without being asked.**
4. **Never make the customer re-upload or re-load their tree.** Continue the
   flow from wherever they clicked. Re-asking for the GEDCOM is a regression.
5. **No blank pages, anywhere.** Every render path has a recovery panel and a
   never-blank guard. If a screen can throw, it must still show something
   readable that says what happened and how to continue.
6. **Do not change shipped behaviour that was not asked about.** See "Locked
   work" below. Build on top of it. No refactors, cleanups, or reverts of it.
7. **Keep it simple.** No new gates, abstractions, config, or ceremony that was
   not requested.
8. **Never run destructive git commands** (reset --hard, force push, branch
   deletion) without explicit permission.
9. **Do not write test data into a shared browser and leave it there.** Clean up
   any storage you seed, in the same session, every time.
10. **Ask at most one focused question**, and only when the answer genuinely
    changes the implementation.

## The customer flow — do not reorder it

    upload GEDCOM
      -> parse result, which names any possible duplicates and says to
         combine those first
      -> five-generation working tree preview
      -> "Continue to Fix Errors"
      -> guided error workspace

Never skip the tree preview. Never jump straight from upload to the error list.

**Duplicates come first.** A duplicate splits one person's life across two
records, so it is surfaced at parse time and reviewed before other errors.

**Every error must show four things**: what the error is, why it matters in
plain language, how to fix it, and buttons — automatic fix when one is safe,
manual fix, and mark solved.

## Writing for the customer

- Plain, calm, everyday English. Explain the consequence, not the mechanism.
- Sans-serif only. **No cursive or script fonts, ever.**
- No jargon, no error codes, no stack traces shown to a customer.

## Locked work — frozen unless specifically requested

1. **Typography** — sans-serif everywhere. `public/styles.css`.
2. **Administration review is open by default** — with no passphrase configured
   the gate returns `{configured:false, active:true}` and fails open on any
   error or unreachable API, so static hosting keeps working.
   `server.js`, `public/admin-review-gate.js`, `public/admin.js`.
3. **Passphrase normalization** — lowercase, strip non-alphanumerics and
   zero-width characters on both sides, plus the `pageshow` bfcache re-check.
4. **Administration review tree seeding** — administration review copies the
   already-loaded tree into its own storage key rather than asking for the
   GEDCOM again, and the error workspace falls back to the full tree when the
   five-generation subset is missing.
5. **Store buttons** — the customer store shows only the three real checkout
   buttons. The no-charge review buttons appear **only** with
   `?admin_review=true`. They are not missing when you don't see them.
   `public/store.js`.
6. **Guided error review shape** — grouped by generation, limited to the first
   five generations, with preview, manual fix, mark solved, record source, and
   save for later. `public/errors.js`.

## Technical notes that save hours

- **Storage keys**: `errors.js` reads `${TREE_STORAGE_KEY}:fiveGenerationReview`
  and only `tree.js` writes it. Administration mode swaps `familyTreeData` for
  `familyTreeAdministrationReviewData` across all keys.
- **Cache tags**: every page loads its script with a `?v=` tag. Bump the tag in
  the HTML whenever you change that script, or the deploy will serve the old
  file. These tags conflict on every merge from `main` because the repo uses
  squash merges — resolve with `git checkout --ours` on the HTML files.
- **Pushing**: `git push` with no refspec silently does nothing here. Always
  `git push origin HEAD:<branch>`.
- **`npm test` is `node --check` only.** It proves the file parses. It proves
  nothing about behaviour, so it never substitutes for clicking through.
- **`/index.html` redirects to `/store#subscriptions`** unless a plan is
  selected in localStorage. An empty browser looks broken but is not.
