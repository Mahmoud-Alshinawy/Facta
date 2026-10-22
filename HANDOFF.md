# Handoff: feat/ui-redesign (branch 1 of 3), work in progress

## Review fixes (22 October 2026)
- All seven requested review fixes are implemented as separate commits.
- Fix 7: removed the generated android/ and ios/ subfolders under both native
  icon directories (70 files). Root desktop icon assets are retained.
- Fix 7 checks passed: frozen install; npx tsc x3; desktop Vitest 269/269,
  calendar 152/152; required desktop build; both cargo check --offline.
  Verified all four mobile folders and preview build artifacts are absent.
  Existing Vite chunk-size warning only. TodayPanel remains unchanged.
- Fix 6: overdue unfinished one-offs carry an Overdue sub-label in Goals Mine
  List and Board. Their original date and Today section membership remain;
  Done today still counts today's scheduled occurrences only. Added a mapper
  test excluding current/future goals, completed history and recurring rows.
- Browser verified List at 1280 and Board at 1100 with one due-today and one
  overdue goal; Today 2, Done today 0 of 1, and only the overdue row labelled.
  Light theme uses the warning token. Final Calendar audit: 16 view/width
  combinations (1440/1280/1210/1100), no wrapping/overflow. Preview closed,
  viewport reset, server stopped and fixtures removed before build.
- Fix 6 checks passed: frozen install; npx tsc x3; desktop Vitest 269/269,
  calendar 152/152; required desktop build; both cargo check --offline.
  Existing Vite chunk-size warning only.
- Fix 5: Week quick-add measures the popover and visible grid below its sticky
  header, flips above the selected range when needed, and clamps on scroll or
  resize. Its footer buttons wrap instead of compressing out of view. Added
  four pure placement tests (including 15:00–17:00 and changed viewport bounds).
- Browser pointer drag at 1280x720 selected 15:00–17:00: popover flipped above,
  all three action buttons stayed inside it and above the page footer. Resize
  to 1210x600 also stayed within the grid; Escape restored grid focus; no console
  errors. Disposable local fixture only, Supabase disabled.
- Fix 5 checks passed: frozen install; npx tsc x3; desktop Vitest 268/268,
  calendar 152/152; required desktop build; both cargo check --offline.
  Fixtures removed before build. Existing Vite chunk-size warning only.
- Fix 4: Calendar's 1201–1440px toolbar stays on one row with a flexible
  quick-add field. New event is icon-only at 1201–1320px, retaining its name,
  tooltip and shortcut. Browser checked all four views at 1440/1280/1210/1100;
  visually inspected Week at every width (720px height). Header stayed 79px
  high with no document overflow. Today styling is unchanged.
- Fix 4 checks passed: frozen install; npx tsc x3; desktop Vitest 264/264,
  calendar 152/152; required desktop build; both cargo check --offline.
  Temporary isolated fixtures removed before build; existing chunk warning.
- Fix 3: enabled untimed reminders are due at local midnight. Overdue one-offs
  remain due; repeats still respect schedules, completion and sent-day state.
  Added midnight/overdue/repeating tests in both Riyadh and New York projects.
- Fix 3 checks passed: frozen install; npx tsc x3; desktop Vitest 264/264,
  calendar 152/152; required desktop build; both cargo check --offline.
  Existing Vite chunk-size warning only.
- Fix 2: both native apps read HKCU SystemUsesLightTheme through RegGetValueW
  at tray startup and on ThemeChanged: dark taskbar uses white, light uses
  black. Window/app theme fallback is compiled only outside Windows. No new
  dependencies. This host's registry value is 0; live theme switching was not
  exercised in this revision.
- Fix 2 checks passed: frozen install; npx tsc x3; desktop Vitest 260/260,
  calendar 152/152; desktop build with required env; cargo check --offline
  in both apps on Windows. Existing Vite chunk-size warning only.
- Owner reports checks and native Windows testing passed for 0ad41a8.
- Fix 1: sign-out falls back to local scope after remote failure; the hook
  clears its user after either successful path. Only local failure propagates.
  Three mocked-client tests cover fallback, double failure and remote success.
- Fix 1 checks passed: frozen install; all three npx tsc checks; desktop
  Vitest 260/260, calendar 152/152; desktop build (PORT=1420 BASE_PATH=/);
  both cargo check --offline. Existing Vite chunk-size warning only.

