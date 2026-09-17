# Client correction record — C04

Short record of the pain, the client feedback and what changed after it. Fictional role-play context; all records are
synthetic exercise data.

## Pain heard from the client

> At the loading bay we need to record what actually arrived. Later, someone tries to reconcile the invoice. They
> cannot tell whether a difference was a shortage, a damaged item, a duplicate scan or a second delivery.

The starting question was *"what should the employee record at receipt so the next person can resolve the
difference?"*. The obvious reading is "build a smarter reconciliation engine that decides the difference".

## The correction

The client rejected that reading during the working session. Four corrections were agreed and are now reflected in the
prototype:

1. **The physical arrival is the starting fact, not the document.** The intake screen must be usable in seconds at the
   bay. Everything else — invoice comparison, shortage reasoning — happens later and can wait. → The first screen is
   now a receipt capture with received/damaged steppers and an auto-calculated accepted quantity; the invoice is not
   even linked yet.

2. **A scan is not a delivery.** The receiver often scans the same pallet twice. A second scan must never increase the
   received quantity. → The engine excludes repeated scans that carry no unique package identity, and the UI shows
   this as an *uncertain* state that asks the reviewer instead of guessing. Received quantity stays unchanged.

3. **Do not merge the three quantities.** Received, damaged and accepted must stay visible as separate numbers, and
   accepted must always be shown as the derived result. → Accepted is computed as `received − damaged` and displayed
   with its calculation, never stored as a supplied fact.

4. **The reviewer decides; the prototype never posts.** No stock movement, no accounting entry, no supplier message.
   The prototype proposes an explanation and a next action and records the human decision. → The reviewer decision
   panel offers approve / correct / unresolved, and every conclusion shows its source and calculation so the reviewer
   can disagree with evidence in hand.

A fifth correction came from the changed information itself: our first prototype treated the invoice difference as a
shortage. When the second consignment (RC-2) appeared, the same difference turned out to be a **staged delivery plus
one damaged unit**. The diagnosis is therefore written to keep "not arrived yet" and "short" as distinct possibilities
rather than collapsing them into one claim.

## What changed in the build

| Feedback | Change |
| --- | --- |
| Arrival first, documents later | Step 1 became the capture screen; evidence linking is a separate, deliberate reviewer action in step 2. |
| One scan ≠ one delivery | Added the repeated-scan uncertainty path; the received quantity is provably unchanged (test: `test_repeated_scan_without_identity_does_not_increase_received`). |
| Keep the quantities separate | Accepted is always `received − damaged` with the calculation displayed next to it. |
| Reviewer owns the decision | Added persisted approve / correct / unresolved decisions; the deterministic engine executes no external action. |
| Shortage vs staged delivery | The rule table orders the shortage rule before the damage rule and states explicitly that the two cases are indistinguishable with the linked evidence. |

## What is still an assumption

That the parts receiving lead will resolve the discrepancy on the evidence panel rather than in a mailbox thread, and
that one damaged unit is worth the reviewer's time to record at the bay. Both are the subject of the next real-case
validation described in `docs/wolf-handoff.md`.
