# Branch 1 review checkpoint — 22 October 2026

Implementation is on `feat/ui-redesign`. Review before starting branch 2 or 3.
TodayPanel.tsx is identical to b449d97. No database/schema changes, new
dependencies or CDN loads were added to the app. Verification never accessed live Supabase.

## Browser verification

Used an isolated preview with Supabase env variables explicitly blanked and
disposable local fixture sessions/data. Fixture files were removed before the
final build. Tests used 1440×920 and 1100×920 browser viewports.

| Surface | Inspected |
| --- | --- |
| Calendar Day, Week, Month, Agenda | All four themes at both widths, including overlapping and all-day events |
| Goals Mine list / overview | All four themes at both widths |
| Goals Board | Light at 1440; narrow metadata is 11.5px and has no horizontal overflow |
| Settings Appearance | All four themes at both widths |
| Settings Widgets | Wide and narrow, all five preview types, solid/transparent toggle, create/hide and reset-confirmation cancellation |
| Account | Email, inline confirmation, Escape/Stay and focus return; actual sign-out not submitted |
| Event dialog | Four themes at 1440, Ember at 1100; New/Enter-save/Edit/delete-confirmation Escape/focus return |
| Goal dialog | Light visual check; autofocus, blocked Enter/live messages, custom-repeat validation, reminder disabled without time, reset on reopen |
| Empty Week / Day | Visible after initial scroll; non-selectable; hit testing passes through to the grid; buttons remain interactive |

Compared rendered hosted Week Black and green, Day Midnight, Month Ember,
Agenda Light at 1100, Goals Mine Black and green at 1100, and Settings boards;
also read their component specifications. Used Fit in the board viewer so the
reference retained its original width. This was visual inspection, not a
pixel-diff or exhaustive test of all 431 boards/states.

Keyboard smoke passed: mini-calendar has one tab stop; arrows/Enter select;
date/view changes retain grid focus; Week Enter/Shift+Down/Enter creates a
90-minute draft; Q reveals narrow quick add; incomplete quick add opens a
prefilled dialog; Ctrl+K works while typing; goal quick parsing and X completion
update the list/overview. Week-start, time format and weekend choices propagate.
No browser console errors were reported at the final inspection.

## Fixed during comparison

- Agenda event rows inherited Week's absolute positioning; restored grid flow.
- A utility class kept sync text visible and widened the narrow rail; rail is 64px.
- Board timestamps lacked the spec's 11.5px styling; reminder colour restored.
- Native AM/PM fields clipped; widened the Event dialog time inputs.
- Replaced preview gradient with the approved Shapes wallpaper using shared
  tokens; aligned task segments/completion, progress ring and transparent plates.
- Initial scrolling hid the Week/Day empty cards; moved them outside scrollers.
- View remounting lost keyboard focus on date changes; focus now follows the grid.

## Remaining for owner/native review

- No real Tauri-window smoke in this pass: companion Launch/running status,
  actual widget windows/actions, tray contrast and live OS-theme changes,
  notification permission/delivery and OS date/time picker behaviour remain.
- Pointer drag/move/resize was not exercised through the browser; layout/drag
  maths have Vitest coverage, keyboard range creation and empty-card hit testing
  were exercised. Cross-platform packaging was not run; Windows cargo checks ran.
- Widget previews render current single-user data, not an embedded native widget;
  compare them with the installed companion. Shared progress remains deferred.
- New-widget theme cards follow the brief rather than the board's compact chips;
  the sidebar follows the approved branch-1 navigation. Upcoming includes all
  future one-offs. Multi-day events, Notes/Diary and shared goals remain deferred.

Final automated check results are recorded in HANDOFF.md.