Design source: Claude Design canvas v97 (artifact 76b58a8f-…). Boards render
locally: copy `artifact-type/dc-runtime.js` to `project/support.js`, serve
`project/` and open `<Board>.dc.html` (or a wrapper with
`<dc-import name="CalWeek" theme="bg" state="drag">`).

State: steps 1, 2a, 2b, 3, 4, 5 and 6 are implemented and checked. App uses the new Sidebar; Today is its
own page with no calendar view switcher. CalendarPage mounts the four new
views; legacy calendar views/CSS are deleted. TodayPanel.tsx is unchanged.
GoalDialog and EventDialog now use the v2 layout and shared dialog behaviour.
Goals Mine is mounted with live statistics, List/Board and quick add. Core browser visual QA is recorded below.
Settings mounts Widgets / Appearance / Account. MiniCalendar, icons and tray are implemented.
Core four-theme / two-width browser inspection is complete; native smoke checks remain.
See docs/ui-redesign-review.md for exact coverage, corrections and remaining owner checks.

## Current owner instructions (approved 21 October 2026)
- Rail breakpoint is <=1200px; 1100px is a comparison width.
- Keep TodayPanel's approved visual styling; change only navigation/container needs.
- Branch 1 only: no Notes/Diary widget types, schema changes or shared-goal implementation.
- Reuse the native tasklist companion check for Settings status.
- Weekly completion counts completed / scheduled occurrences for the current
  preference-defined week. Streak counts consecutive days with at least one
  completion; an unfinished today does not break yesterday's run. Best is the
  longest historical run. One-offs count on their own date when completed;
  repeats use completedDates. Test both and week-start/boundary variants.
- Each finished step: all required checks, HANDOFF update in the same commit,
  commit as Mahmoud Alshinawy <2270009032@iau.edu.sa>, push, then hash + three-line report.

## Step 1 verification (Windows, 21 October 2026)
- Passed: pnpm install --frozen-lockfile; npx tsc --noEmit in desktop, widgets
  and calendar; Vitest desktop 191/191 and calendar 152/152; desktop Vite build
  with PORT=1420 and BASE_PATH=/; cargo check --offline in both src-tauri folders.
- Native prerequisites exist. Cargo only warned about incremental-cache hard
  links (used copies); Vite warned about the existing >500 kB JavaScript chunk.
- Added fx-app.css hand rules, control/resize styles, empty-card drag
  passthrough and scrolling dialog shell. Imported both fx stylesheets.
  Replaced literal black shadows in the port with shared --shadow-ink.
- No browser/board or real-window verification yet; the shell is not mounted.

## Step 2a verification (Windows, 21 October 2026)
- Rewrote App shell/navigation while retaining auth callbacks, widget-action
  processing/export, search and dialogs. New sidebar on all sections; Today
  is independent, Calendar offers Day/Week/Month/Agenda. Notes/Diary stay hidden.
- Extracted sidebar navigation logic into shell/navigation.ts and added five
  tests for the 1200px boundary, manual overrides, resizing and hidden pages.
- Passed frozen install; npx tsc --noEmit in desktop/widgets/calendar; desktop
  Vitest 196/196, calendar 152/152; desktop build (PORT=1420 BASE_PATH=/);
  cargo check --offline in both apps. Same non-fatal build/cache warnings.
- Visually checked Today and Calendar navigation in Brave with local-only
  fixture auth, Supabase config explicitly disabled in the preview process;
  observed automatic narrow rail and full wide sidebar. TodayPanel unchanged.
- In-app browser cannot reach localhost; native Windows browser works.
  Formal board comparison and exact 1440/1100 captures remain for 2b/final QA.
- Calendar's legacy toolbar/now line remain temporarily and are removed in 2b.

