# Branch 2, step 6 — visual review (23 October 2026)

Compared the app with `design/canvas-v97` and the approved
[rendered boards](https://claude.ai/code/artifact/76b58a8f-b724-450a-9e9a-c0fc36019651).
This completes the planned comparison pass; stop for owner review before further
development. This is sampled visual/behavioral verification, not a claim that all
431 boards or arbitrary user content have been exhaustively tested.

## Corrections

- Restored the grid's fast-capture row and note-count subtitle. Enter creates the
  note through the real collection, opens its title and retains the inbox tag.
- Card previews follow the four-content-block design: omit headings/dividers,
  show checklist and bullet markers, and retain readable note-link labels.
  Previews stay bounded to 440 Unicode characters without changing the body.
  Added logic tests for those rules, empty notes and Unicode boundaries.
- Matched card metadata placement and explicit Pinned/Widget badges.
- Opening a card, switcher result or note link uses the default collapsed-list
  editor. List explicitly reopens the panel. Narrow collection/tag/Trash controls
  now live in that panel, instead of adding a full-width row above the editor.
  The Desktop widget label remains visible when the collapsed editor has room.
- Matched the slash menu's 280px width and icon tiles, using existing Lucide
  icons and theme tokens. The selection toolbar remains selection-only.
- Restored the editor status row and the drawn J/K, Enter, G and Ctrl P footer
  hints. Word counts use singular/plural labels. Status says “On this device”
  rather than claiming a durable save before an IndexedDB batch has settled;
  an actual storage error instead shows “Local save needs attention”.

No Today restyling, schema/native changes, dependency changes or CDN loads.

## Coverage

The matrix used 1440×920, 1280×920 and 1100×920 in Black and green, Midnight,
Ember and Light. Each of the following 18 surfaces was captured in all 12
combinations: **216 core captures**. Captures were visually inspected as contact
sheets, with full-size samples for detail; DOM measurements checked page/header
overflow. No page or header overflow was found. Sidebar width was 240px at
1440/1280 and 64px at 1100.

| Surface | States |
| --- | --- |
| Notes | Grid, collapsed-list editor, expanded list/editor |
| Diary | Today, Timeline, Calendar, Search |
| Calendar | Week, Day, Month, Agenda |
| Event dialog | New event, including branch-2 start/end date fields |
| Goals Mine | List, Board |
| Today | Populated page, approved existing styling retained |
| Settings | Widgets, Appearance, Account |

Additional verification:

- Quick capture: all 12 combinations; Ctrl+Shift+N and Escape, dialog bounds.
- Widget picker: Sticky, Stack and Diary × solid/transparent × all 12 combinations
  (**72 captures**). Each journal card retained its 300px preview width without
  internal horizontal overflow; themes and transparency used the actual shared
  card components over the Settings wallpaper.
- Empty Notes grid/list and all four Diary views: all four themes at 1100
  (**24 captures**), including neutral history and the distinct Try placeholder.
- Sampled at Light/1100: switcher, focus mode, export menu, Notes/Diary shortcut
  sheets, selection toolbar, the three-font menu, slash menu and Trash with Undo.
  Verified grid fast capture creates/opens its title and inbox tag. These overlay
  states were sampled, not each repeated through the full 12-case matrix.
- At 1210×720: single-row calendar header and a keyboard-created 15:00–17:00
  quick-add range. Its popover stayed below the sticky band and above the footer.
  EventDialog fit the short window. Quick capture also fit at 1280×720.
- Multi-day timed events remained spanning bars in Week/Day; shorter overnight
  events stayed in the timed grid. Week/Day kept only the gutter time pill;
  Today retained its approved now line. Keyboard creation was exercised here;
  this step did not repeat native pointer-drag tests.
- Fresh final fixture browser console had no errors or warnings before cleanup.

Source skims focused on NotesApp, DiaryApp, NotesWidget, DiaryWidget, NotesDesk,
Settings, CalWeek and canvas.json. Hosted spot comparisons included Notes grid
in Black and green/Light, the collapsed editor at 1100/Midnight, Diary Today in
Black and green and 1100/Ember, Diary Calendar in Black and green, and NotesDesk.
Other shell/calendar surfaces were regression-inspected against those shared
patterns and the earlier branch-1 review, not individually paired with every
hosted board state.

## Deliberate adaptations and remaining checks

- Narrow Notes uses one collection selector inside the list panel, including
  tags and Trash. The board's three collection chips alone would not expose
  those implemented destinations after the folder sidebar hides. List reopens
  the panel from the grid or collapsed editor.
- Fonts remain the approved bundled Geist, Geist Mono and Source Serif 4 Latin;
  extra sample web fonts are not loaded. Export remains Markdown/TXT; ZIP/PDF
  and the sample DOCX option are outside this branch's approved scope.
- Widget Save/Queued/error feedback and Open controls support real durable
  edits; sample widget interactions only keep state in the design component.
  Device-only/sync labels reflect real configuration rather than invented sample
  “Synced” copy. Shared goals remain coming soon; no Diary lock was added.
- No unresolved clipping was found in the covered layouts. Exhaustive board
  states, arbitrary long-content combinations, native IME/download dialogs,
  packaged launch, production bottom-stacking/URL handling, literal tray actions
  and multi-device/backend sync remain owner checks. Native coverage and its
  limits from step 5 are in `notes-diary-native-smoke.md`; it was not rerun here.

## Isolation, evidence and final checks

Browser testing used a temporary entry point, invented fixtures and the real app
with a memory-backed sync engine and explicitly blank Supabase configuration.
The fixture refused configured backend access. No live Supabase access or SQL
execution was performed. Temporary context exports, entry files, tab and Vite
server were removed before checking the production sources. No fixture is in
the production build.

Local proof, contact sheets and geometry/picker/overlay JSON are in this task's
visualization directory under `facta-step6/`. `notes-grid.png` and
`notes-editor.png` show the final corrected layouts; `calendar-popover.png`
records the short-window range check. These are local review artifacts, not
repository dependencies.

All required Windows checks passed: frozen install; `npx tsc --noEmit` in
desktop/widgets/calendar; desktop Vitest **375/375**, calendar **184/184**;
desktop build with `PORT=1420 BASE_PATH=/`; widgets build; and `cargo check
--offline` in both native folders. Existing desktop main-chunk warning remains.

Bundle kB / gzip: main **689.68 / 202.26**; lazy Notes **364.52 / 112.23**
(before this step: 362.54 / 111.71), Notes CSS **18.57 / 3.93**; lazy Diary
**28.05 / 8.42**; widgets **229.15 / 72.60**, plus window API **15.21 / 3.85**.
