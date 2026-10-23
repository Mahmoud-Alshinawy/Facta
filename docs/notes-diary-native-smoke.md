# Step 5 review and Windows native smoke — 23 October 2026

Reviewed step 5 at `a554dbb` on `feat/notes-diary`. Two native failures were
reproduced and fixed before the final checks:

- A covered WebView2 widget could remain **Queued** after its edit was committed
  and acknowledged. Receipt settlement used `requestAnimationFrame`, which can
  pause while a window is covered. Receipts now settle directly; native retesting
  with the original window stacking policy reached **Saved** with an empty queue.
- Restarting both apps before acknowledgement recovered a Sticky draft with a
  new action ID. The already-saved edit then appeared to conflict with itself.
  Recovery now persists the original action ID and captured fields before native
  delivery. It replays the durable receipt, then separately saves any newer
  typing. Rotation waits if newer typing remains; the selected pinned note also
  stays selected when another note changes the export order.

`widgetDraft.test.ts` exercises JSON recovery and replay through the real sync
engine, collection, queue and receipt ledger, without mocked clients. It includes
a text deletion (`abcdef` to `abc`) so prefix matching cannot masquerade as proof
of a previously applied edit, continued typing, and malformed/old recovery data.

## Native setup

Used separately compiled Tauri/WebView2 desktop and companion binaries, invented
fixtures, separate application identifiers and WebView data directories, and
workspace-only shared JSON/position files. Supabase configuration was explicitly
blank; the fixture refused to start with it configured. The real IndexedDB store,
sync collections, pending-actions file locks, durable receipts, native exports,
widget cards and desktop pages were exercised. Authentication was replaced with
synthetic Account A/B controls; these tests did not perform real sign-in.

The first launcher attempt resolved `facta.exe` to the installed copy despite the
explicit test path. No planner edits were made there; its possible background
sync was not verified. Automatic approval review rejected force-stopping that
installed process because unsaved planner state could be lost. The owner was
asked to quit normally and reported doing so. Later testing used uniquely named
workspace executables to avoid that launcher collision. Installed app files,
settings, data and production URL-handler registration were not edited by the
test setup.

Most pointer tests used a temporary foreground-window override because the normal
bottom-stacked widgets were covered by other host windows. The acknowledgement
failure and its fix were tested before that override. Pointer results therefore
verify native drag/resize mechanics, not production stacking behavior.

## Results

| Check | Observed result |
| --- | --- |
| Native window creation | Sticky, Stack and Diary windows opened with their respective themes. |
| Sticky autosave | Native title edit reached the desktop collection and **Saved**; pending JSON emptied. |
| Long rich note preview | Editing a prefix retained the unseen tail, heading/bold mark and checked checklist item. |
| Pinned rotation | Previous/next selected the other pinned note. |
| Stack capture | Created one title-only note; the new note appeared in Stack and the desktop snapshot. |
| Diary creation/edit | Created today's entry with mood 3; editing retained its ID and mood. Prior fixture entries remained intact. |
| Hidden desktop | Closing the main window hid it; a subsequent Stack capture still committed and was acknowledged. |
| Running-app OS deep link | Opening a specific Stack row through the test URL scheme restored the hidden desktop and opened that note. |
| Desktop restart | An edit queued while the desktop was closed applied after reopening; the pending file emptied. |
| Both apps restart | After the fix, the recovered Sticky edit reached **Saved**, with one receipt for the original action ID and no pending action. |
| Account isolation | Switching A to empty B exported B's owner ID with no A notes/Diary/receipts; sign-out exported a null owner and empty journal. Returning to A retained A's records. |
| Drag/resize | Header dragging moved the native window; border resizing changed its height. Normal companion quit persisted the resulting position/size. |
| Quit path | Fixture Quit invoked the actual desktop quit request/barrier; companion quit saved its positions. |

The native recovered Sticky screenshot is saved in the task visualization folder
as `facta-native-widget-recovery.png`.

## Limits and cleanup

Not verified: a packaged installer launch, the installed production `facta://`
handler, cold-start URL delivery, literal tray-menu interaction, forced power-loss
durability, production bottom-stacking pointer behavior, real authentication or
multi-device/backend sync. Companion status read the existing Windows tasklist
mechanism; a separately installed companion was present, so Settings' status and
Launch button were not an isolated end-to-end launch assertion. Native tests
launched the uniquely named fixture companion directly.

All temporary source overlays were restored, normal development executables
restored, fixture processes closed and the test-created `facta-smoke` registry
scheme removed. No migration or SQL was changed or run. Step 6's full design-board
comparison remains pending.

## Final production-source checks

- `pnpm install --frozen-lockfile`
- `npx tsc --noEmit` in desktop, widgets and calendar
- Desktop Vitest: 373 tests; calendar Vitest: 184 tests
- Desktop Vite build with `PORT=1420 BASE_PATH=/`; widgets Vite build
- `cargo check --offline` in both native folders

Final check outcomes and bundle sizes are recorded in `HANDOFF.md`.