## Step 2b verification (Windows, 21 October 2026)
- CalendarPage connects the header, four views, hidden-by-default mini calendar,
  footer and scoped 1-4/N/G/Q/T/PgUp/PgDn/[ shortcuts; App handles ? and search.
  Q reveals quick add at narrow widths. The mini calendar overlays at <=1200px.
- Header quick add saves complete lines and forwards incomplete EventDrafts;
  the current dialog accepts title/allDay/colour plus initialEndTime. The v2
  dialog rewrite is still next. Six new tests cover period navigation,
  week-start headings and quick-add mapping/end-of-day bounds.
- Deleted the four top-level legacy calendar views and their CSS. Removed
  unused now-line/dot CSS from fx.css; Week/Day render gutter pills only.
- Fixed a mounted Week flex minimum-height bug found in Brave: the grid now
  scrolls within the window, the footer remains visible and initial scroll works.
- Passed frozen install; npx tsc --noEmit x3; Vitest desktop 202/202 and calendar
  152/152; desktop Vite build (PORT=1420 BASE_PATH=/); cargo check --offline x2.
  Same non-fatal Vite chunk-size and Cargo cache hard-link warnings.
- Local fixture browser smoke: Today/Calendar switching, Day/Week keys, overlap
  layout, all-day spanning, gutter-only time pill, visible focus and footer.
  Formal hosted-board comparison at exact 1440/1100 and native-window QA remain.

## Done (tested)
- Final comparison (22 October 2026): Calendar's four views, Goals Mine list and
  Settings Appearance inspected in all four themes at 1440x920 and 1100x920.
  Hosted Week/Day/Month/Agenda/Goals/Settings references compared in Fit mode.
  Dialogs, Board and widget previews had additional sampled checks; coverage
  is listed in docs/ui-redesign-review.md, not a claim of testing all 431 boards.
- Fixed Agenda rows inheriting Week absolute positioning, rail width (now 64px),
  Board metadata size, clipped native AM/PM time fields, preview Shapes wallpaper
  and widget presentation. Wallpaper colours are shared tokens. Sidebar swatches
  now use theme tokens too. No new dependencies or native changes in this step.
- Empty-data checks found Week/Day empty cards scrolled above the viewport;
  cards now sit outside scrollers, hide during slot creation/details and keep
  pointer passthrough. Browser hit testing reached the underlying Week column;
  text is non-selectable and buttons retain pointer events.
- Fixed focus loss on keyed date/view remounts; consecutive day arrows, switching
  to Month and PgDn retain grid focus. Also exercised mini-calendar's one tab
  stop/arrows/Enter, Week Enter/Shift+Down/Enter range creation, narrow Q and
  quick-add draft forwarding, Ctrl+K while typing, inline goal parsing/X completion,
  prefs propagation, dialog blocked submits/reset/save/edit/Escape/focus return,
  widget create/hide and confirmation cancellation. Final console error log empty.
- Browser verification used disposable fixture sessions with Supabase config
  blanked. Fixtures removed and preview stopped before final builds. No live
  Supabase access, schema edits or TodayPanel changes. Native runtime, pointer
  drag/resize and exhaustive board-state checks remain explicitly unverified.
- Final step checks passed: pnpm install --frozen-lockfile; npx tsc --noEmit in
  desktop/widgets/calendar; Vitest desktop 257/257 and calendar 152/152; desktop
  build PORT=1420 BASE_PATH=/ and widgets build; cargo check --offline in both
  src-tauri folders. Windows prerequisites were available. Only the existing
  >500 kB desktop bundle warning remains. Temporary fixtures are absent from dist.
- Step 6 (22 October 2026): MiniCalendar reuses the dialog date grid. One
  tabbable date; arrows, Home/End and PgUp/PgDn move, Enter/Space select.
  Previous/next month controls have the equivalent PgUp/PgDn keys. Date
  navigation has six pure tests for year/month/leap boundaries and all three
  week starts. Recurring-event dots reuse the existing event-date selector.
  Opening [ focuses the grid; closing restores focus. Mini panel scrolls.
- Keyboard audit: Week day headers, all-day spans, untimed/timed goal checkboxes,
  more controls and each overlapping event are reachable. Day events and timed
  checkboxes are reachable too. Ctrl/Cmd+K now works while typing. Month/Agenda
  retain their grid/list keyboard paths. Empty-card drag passthrough CSS reviewed;
  pointer/keyboard smoke remains unverified in a running app.
- Regenerated both src-tauri/icons sets with the local Tauri CLI from
  apps/desktop/public/icon.png, including default platform outputs. Both trays
  embed public/tray-white.png / tray-black.png via Tauri's existing include_image
  macro, select by native system theme and update on ThemeChanged. No new
  dependencies/features. Native tray appearance/theme switching is not verified.
- Step 6 passed frozen install; npx tsc --noEmit x3; desktop Vitest 257/257,
  calendar 152/152; desktop build PORT=1420 BASE_PATH=/; widgets Vite build;
  cargo check --offline in both native folders. Existing Vite size warning only.
  TodayPanel.tsx remains identical to b449d97. No live Supabase access.
- Step 5 (22 October 2026): Settings tabs with arrow/Home/End navigation;
  Widgets companion status + Launch, saved widget list, enable/remove, new-widget
  type/theme/transparency/live-data preview, inline Reset all confirmation;
  Appearance theme cards, week start/time format/weekend; Account email and
  inline sign-out confirmation. Failed sign-out preserves the signed-in state.
- Companion status and Launch share the existing native tasklist/pgrep check,
  extracted as widget_app_running. Existing config JSON/native dayview name and
  legacy defaults retained; no Notes/Diary types. Four pure compatibility tests.
- Step 5 passed: frozen install, npx tsc --noEmit in all three packages,
  desktop Vitest 251/251, calendar 152/152, desktop Vite build (PORT=1420,
  BASE_PATH=/), cargo check --offline in both apps. After the laptop restart,
  sandbox access prevented initial checks from starting; retries with access to
  installed toolchains passed. Existing Vite chunk/cache-link warnings remain.
- Settings source reviewed against Settings.dc.html. Visual comparison and
  native companion launch/status smoke were NOT performed; computer control
  remains stopped. No new dependencies, schema edits or live Supabase access.
- Step 4: GoalsPage + GoalOverview replace GoalsPanel. Mine/Shared (coming soon),
  weekly ring/day badges, current/best streak, done today, next up, priority filter,
  Time/Priority/A-Z sort, List/Board, recurring rules, collapsed Done, inline
  parseQuickGoal, edit dialog and keyboard arrows/J/K/Home/End/X/E/Enter/N.
- goalStats follows the owner's occurrence/week-start/history definitions.
  New pure stats/mapping/reminder tests run in Riyadh and (stats) New York,
  including year/week boundaries, all week starts, one-off history, duplicates,
  recurring schedules, unfinished-today grace, best history, future dates and DST.
- Upcoming includes all future one-off goals, with a "Scheduled" note rather
  than the sample's "Next 2 weeks", so distant newly created goals stay reachable.
- Reminders use the same tested pending-state predicate for bells and delivery;
  completed historical rows never show today's unsent bell. Notification loop
  moved to App so it survives page changes. Permission is requested only from
  the user's explicit reminder-switch click; failed notifications remain unsent.
- Step 4 checks: frozen install, tsc x3, desktop Vitest 247/247, calendar 152/152,
  desktop Vite build PORT=1420 BASE_PATH=/, cargo check --offline x2 passed.
  No dependencies added; TodayPanel untouched; no live Supabase access.
- Step 4 visual check was stopped by physical Escape before inspection.
  Do not claim Goals visual QA passed. Computer Use must remain stopped for
  that turn; final board/theme/width and native smoke checks are still outstanding.
- Step 3: GoalDialog-v2 and two-pane EventDialog New/Edit. Fresh form state on
  every opening; title autofocus; Enter saves (Shift+Enter allows a description
  newline); Escape backs out of delete confirmation before closing; Tab trap
  and focus restoration; blocked-submit live message; scrolling body/fixed footer.
  Reminder is unavailable without a time; custom repeats require a day.
  initialEndTime and title/allDay/colour drafts are preserved. Event deletion
  keeps the existing delayed Undo flow after inline confirmation.
- Shared dialogs/DatePickerGrid supports arrows, Home/End, PgUp/PgDn and Enter
  with one tabbable day; uses week-start preferences. Reuse for MiniCalendar next.
- Added theme tokens for dialog scrim/shadow, danger text and swatch checks from
  EventDialog's four themes; no literal colours in the new dialog components.
- Step 3 checks: frozen install, tsc x3, Vitest desktop 209/209 and calendar
  152/152, desktop build PORT=1420 BASE_PATH=/, cargo check --offline x2 passed.
  Seven new pure form-state/validation tests. Existing non-fatal warnings only.
- Step 3 local browser checks: Goal/Event layouts, title autofocus, blocked
  submit, disabled reminder explanation, Escape close, backward Tab wrapping,
  Edit event and its inline delete confirmation. Live Supabase remained disabled.
  Exact board/theme/width comparison still remains for final QA.
- `packages/calendar/src/theme-tokens.css`: `--event-red/green/orange/pink` as
  real tokens in all four themes (values from the boards). `apps/desktop/src/lib/eventColors.ts`
  and the Day widget now use `var(--event-*)` (Tailwind fallbacks gone).
- Day widget: now line and dot removed; only the gutter pill remains
  (`apps/widgets/src/components/DayViewWidget.tsx`, `apps/widgets/src/index.css`).
- `packages/calendar/src/quickParse.ts` (+ test): `parseQuickEvent`
  ("Lunch with Alex Fri 1pm": day words, next weekday, in N days, 24 Oct /
  Oct 24 / 24/10 (day first) / ISO, am/pm, 24h, noon, "at 7", ranges,
  "for 90 min", all day) and `parseQuickGoal` ("Gym daily 18:00 !must":
  !must/!should/!nice or !1-3, daily/weekdays/weekly/"every mon, wed").
  `complete: false` = open the full dialog pre-filled.
- `packages/calendar/src/spans.ts` (+ test): all-day lanes (`spanLanes`),
  15-minute `moveBlock`/`resizeBlock`/`snap`, `conflicts`, `monthChips`.
- `apps/desktop/src/lib/calendarData.ts` (+ test): goals/events per day,
  per-day ticks, `allDaySpans` (joins consecutive days, detects carry-over).
- `apps/desktop/src/lib/focusTrap.ts` (+ test) and `hooks/useDialogFocus.ts`
  (autofocus `[data-autofocus]`, trap Tab, restore focus to opener).
- `lib/theme.ts` broadcasts `facta-theme`; `hooks/useTheme.ts`.

## Mounted redesign components
- `apps/desktop/src/styles/fx.css`: board CSS ported and scoped under `.fx`
  (dialogs under `.fx .dlg`), in `@layer components`. Generated by a script
  (scratchpad `portcss.py`, not in repo); `--muted`→`--subtle`,
  `--text-rgb` etc. → `color-mix()`. Imported with `fx-app.css` hand rules
  (step 1 complete); still needs visual verification once mounted.
- `components/shell/`: `Icons.tsx`, `Sidebar.tsx` (Today/Calendar/Goals/Settings,
  Notes and Diary hidden via `HIDDEN_SECTIONS`; rail ≤1200px via `sb-c`/`sb-o`),
  `Shortcuts.tsx` (cheat sheet rows from CW-cheat board, footer hint bars).
- `components/calendar/`: `CalendarHeader.tsx` (toolbar, quick add input,
  Day/Week/Month/Agenda seg, New event), `WeekView.tsx` (band, goals row,
  overlap columns, conflict marker, drag create → quick-add popover, drag
  move/resize 15 min, Esc cancels, keyboard grid), `DayView.tsx`,
  `MonthView.tsx` (bars, chips, arc, day popover), `AgendaView.tsx`,
  `Popovers.tsx` (quick add, event detail with E / Del + Undo), `common.tsx`,
  `types.ts`.

## Remaining verification
- Native Tauri/companion/tray/OS notification smoke, actual pointer drag/resize,
  and optional exhaustive board-state comparison. See docs/ui-redesign-review.md.
- Branch 2 and branch 3 are not started. Stop here for owner review.

## Decisions that differ from the brief
- **Multi-day events need a schema change.** Events have no end date, so a
  single event can't span days. The spanning layout is built and works for
  repeating all-day events (consecutive occurrences join into one bar).
  True multi-day events need an `end_date` column: suggest adding it in
  branch 2's migration.
- Repeating events dragged in Week move/resize in time only (all repeats);
  their day can't change by drag. Event delete uses an Undo toast (delayed
  delete, like "Let it go") because server deletes are sticky.
- No board draws the mini calendar; plan is a side panel toggled by `[`,
  hidden by default to match the boards.
- Initial Week/Day scroll: 08:00 as drawn, unless now is below the fold,
  then now − 2 h.
- "Focus" state on GoalsMine is the keyboard-focused list (that's what the
  board shows); "reminder" = bell when a reminder time passed unsent.
- Quick add numeric dates are day first (24/10). "fri" includes today; "next fri" skips today.
- Native date/time inputs in dialogs follow the OS locale, not the 12h/24h pref.
- Today page keeps its now line (the rule named Week, Day and the widget).

## Next steps, in order
1. DONE: import `styles/fx.css` and new `fx-app.css` in `src/index.css`.
2a. DONE: rewrite App onto Sidebar + sections; Today is independent. Keep legacy
    calendar views temporarily so this is a separate working commit.
2b. DONE: CalendarPage and legacy deletion. Formal board comparison still due.
3. DONE: dialogs v2, Goals Mine (+ goalStats tests), Settings tabs.
4. DONE: MiniCalendar side panel, empty-state passthrough, icons/tray.
5. Every commit: frozen install, tsc in all three packages, Vitest in desktop
   and calendar, desktop build with PORT=1420 BASE_PATH=/, cargo check in both
   native folders. Use Windows host settings. Build widgets when relevant.
   Final: 4-theme x 2-width comparison, native smoke test, report differences;
   stop for owner review.
