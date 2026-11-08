# Shared goals as goals: plan

8 November 2026. **Approved.** Batch 1 (steps 1–4) is built and on `main`
(5d94a26..09a1c27), waiting for review; batch 2 (steps 5–6) follows. See
"Built in batch 1" at the end.

Original plan text follows. Owner requests A (plain status text)
and B (a shared goal shows up and acts like a normal goal). Builder B's
`feat/ui-polish` touches `TodayPanel`, `SharedProgress` and the widget files and
merges first; this work starts from `main` after that merge.

## Decisions to confirm

1. **Today shows shared goals in their own "Shared" group**, below Must do /
   Should do / Nice to have, using the same list and row component. Shared
   goals have no priority, so they can't go into the priority groups without
   inventing one.
2. **Not every shared goal is due every day.** A gym goal of 3 days a week
   should not stop "Day closed. Every box ticked." on the other 4 days. Rule:
   - Fixed days (`every`, `days`): due on each scheduled day.
   - Weekly count (`n`, gym): due only when the days left in the round equal
     the days still needed. Otherwise the row says "Optional today" and counts
     towards the total only once ticked.
   - Weekly target already met: "Target met this week", counted only if ticked.
3. **Calendar future days:** the reviewer proposed none. The code says
   otherwise: `every` and `days` groups do have fixed days (`group.weekdays`).
   Proposal: show upcoming scheduled days of the current round for those
   groups, as open items that can't be ticked yet; no future days for `n`/gym.
4. **Widgets Tasks/Day: not in this change.** The shared widget export has
   scores but not your own check-in for today, and widgets can only toggle
   personal goals (`toggle_goal`). Adding them needs a new export field (a
   `version` bump in `packages/calendar/src/sharedProgress.ts`) and a new
   `shared_checkin` widget action handled in `lib/widgetActions.ts`. Proposed
   as a separate follow-up (step 7). The Progress widget stays the widget home
   for shared goals.
5. **Creating a shared goal from Today:** the right-hand card's "Do it with
   friends" start buttons go away with the card. Creation stays on Goals →
   Shared.

## A. Plain status text

Rule: on Today and in the Progress widget, show no round dates, zone or
confirmation time while things are normal. Show one plain line only when the
user has something to know or do. Deadline lines from `groupDeadlineText`
(local time, an earlier decision) stay.

