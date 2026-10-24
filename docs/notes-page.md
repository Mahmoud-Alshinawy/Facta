# Notes page (branch 2, step 2)

Notes is a lazy React route backed by the existing `useNotes` collection hook.
Its only shell addition is app-local quick capture (`Ctrl+Shift+N`). Until step
5 unhides the sidebar entries, that shortcut opens Notes; close or save capture
to use the full page. No global OS shortcut is registered.

`components/notes/NotesPage.tsx` owns navigation, filters, tags, Trash/Undo,
capture, switcher, focus and per-note exports. `NoteEditor.tsx` owns the editor,
selection toolbar, slash/reference suggestions and blocked-edit feedback.
`editorExtensions.ts` declares the exact flat canonical blocks, inline marks,
checklist controls, stable block identities and undo history.

The editor uses the [MIT TipTap core](https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md),
React bindings, ProseMirror packages and open-source UndoRedo extension, pinned
to 3.32.0. No Pro extensions or hosted services. Custom flat nodes avoid lossy
conversion between a nested list model and the approved seven-block JSON model.
`noteEditorAdapter.ts` converts documents to/from that model; limits reject
invalid/oversized transactions before they can replace the saved body.

Formatting appears only while text is selected. Font and alignment apply to the
whole note; bold, italic, colour and safe external links are inline marks. Fonts
are bundled Geist, Geist Mono and Source Serif 4 Latin (regular/italic/bold,
OFL). The schema has code blocks, not inline-code or strike marks. Only the
approved fonts and marks are offered, even though the design samples show more.

`notes.ts` contains selection, grouping and capture logic. Trash (`trashedAt`)
is restorable; permanent delete uses the existing collection tombstone only
after explicit confirmation. There is no automatic 30-day purge. The “This
week” list group follows the week-start preference, and Recent uses seven days.
The widget toggle only saves `pinnedToWidget`; companion support is step 5.

`noteExport.ts` produces Markdown/TXT, with escaped literal text, safe filenames,
code fences longer than embedded backticks and UUID note-reference links.
Downloads use a UTF-8 Blob and the webview/browser's download handling. ZIP/PDF
and bulk export are deferred. Native download dialogs still need owner testing.

Keyboard rows follow NotesApp's NA-cheat. Modifiers also accept Meta. Slash and
reference menus accept arrows/Enter/Escape; controls remain reachable by Tab.
Selection formatting and Ctrl+K leave global search alone. Capture is available
throughout the app, and modal focus trapping prevents shortcuts acting behind
dialogs. No editor sample content is shipped.

Tests exercise the real editor schema and pure mapping/export/selection logic.
Browser checks use temporary, isolated local-only data; they do not assert any
live Supabase or native-runtime behavior. The owner verified the corrected
step-1 SQL test and migration apply/rerun against local Supabase separately.

Final Windows checks: 312 desktop and 152 calendar tests, all three TypeScript
checks, both frontend builds, both offline cargo checks and frozen install.
Before this step the Notes chunk was absent (0 KB); main JS was 659.58 kB /
191.91 kB gzip. After: lazy Notes JS 362.24 kB / 111.58 kB gzip, Notes CSS
17.87 kB / 3.79 kB gzip, main JS 660.74 kB / 192.45 kB gzip. Serif files are
referenced only by the lazy stylesheet. The existing main chunk warning remains.
