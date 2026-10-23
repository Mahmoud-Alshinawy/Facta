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

## Independent verification of d762229 (23–24 October 2026)

This follow-up reran the required checks and exercised the final Notes changes.
It found no application defect and makes no production-code changes. It adds
behavioral and long-content coverage to the visual pass above, rather than
claiming that every design-board state was exercised.

The temporary browser entry used the real App, PlannerSync, IndexedDbStore,
collections and editor with an invented account. Supabase configuration was
explicitly blank and guarded; remotes were null. The database name was
`facta-step6-verification` on the separate localhost:1422 origin, with no legacy
cache input. No production data, live backend or SQL was accessed.

Verified behavior:

- J/K changed the selected grid note; Enter opened its collapsed editor. List
  explicitly reopened the panel. At 1100, the collection selector returned ten
  research notes and the single seeded Trash note correctly.
- Grid fast capture created a note with Inbox and focused its title. Editing its
  title and Unicode body, then reloading, retained both and the Inbox tag in real
  IndexedDB. The 32 KB unbroken long note retained its Arabic/emoji tail in the
  editor; its card preview did not replace the canonical body.
- Ctrl P filtered/opened a note. Selection revealed formatting; Bold applied
  actual strong marks. The picker offered Geist, Geist Mono and Source Serif 4,
  and selected the serif. Ctrl . entered focus mode; Escape exited. Trash Undo
  restored the selected test note. Slash-menu ArrowDown/Enter inserted a real
  checklist and dismissed the menu.
- Quick capture: all twelve theme/width combinations at height 720 fit the
  viewport, focused the text field, closed with Escape and restored Export
  opener focus. A sampled dialog wrapped forward and backward Tab at its ends.
- Slash menu: all twelve combinations fit above the status footer, with six
  options and six icon tiles. Long-content grid, expanded list and collapsed
  editor: 36 cases across four themes and 1440/1280/1100 × 720, with screenshots
  and horizontal-overflow measurements; no overflow found. Contact sheets and
  full-size samples inspected. This is a finite stress case, not all possible
  large notes or overlay positions.
- Diary saved a new day's line and mood 4; both appeared after reload. Timeline
  showed the two expected dates; text search found one entry and a mismatching
  mood filter found zero. Before-first-entry days were neutral; streak changed
  from one day to two days after writing today's line.
- Markdown download inspected on disk: title, bold paragraphs and checked item
  serialized correctly. The TXT menu action was clicked, but no downloaded TXT
  file was verified. The existing Markdown/TXT serializer tests passed. The
  browser's download wait exceeded its requested timeout substantially; no
  additional download wait was attempted. Native download dialogs remain an
  owner check. The invented Markdown file remains in Downloads.

Browser warning/error log was empty. No native runtime smoke, real auth/backend,
multi-device sync or SQL execution was performed in this follow-up. Earlier
native-test limits remain unchanged. Temporary entry/context exports were
restored/removed, the server stopped, viewport reset and tab closed. The isolated
synthetic IndexedDB is confined to the fixture origin. Evidence is local under
`facta-step6-verification/` in the task visualization directory: three stress
contact sheets, individual captures, geometry/capture/slash JSON, persistence,
focus-mode and Diary screenshots.

Required Windows checks passed again: frozen install; all three TypeScript
checks; **375 desktop + 184 calendar tests**; both production builds; both
`cargo check --offline` runs. No fixture source is included in the builds.