| Where | Today | Proposed |
| --- | --- | --- |
| `apps/widgets/src/components/ProgressShared.tsx` `ProgressState` (Progress widget **and** Today card) | "Active round · 2026-11-07 · Asia/Riyadh"; other phases "Waiting/Paused/Archived/Current round unconfirmed · date · zone" | Nothing when active; otherwise only the plain reason below |
| same | "Round 2026-11-01 – 2026-11-07" / "Historical round …" | Remove |
| same | "No confirmed scored round. No ranks assigned." | "No scores yet." |
| same | "Confirmed 2026-11-07 17:49 UTC" / "Last confirmed …" / ": no score coverage" | Nothing when fresh. When stale: "Last updated 17:49" (local time, user's 12/24 h setting). No coverage: nothing |
| same | "Pending changes · " | "Not synced yet" |
| same, line 50, and `SharedProgress.tsx` line 223 | aria-label "Server-confirmed leaderboard" | "Leaderboard" |
| `apps/desktop/src/lib/sharedGoals/view.ts` `reason` (feeds Today, Goals cards, widget) | "Archived · read only" | "Archived" |
| same | "Not published" | "Draft" |
| same | "Starts 2026-11-08" (ISO date) | "Starts Sun 8 Nov" (`dateLabel`) |
| same | "Paused · waiting for an eligible boundary" | "Paused. It restarts at the start of a week with two people in." |
| same | "Waiting for two eligible members at a round boundary" | "Starts once two people have joined." |
| same | "Reconnect to confirm the current round" | "Connect to the internet to update this group." |
| `SharedProgress.tsx` `SharedRanking` empty | "No confirmed scored round. No ranks or zero scores are assigned." | "No scores yet." |
| `SharedProgress.tsx` `RoundPhase` (group page, Goals → Shared cards) | "Active round · 1 Nov – 7 Nov" | "This week · Sun 1 Nov – Sat 7 Nov" |
| same | "Current lifecycle unconfirmed" | "Can't confirm this week yet. Connect to update." |
| same | " · historical" | " (past week)" |
| `SharedProgress.tsx` `SharedOverview` footer | "Last confirmed: / Confirmed: <date time>" | Nothing when fresh; stale: "Last updated <time>" |
| same | "No round coverage" | Nothing |
| same | " · Pending changes; ranks remain server-confirmed" | " · Your check-in will sync soon." |
| same, line 374 | "No current eligible rank" | "Not ranked this week" |
| `SharedProgress.tsx` `PendingReview` note | "Checkmarks can be pending. Scores and ranks remain server-confirmed until sync." | "Scores update after your changes sync." |
| `SharedGoalDetail.tsx` line 200–201 | "Confirmed / Last confirmed <date time>", "No matching round coverage" | Same rule as the Overview footer |
| same, line 211 | "…Your eligibility starts at that boundary; earlier days are not missed." | "…You start that week; earlier days don't count against you." |
| same, line 251 | option "No confirmed scored rounds" | "No past weeks yet" |
| same, line 539 | "Confirmed history" | "Past week" |
| `SharedGoalJoin.tsx` line 239 | "…Your eligibility starts at the server-confirmed round boundary…" | "…You start with the next week…" |
| `SharedPeople.tsx` lines 264–265, `SharedGoalsPage.tsx` line 465 | "eligible at the next round boundary", "scoring starts only at a boundary…", "Rounds wait for at least two eligible members." | "People who join later start the next week." / "Scoring starts at the start of a week with two people in." |

The group page keeps its round dates: that is where the week's details belong.

## B. Shared goals as goals

### Data: derived, never stored

New pure module `apps/desktop/src/lib/sharedGoals/asGoals.ts`, built on
`sharedGroupView`. Nothing is written to the personal goals store or synced by
`PlannerSync`; every row is computed from the shared cache at render time.

- `sharedTodayItems(state, userId, now)` → one item per group you're in:
  `{ id: "shared:<groupId>", groupId, title, day (group date), due: "due" |
  "optional" | "met" | "none", done, state: null | "pending" | "failed" |
  "datedAhead", canCheck, weekDone, weekTarget, others (names), reason }`.
  `done` = `view.checked` (a queued check-in counts; a refused one falls back
  to the server row). `weekDone` = own server `completedDays`, plus 1 for a
  queued check-in today the server hasn't counted yet. `others` = active
  members except you; up to two names, then "+N".
- `sharedDayItems(state, userId, dateKey, now)` → calendar items for one day:
  ticked on past days with a completed check-in (or queued one); today as
  open or ticked; future scheduled days for fixed-day groups (decision 3).
- `sharedMineRows(state, userId, now)` → rows for Goals → Mine.
- `combineDay(plan, sharedItems)` → the Today counts (below).

### "N of M done today"

`M` = personal total from `planDay` + shared items with `due === "due"` + any
optional/met item that is ticked. `N` = personal done + ticked shared items
counted in `M`. A refused check-in counts as not done. The progress bar gets
one segment per counted item. Shared items never get the NEXT marker; the
"Next up" line stays personal (they have no time or priority).

### Rows: one component, two sources

- Extract the presentational part of `TodayPanel`'s `GoalRow` into
  `GoalRowView` (checkbox, title, subline, tags, trailing slot). The personal
  row wraps it with the bell and time. `SharedGoalRow` wraps it with:
  - subline "with Ana, Ben · 2 of 4 this week", plus "for Sun 8 Nov" when the
    group's day differs from your local day;
  - a visible "Shared" tag;
  - the title as a button that opens the group.
- The checkbox calls the check-in logic now inside `CheckinAction`, moved into
  a hook `useSharedCheckin(engine, groupId, now)`. It keeps the one-capture
  rule (capture `now` once, derive day and checked state from it) and the
  existing outbox. `CheckinAction` on the group page uses the same hook.
- States on the row: queued → "Not synced yet" next to the tag. Refused →
  "Not saved" with the `PendingReview` compact row underneath (Try again /
  Discard). Dated ahead → Discard only (existing `datedAhead`).
- Calendar: `DayGoal` becomes a union, personal or shared, both carrying
  `id`, `title`, `done` and `at`. The views read only `goal.id` and
  `goal.title` today (Agenda, Day, Week, Month and the Diary context). Each
  view's direct `updateGoal(…toggledOn…)` call goes through one
  `toggleDayItem(item, key)`: personal as now; shared today → check-in; shared
  past or future → open the group.

### Screens

| Screen | Change |
| --- | --- |
| Today (`TodayPanel.tsx`) | "Shared" group after the priority groups; counts from `combineDay`; remove `TodaySharedPanel` and its group picker preference `facta.progress.today`; the aside keeps Today's events |
| Goals → Mine (`goalsMine.ts`, `GoalsPage.tsx`) | Each group as a "Daily and recurring" row with the Shared tag and its status ("Starts Sun 8 Nov", "Paused", "Archived"); a Today row when due or optional; Done rows for this week's check-ins. Click opens the group, never the personal edit dialog |
| Calendar (Agenda, Day, Week, Month) and Diary context | Items from `sharedDayItems`; Month cell counts include them |
| Group page, Goals → Shared, Progress widget | Ranking stays here; wording from part A |
| Widgets Tasks/Day | Unchanged (decision 4) |

### Edge cases

- **Offline:** ticking queues in the outbox as now; the row shows "Not synced
  yet" and counts as done; it syncs later. A later refusal turns the row into
  "Not saved" and the count drops.
- **Round not started, paused, waiting, unconfirmed:** no Today or calendar
  item for today; Mine shows the plain status. Past ticks stay on the calendar.
- **Round ended / archived:** no Today row; Mine shows "Archived"; past ticks
  stay while they are in the cache (about 8 weeks back).
- **Left the group:** the membership is gone, so the group disappears
  everywhere, including past calendar ticks (the cache purges it on leave).
  Accepted; the group page history is gone too.
- **Rest day (`days` groups):** not due; no Today row.
- **Midnight:** shared items use the group's date (`view.today`), personal ones
  the local date. Each counts on its own "today". A shared row shows "for <day>"
  when the two differ, and the calendar puts a check-in on its group date.
  Rows are recomputed from `useNow` (minute tick) rather than `Date.now()` at
  render, which also fixes the 2c832c1 nit about the not-saved row across
  midnight.

### Accessibility

- Checkbox: `role="checkbox"`, `aria-checked`, label "Check in: Gym" / "Undo
  check-in: Gym".
- `aria-describedby` points to the visible state ("Not synced yet",
  "Not saved").
- The Shared tag is visible text, not only an icon.
- The title button says "Open group Gym".
- Calendar labels: "Gym, shared goal, checked in, Sun 8 Nov"; Month cell
  labels count shared goals.
- Agenda keyboard: Enter/Space checks in today, opens the group on other days.

### Tests

- **Unit** (`asGoals.test.ts`):
  - due rules for `every` / `days` / `n` / gym, rest day, target met;
  - queued, refused and dated-ahead states;
  - `weekDone` with a queued check-in;
  - names list;
  - group day ≠ local day;
  - waiting, paused, archived and left all give no Today item;
  - past ticks and future fixed days in `sharedDayItems`;
  - `combineDay` maths;
  - a shared tick leaves the personal goals store unchanged.
- **Other unit tests:** `goalsMine` shared rows; `DayGoal` union through
  `toggleDayItem`; the part A reason strings; projection `reason`.
- **Browser:**
  - Move `--checkin-skew` and `--ui` selectors from
    `[data-progress-surface="today"] .shared-check-action` to the Today row,
    keeping every existing assertion (held-read label, one size, clock-skew
    Try again).
  - New checks in `--ui`:
    - tick, untick and the count, online and offline;
    - "Not saved" row with Try again and Discard;
    - calendar tick today and on a past day;
    - Mine Shared tag opens the group;
    - no round, zone or UTC text on Today or in the Progress widget;
    - screenshots in both themes.
  - `--deadlines`: Riyadh and Los Angeles viewers near group midnight
    ("for <day>" subline, item on the right calendar day).
- **Required checks** as usual; install and the owner's hand-check at the end.

### Steps and rough size

| Step | What | Size |
| --- | --- | --- |
| 0 | Rebase on `main` after `feat/ui-polish` merges | small |
| 1 | Part A wording (desktop, widget, reason strings) + test updates | S, ~150 lines |
| 2 | `asGoals.ts` + `combineDay` + unit tests | M, ~300 lines incl. tests |
| 3 | `GoalRowView` extraction, `useSharedCheckin`, `SharedGoalRow` | M, ~250 lines |
| 4 | Today: Shared group, counts, remove the card; browser selectors | M, ~200 lines + suite edits |
| 5 | Goals → Mine rows | S–M, ~150 lines |
| 6 | Calendar/agenda/Diary `DayGoal` union + `toggleDayItem` | M, ~250 lines |
| 7 (later, optional) | Widgets Tasks/Day: export field + `shared_checkin` action | M–L, both apps installed together |

Each step is its own commit and can be reviewed alone; steps 1 and 2 don't
depend on each other.

## Verification of 67289fc (`prepare-shared-native.mjs` key line)

- `prepare-native-auth-fixture.mjs --verify-boundaries` does not load
  `prepare-shared-native.mjs`, so it cannot cover that line. It was also not
  run: Docker Desktop was not running on 8 November (engine pipe missing). It
  will run as asked the next time Docker is up.
- **Direct check, run 8 November:** `node scripts/prepare-shared-native.mjs
  http://127.0.0.1:56421 --real-auth` exit 0 (built 09:58). The built test app
  contains the local stack's publishable key in 1 file and its anon JWT in
  none, so the new `define` is applied. The native app itself was not launched
  (needs Docker).

## Built in batch 1 (8 November 2026)

Steps 1–4 as planned, with these differences:

- **Status lines** live in `@facta/calendar` (`progressStatusLines`,
  `lastUpdatedText`) so the Progress widget and the desktop share them, with
  their own tests (run in two zones).
- **Item shape:** refused check-ins are carried as `failed` on the item and shown
  with the existing compact Try again / Discard panel, which already handles the
  dated-ahead Discard-only case; there is no separate `datedAhead` state.
- **Deadlines on Today:** a row for a group in another zone shows the check-in
  close and week end in the viewer's clock (the earlier decision), under the
  week count. A viewer in the group's zone sees none.
- **Subline wording:** an optional row adds "optional today" and a met one
  "target met this week" (fixed after the batch 1 review).
- **Next up:** when no personal goal is next, "Next up" names the first unticked
  shared goal that counts today (accepted in review).
- **Header count:** the Shared group header says how many shared goals are
  ticked of those listed; the big "N of M" uses `combineDay`.
- **Test page:** the `--ui` page mounts the same `TodaySharedSection`, capturing
  check-ins on its live action clock like the app's `Date.now`.
- **Suite changes:** Today no longer shows ranks, so the Today-side rank
  comparisons became checks on the row's "x of y this week" and on the date the
  check-in is saved for; the Gym/Custom launcher checks were removed with the
  launchers. `--ui` is 232 assertions (was 248) as a result; `--step6` is 569
  (one check split in two).
