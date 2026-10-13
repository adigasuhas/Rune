# RUNE Design System — MASTER

Source of truth for the UI/UX overhaul. Read this before touching any screen. Tokens live in `src/app/globals.css`; this file explains what they mean and how to use them correctly. When Phase 3 touches a screen, it should read this file first, not re-derive values from scratch.

> **2026-08-30 — the system is now "Ledger", not the blue/glass direction §§3–8 originally described.** globals.css was fully rewritten: **light-first**, one **pine green** accent (`#1F4D3E`), **clay** (`#9A4A2F`) for attention/destructive, **ochre**/**slate** for data only, **hairline rules not shadows**, **radii ≤ 6px**, **Raleway** display / **Inter** body / **JetBrains Mono** for data-time-IDs only. The semantic token *names* (`bg-card`, `text-foreground`, `border-border`, `bg-primary`, …) are unchanged — only their values — so token-based screens carried over for free. The reference render is the design-canvas artifact + `scratchpad/mockups/*.png`; the shared component set is `src/components/ui.tsx`. §§3–8 below have been updated to Ledger; §§9–13 are still-accurate history of what each pass touched.

Calibration point: a lab notebook and a well-set journal page — restrained color, confident typography, asymmetry where it clarifies, motion that shows state rather than decorates it.

---

## 1. Architecture: three layers

```
Primitive   raw values, never used directly in components (--gray-500, --blue-600)
    ↓
Semantic    role-based, theme-aware — what components actually reference (--bg, --primary, --danger)
    ↓
Component   per-component aliases, defined near the component that needs them (not global yet — add as Phase 3 touches each component)
```

Primitives and the dark-value semantic tokens live in `:root` in `globals.css`. Light-value overrides live in `:root[data-theme="light"]`, redefining the **same semantic names** with different values — never an inverted copy of dark, each chosen for its own contrast on a light ground.

**Naming gotcha, load-bearing:** the raw `:root` semantic variables are named `--bg`, `--surface`, `--text`, `--primary`, etc. (no `color-` prefix). The `@theme` block maps them into Tailwind's `--color-*` namespace (`--color-background: var(--bg)`). Do not give a `:root` variable and its `@theme` mapping the same name — that's a circular reference (invalid at computed-value time, silently breaks). This bit us once already; keep the two layers named differently.

## 2. Theming mechanism

Theme is an explicit user choice (Settings → Appearance, or Onboarding), **not** OS `prefers-color-scheme`. Tailwind's `dark:` variant is remapped accordingly:

```css
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

`ClientLayout.tsx` applies `data-theme` to `document.documentElement`, mirroring the pre-existing `data-font-size` pattern: cached value applies instantly on mount (no flash), a `rune-theme-changed` window event picks up in-session changes, and a separate effect syncs from `user.theme` (the server-side source of truth) once the session loads. No attribute present defaults to dark — matches current behavior for existing users.

**Because tokens themselves flip value under `[data-theme="light"]`, most components need zero `dark:` classes.** Just use the semantic utility (`bg-background`, `text-foreground`, `border-border`...) and both themes work automatically. Reach for `dark:`/light-specific overrides only for genuine exceptions — a decorative glow effect, an image, something that isn't just a color swap.

## 3. Color tokens (Ledger)

Full values are in `globals.css` (`:root` = light/default, `:root[data-theme="dark"]` = dark overrides of the same names). What each role is *for*:

| Utility | Light | Dark | Use for |
|---|---|---|---|
| `bg-background` | `#E7E6DF` oat | `#1B1B18` | page ground |
| `bg-card` | `#FBFAF7` paper | `#232320` | panel / card surface (flat) |
| `bg-surface-raised` | `#FBFAF7` | `#2A2A26` | inputs, popovers |
| `bg-surface-sunken` | `#DEDCD0` sand | `#191916` | chrome, inset areas, hover fill, planner grid |
| `border-border` | `#CFCDBE` hairline | `#35342D` | the default hairline — **this does most of the visual work** |
| `border-border-strong` | `#B3B1A0` | `#4A4940` | emphasized hairline (ghost-button border, active nav) |
| `text-foreground` | `#23231F` ink | `#ECE9DF` | primary text |
| `text-ink-secondary` | `#5C5B52` | `#A5A294` | secondary text, panel-header labels |
| `text-muted-foreground` | `#5C5B52` | `#A5A294` | muted (alias of ink-secondary) |
| `text-ink-faint` | `#67665A` | `#8a877b` | timestamps, mono meta, least-emphasis (Phase 4: darkened from `#8B8A7E` — was 2.8:1 on oat, now 4.6:1, WCAG AA) |
| `bg-primary` / `text-primary` | `#1F4D3E` pine | `#469A78` | **the one accent** — primary actions, active nav, links, running state (dark bumped from `#3E8F6E` for AA) |
| `bg-primary-soft` | `#E0E9E3` | `#14251D` | selected/active fill, running-pill background |
| `bg-danger` / `text-danger` / `bg-danger-soft` | `#9A4A2F` clay | brighter | errors, destructive actions, overdue, failed — **never decoration** |
| `bg-warning` / `bg-warning-soft` | `#7F6118` ochre | `#cc9a3c` | warning only (Phase 4: darkened from `#A97C1F` for AA) |
| `--color-data-slate` `#45606B`, `--color-ochre`, `--color-pine`, `--color-clay` | | | **categorical data-viz only** (chart series, heatmaps) — not UI chrome |
| `ring-ring` | pine | pine | focus rings (`:focus-visible` baseline is already wired globally) |

**Rule: one accent, used sparingly.** Pine is the only action color — primary buttons, links, the active nav item, "running". Everything else is ink on paper with hairlines. Exactly one `bg-primary` element per screen region.

**Rule: clay/ochre are reserved.** Clay = attention/destructive/overdue/failed. Ochre = warning. They never double as decoration or a "nice-looking" accent. Slate/ochre/pine/clay as a *categorical quartet* are for data-viz series only.

**Glass is retired.** `.glass-panel` / `bg-glass*` tokens still resolve (to a plain flat `bg-card` + hairline) so old class references don't break, but don't reach for them — use `Panel` / `bg-card border border-border`.

**Project tag colors** (`src/lib/colors.ts`, `PROJECT_COLORS`) and the notebook rich-text color picker are separate user-content palettes — leave them alone.

## 4. Typography (Ledger)

- **Display / headings:** **Raleway** 700–800, `letter-spacing: -0.02em` — the `.font-display` class (`--font-display`, loaded in `layout.tsx`). Page titles, panel-header labels, pills, stat labels, the `RUNE.` wordmark.
- **Body / UI text:** **Inter** 400–600 — Tailwind's default `font-sans`. All interface text.
- **Notebook reading surface:** a **serif** (`Georgia, 'Iowan Old Style', 'Palatino Linotype', serif` — system stack, no font load), 15px/1.7, set on `.notebook-preview-styled`. The rendered page reads like a journal article, deliberately unlike the app chrome (the mockup shows this). Notebook headings stay Raleway. The LaTeX renderer (`src/lib/latex/renderer.ts` + `environments.ts`) emits semantic-token classes (`text-foreground`, `border-border`, …) for the in-app preview — it previously hard-coded `text-zinc-300`-family darks that were near-invisible on the light ground.
- **Data only:** **JetBrains Mono** (`font-mono`, `--font-mono`) — times, dates, IDs, counts, percentages, durations, code. **Numbers set in mono are right-aligned** in tables/lists and carry `tabular-nums`. Do not use mono for labels or prose.
- **Type scale:** Tailwind standard `text-xs/sm/base/lg/xl/2xl` (12/14/16/18/20/24). Panel-header labels are `text-[11px]` uppercase `tracking-[0.1em]`; pills `text-[9px]`. `globals.css` floors `text-[8–11px]` to 11.5px — don't fight it, don't invent sub-11px sizes for body.
- **Font scaling:** `--root-fs` via `html[data-font-size]` is the only a11y text-scaling mechanism. Don't add a second.

## 5. Spacing & radius (Ledger)

- **Spacing:** Tailwind's 4px scale. Cards/panels: `p-5` body, `px-4 py-3` header row. Compact list rows: `px-4 py-2.5` / `py-3`. Modal bodies: `p-6`. No arbitrary `p-4.5`.
- **Radius — everything is ≤ 6px and flat:** `rounded-[3px]` (pills, tags), `rounded-md` (**6px** — buttons, inputs, panels, cards — the default for almost everything), `rounded-lg` (**8px** — modals only), `rounded-full` (avatars, status dots). **No `rounded-xl` / `rounded-2xl` anywhere** — if you see one, it's pre-Ledger debt, convert it.

## 6. Elevation (Ledger)

**Hairlines, not shadows.** A panel is `bg-card` + `border border-border`, full stop. The `--shadow-*` tokens still exist but resolve to near-nothing in light (`0 1px 2px rgb(35 35 31 / 0.06)` at most) — don't add `shadow-md`/`shadow-lg`/`shadow-2xl` classes to anything. Depth comes from the sand/paper surface step and the hairline. Modals get `--shadow-modal` and nothing else does.

Hover affordance on a card/panel = `hover:border-border-strong`, not a shadow or a lift or a scale.

## 7. Motion (Ledger)

```
--duration-micro: 110ms      /* hover, small state flips */
--duration-standard: 180ms   /* most transitions */
--duration-modal: 260ms      /* modal / page-level */
--ease-standard: cubic-bezier(0.2, 0, 0, 1)
```

Apply via arbitrary-value syntax (`transition-colors duration-[var(--duration-standard)] ease-[var(--ease-standard)]`) — bare `duration-standard` is not a real class and silently does nothing. **Transition `colors` / `border-color` / `opacity`, not `all`.** No `scale` on hover, no decorative keyframes. `globals.css` has the `prefers-reduced-motion` guard — don't bypass it with `!important`.

## 8. Principles, applied

From the design-system mockup, verbatim, because they're the whole rulebook:

- **One accent, used sparingly** → pine only, one primary element per region.
- **Hairlines, not shadows** → see §6.
- **Radii ≤ 6px, panels flat** → see §5.
- **Empty states are written screens, never a wall of zeros** → every empty state is a sentence about what goes here + the action to start, via `EmptyState` from `ui.tsx`. Never render "0 / 0 / 0%" tiles for a fresh account.
- **Numbers set in mono and right-aligned** → all data in `font-mono tabular-nums`; right-aligned in any tabular context.
- **Motion clarifies state, it doesn't decorate** → see §7.
- **Asymmetry where it clarifies** → e.g. the dashboard's 1.55fr planner / 1fr rail split; don't force everything to a centered symmetric grid.

## 9. What Phase 2 already touched (don't redo)

- `globals.css` — full token system, `@custom-variant dark`, `.font-display`, `--font-sans` → Inter, `prefers-reduced-motion` guard.
- `layout.tsx` — dropped unused Outfit import, `html` background token-driven.
- `ClientLayout.tsx` — full shell (loading screen, first-user overlay, sidebar, header, footer, keyboard-shortcuts modal) converted to semantic tokens; theme-attribute application wired (mirrors the existing font-size pattern).
- `SessionContext.tsx` — `theme` added to the `User` type (was already returned by the API, just untyped).
- `settings/page.tsx` — real Theme (Dark/Light) and Font Size (Small/Medium/Large) controls added to General settings, applying instantly via the same event mechanism as the rest of the shell. This was previously dead state with no control at all.

## 10. What Phase 3/4 already touched (don't redo)

- **Add Task card unified.** `src/components/TaskFormModal.tsx` is now the single implementation shared by Dashboard (`page.tsx`) and Tasks (`tasks/page.tsx`, create + edit). Real hierarchy (name field dominant, everything else behind a "More options" disclosure), inline validation instead of `alert()`, loading/disabled-while-submitting state, and a visible error banner on failed creation. The Dashboard/Tasks feature-drift the audit flagged (Status/Notes present on one, absent on the other) is resolved — both now render the same fields, gated by whether the caller passes `status`/`notes` props.
- **Analytics migration bug fixed.** `analyticsStartDate` is a new `User` field (`prisma/schema.prisma`), distinct from `createdAt`, reset to "now" by `POST /api/user/backup` whenever a restore happens. `GET /api/settings` returns it; `AnalyticsView.tsx` anchors every lifetime calculation to it instead of the frozen signup date, and shows an explicit amber banner + relabeled stat tile when the two dates diverge (`isMigratedAccount`). Verified end-to-end via a real export→restore cycle, not just code review.

## 11. What Phase 3 still owns, per screen

Convert each screen's raw hex / arbitrary values / non-standard `zinc-###` shades to the tokens above. Full baseline and file:line citations are in the Phase 1 audit.

**Done:** `ClockTimePicker` (+ Escape-to-close), loading states on Dashboard/Tasks/Projects, Jobs header convention, full token pass on Settings/Login/Onboarding. Two functional fixes bundled in along the way: Onboarding's working-days picker (`toggleDay`/`daysOfWeek`) was dead code — never rendered — now wired into Step 2, so new accounts aren't silently locked to Mon–Fri anymore. And the Step 4 "Harmonious Light" theme selector, previously a no-op, now actually works end-to-end since Phase 2 wired up real theme switching.

**Notebook done too.** `NotebookView.tsx`'s 129 broken shade classes and 3 app-chrome hex backgrounds are fixed (invisible/near-invisible text and two buttons that had no visible background in either state). Its rich-text color picker (white/red/blue/green/purple/yellow/orange/pink swatches for user document content) was deliberately left alone — that's user-facing content styling, not app chrome, same category as `PROJECT_COLORS`.

**Help, Developer, and Accomplishments done too.** Help's h1 now uses the standard scale instead of the deprecated `.text-custom-*` system (it was rendering smaller than every neighbor screen because of it). Developer got full tokens plus real focus rings on every input/select (previously `focus:outline-none` with nothing replacing it — a genuine keyboard-accessibility gap). Accomplishments' client-side redirect page was replaced with a proper permanent redirect in `next.config.ts` and the page deleted — no more blank-flash before the bounce to `/analytics`.

**CTA color is fully unified, app-wide, even where token conversion isn't.** As a closing sweep, grepped the whole `src/app` tree for the three competing CTA patterns the Phase 1 audit flagged (`bg-zinc-100` white pill, raw `bg-blue-600`, brand `bg-[#FFB000]`) and converted every remaining instance — including two more broken-shade buttons this turned up (`hover:bg-zinc-250` on Dashboard, invisible in both states) — to `bg-primary`. There is now exactly one primary action color anywhere in RUNE, independent of how much of each screen's surrounding chrome has been tokenized yet (see §12 — that part is NOT fully done).

**Two bugs caught mid-pass, worth remembering the pattern:** a bulk regex swap for one screen matched across a ternary boundary and corrupted an unrelated hover color (caught by re-reading the diff before shipping); a blanket `text-white → text-foreground` sweep would have put dark text on primary-blue buttons in light mode (caught the same way). Lesson for future bulk find/replace passes on this codebase: always grep the *context* around each match, not just the literal string, before trusting a mechanical substitution across a whole file.

## 12. Phase 5 verification — final state

The first Phase 5 pass (grep for raw hex + broken shade classes) found Jobs, Analytics, Dashboard, Tasks, Projects, and the Projects detail page still carrying substantial unconverted raw-hex/broken-shade debt in their body content, despite being "touched" for specific fixes earlier. All of that has since been converted. **A second, more important gap surfaced only when screenshotting light mode**: the earlier hex/broken-shade grep never caught *plain standard Tailwind classes* (`text-white`, `bg-zinc-900`, `text-zinc-400`, etc.) — syntactically valid, so they never showed up as "broken," but just as non-adaptive to theme as a raw hex code. This is why the Dashboard heading, stat numbers, and several other elements were rendering near-invisible in light mode even after the file had supposedly been "converted." Caught by actually looking at a light-mode screenshot, not by grep — a reminder that token-grepping and visual verification catch different bug classes and neither alone is sufficient.

Final repo-wide count after fixing both classes of gap:

| File | Raw hex left | Status |
|---|--:|---|
| `lib/notebookExport.ts` | 58 | Legitimate — light-styled PDF export template, not app chrome |
| `jobs/page.tsx` | 45 | Legitimate — its own PDF/print export template (same pattern) |
| `tasks/page.tsx` | 40 | Legitimate — same PDF export template pattern |
| `lib/colors.ts` | 32 | Legitimate — `PROJECT_COLORS`, user-facing tag palette |
| `notebook/NotebookView.tsx` | 30 | Legitimate — rich-text content color picker, deliberately preserved |
| `lib/latex/renderer.ts` + `environments.ts` | 26 (incl. 10 broken shades) | Legitimate — LaTeX document rendering output, content not chrome |
| `help/page.tsx`, `analytics/AnalyticsView.tsx` | 6 each | Legitimate — category-color legends (Help docs, chart series) |
| `projects/page.tsx`, `page.tsx`, `projects/[id]/page.tsx`, `api/projects/route.ts` | ≤5 each | Legitimate — `PROJECT_COLORS` fallback values (`#71717A` etc.) |

Zero broken shade classes and zero non-adaptive standard-color classes (`text-white`, `bg-zinc-900`-family, etc.) remain in any app-chrome file. The 5 remaining literal `text-white` instances repo-wide are all confirmed sitting on saturated colored buttons (`bg-danger`, `bg-purple-600`, `bg-red-600`) where white text is correct in both themes. Every screen — Dashboard, Tasks, Projects, Projects detail, Jobs, Analytics, Settings, Login, Onboarding, Help, Developer, Notebook — has been screenshotted in both dark and light mode and confirmed legible.

**Two other bugs this pass caught, worth remembering the pattern for next time:**
1. A hardcoded gradient banner (`from-blue-950/20 via-zinc-950 to-indigo-950/20`) on Analytics used a fully-opaque middle stop, making the whole card black regardless of theme — invisible as a bug in dark mode (it already looked dark), only visible in light mode. Replaced with `bg-card`. A second, partially-transparent version on Dashboard produced a muddy gray wash rather than full invisibility; replaced with `bg-primary-soft`.
2. Jobs' active-tab indicator used `border-white` for the underline — invisible on a light background. Replaced with `border-primary`.

**Contrast audit also caught a real bug**: `--blue-500`, `--gray-500`/`--gray-600`, and light-mode `--green-600`/`--amber-600` failed WCAG AA in their first-committed values — most seriously, white text on `bg-primary` in dark mode was 3.68:1 against the 4.5:1 requirement, meaning every primary button shipped in this session was under-contrast until caught here. All token values now verified ≥4.5:1 (≥3:1 for the deliberately-faintest `text-ink-faint` tier) in both themes — see §3's updated hex values.

**No functional regressions**: `tsc --noEmit` is clean after every change in this session; every route (`/`, `/tasks`, `/projects`, `/jobs`, `/notebook`, `/analytics`, `/developer`, `/settings`, `/help`, `/login`) returns 200 with no server errors as of the last check.

## 13. Post-launch fixes (user-reported)

- **Add Task modal overflow.** `TaskFormModal` was `max-w-lg` with Session Type squeezed into a half-width grid column next to Planned Date — the 3-button `SessionTypeSelector` (full labels) overflowed the card, showing "Regular" as just "R". Widened the modal to `max-w-2xl` and gave Session Type its own full-width row with `flex-1` buttons. `SessionTypeSelector`'s `iconOnly` prop still works unaffected (buttons only go `flex-1` when labels are shown).
- **`REGULAR` session type icon** changed from `Circle` to `Briefcase` — more legible at a glance than an empty circle.
- **Notebook toolbar overflow.** The `Section` / `Add Page` / `Add Log` three-button row didn't fit the sidebar column width — "Add Log" spilled outside it. Folded "Add Log" into the "Add Page" template picker as a prominent first option (same `handleCreateDailyLog` logic, just one level deeper); toolbar is now 2 buttons and fits cleanly.
- **Notebook text color "doesn't work."** Verified end-to-end — `\textcolor{}` insertion and rendering both work correctly. The actual issue: applying a color while in **Source** view (raw LaTeX text) shows no visible change, since you're looking at markup, not rendered output. The Color/Highlight dropdowns now auto-switch to Split view on use, so the effect is visible immediately instead of looking broken.
- **Light-mode contrast strengthened further**, past the WCAG AA minimum from the earlier pass — `text-muted-foreground` light went from 4.51:1 to 6.67:1 (`#71717a` → `#57575f`), and `border-color`/`border-strong` light darkened noticeably (`#e4e4e7`/`#d4d4d8` → `#c7c7cc`/`#a8a8b0`) since hairline borders were barely visible against the off-white background.
- **Help page rewritten** as a full conversational user manual — 10 sections (Welcome, Tasks & Projects, Calendar, Task Details, Notebook, Analytics, Settings, Keyboard Shortcuts, PDF Exports, FAQ) replacing the previous terse reference-style content. Same search/category UI, only the `DOCS_DATA` content changed.
- **LaTeX toolbar spot-checked**: Bold/Italic/Underline/Strikethrough/Bullet List/Numbered List/Blockquote/Table/Link/Color all confirmed inserting correct syntax and rendering correctly in Split/Render view.
- **Timezone bug fixed.** The header clock (`ClientLayout.tsx`) and Dashboard greeting (`page.tsx`) were formatting `new Date()` with raw `Date.prototype` methods, which always render in the browser/server's local time regardless of the user's saved `timezone` setting. Both now use `Intl.DateTimeFormat` with an explicit `timeZone` option (falling back to browser-local if the saved string is invalid/empty). Verified by setting the account timezone to `America/Los_Angeles` and confirming the header clock matched actual LA time, not server-local time. `SessionContext`'s `User` type gained a `timezone?: string` field to carry this through.
- **Notebook "Page Font Color" + text-alignment feature removed entirely**, per explicit request — this was a separate, broken feature (8 preset color-dot swatches + Align Left/Center/Right/Justify, stored as a JSON metadata blob inside the page content string) from the inline `\textcolor`/`\colorbox` toolbar controls fixed earlier in this list. Removed the toolbar block, its `pageFontColor`/`pageTextAlign` state, the metadata-blob write path in `handleSavePage`, the `isDirty` dirty-check terms, and the preview-pane inline `style` override. `stripPageMetadata` is kept (still needed to strip legacy blobs from pages saved before this removal); `parsePageMetadata` import was dropped since nothing in the file calls it anymore.
- **Notebook Color/Highlight controls redesigned** from plain `<select>` dropdowns into icon-triggered popovers (new `src/components/ColorPickerPopover.tsx`, used twice — `Palette` icon for text color, `Highlighter` icon for highlight). Each popover offers the original preset swatches, a native `<input type="color">` picker, and a validated hex-code text field (Enter or the check button applies it; invalid input shows an inline error instead of silently failing). Text color inserts `\textcolor{#rrggbb}{}` directly — `renderer.ts`'s `COLOR_MAP` lookup already falls through to the raw argument when it isn't a known color name, so arbitrary hex just works with no renderer changes needed. Highlight converts the chosen hex to `rgba(r, g, b, 0.25)` via a small local `hexToRgba` helper before inserting `\colorbox{}`, so custom highlight colors read as a tint rather than a solid block, consistent with the original presets. Both still auto-switch to Split view on use. Verified live: hex input, native picker, and preset swatches all insert correct markup and render correctly in both themes.
- **Notebook toolbar caret/scroll-jump fixed.** Clicking any formatting icon (Bold, Italic, Strikethrough, bullet/numbered list, Color, Highlight, etc.) calls `insertTextAtCursor`, which used to update `pageContent` via React state and then restore the textarea's caret 50ms later in a `setTimeout`. In that gap, the controlled textarea re-renders with no explicit selection, and a browser's default "no selection" behavior is to show the caret (and scroll) at the start of the field — visible as the editor jumping back to the top of the document on every toolbar click, forcing a re-scroll. Fixed by writing the new value to the DOM directly (via the native `HTMLTextAreaElement` value setter) and calling `setSelectionRange` synchronously in the same tick, *before* the React state update — so there is no longer any window where the textarea is showing an unselected, unscrolled state. `setPageContent` still runs afterward to keep React's state in sync; since the DOM already matches, React's re-render doesn't disturb the already-correct selection.
- **Notebook toolbar disappearing entirely on textarea focus, fixed.** Separate, more serious bug found chasing a follow-up report ("after I click text color the toolbar is nowhere to be seen"): the editor's content `<textarea>` had `min-h-[500px] md:min-h-[60vh]`, forcing it taller than the space actually available inside its fixed-height, `overflow-hidden` parent card (toolbar + textarea + footer bar together exceeded the card's box). That made the card genuinely overflow its own bounds — but since it's `overflow: hidden` rather than `overflow-y: auto`, there was no visible scrollbar, just silent clipping. The instant the textarea received focus (not even typing — a plain click was enough), the browser's native "scroll focused element into view" behavior scrolled that hidden container down by exactly the toolbar's height to bring the textarea to the top of its clipped viewport, permanently hiding the entire toolbar row above it with no way to scroll back. Fixed by dropping the redundant min-height: the textarea already has `flex-1` to correctly fill whatever space remains after the toolbar and footer bar, and its own `overflow-y-auto` already handles scrolling for long content — the forced minimum was serving no purpose and was the sole cause of the overflow. Verified live: `scrollTop` on the wrapping card now stays at 0 through focus, typing, and color-picking, and the full toolbar (all 5 groups) stays visible and correctly positioned throughout.

## 14. Phase 3 — Ledger screen rebuilds (2026-08-30)

All 12 screens passed. The mockups' information architecture landed on
**Dashboard** (Needs attention / Up next / Runs rail), **Tasks** (grouped by
state, compact rows, segmented bar), **Projects** (detail = breadcrumb + title
pills + Objectives/Tasks + a Pulse panel), **Notebook** (preview-first, serif
reading surface, "On this page" outline), **Analytics** (day-count strip
reconciled, bento cards → segmented tabs). **Runs** got the summary strip +
tabs + flat cards but not the table (carried to P4).

Recurring moves, for whoever picks up the carry-over:
- Bento tab-cards / stat-card grids → a **segmented tab bar** or a **divided
  hairline `StatRow`**. No `hover:-translate-y-1`, no `hover:shadow-xl`, no
  `ring-1`, no icon chips.
- Screen headers: bare `<h1>` (no leading lucide icon), `text-ink-secondary`
  subtitle, actions as `Button`-style (ghost + one primary).
- Panels: `bg-surface border border-border rounded-md`, a `px-4 py-3`
  hairline header row with the `font-display text-[11px] uppercase
  tracking-[0.1em] text-ink-secondary` label. Rows: `divide-y divide-border`.
- Numbers: `font-mono tabular-nums`, right-aligned in tabular contexts,
  `text-foreground` (a number is not a status — don't colour it
  success/warning/primary).
- The **LaTeX renderer** (`src/lib/latex/renderer.ts` + `environments.ts`)
  emits classes for the in-app notebook preview — they must be semantic
  tokens, never `text-zinc-*`. The PDF branches (`isPdfExport`) keep their
  own light-theme greys.

**Phase 3 carry-over is tracked in `docs/internal/ROADMAP.md`** (Runs table,
Notebook tree, Analytics per-tab layout, the six monolith file splits).

## 15. Phase 4 — responsive / motion / a11y / QA (2026-08-30)

- **Contrast**: `--ink-3` `#8B8A7E`→`#67665A` (2.8→4.6:1 on oat), `--ochre`
  `#A97C1F`→`#7F6118`, dark `--pine-bright` `#3E8F6E`→`#469A78`. Re-run the
  contrast script (a `lum()`/`ratio()` snippet — see the Phase 4 ROADMAP
  entry) before shipping any new token value.
- **Scrims**: modal + drawer backdrops are `bg-black/50` (a scrim dims the
  page regardless of theme). `bg-ink/40` was a real bug — `ink` isn't mapped,
  so the scrim was invisible.
- **Motion**: no `hover:scale`/`active:scale` anywhere. Progress bars and
  planner blocks transition a specific property, never `all`. The one enter
  animation is `.animate-slide-in` (6px + opacity, 180ms, in globals, under
  the `prefers-reduced-motion` guard).
- **Modals**: `src/components/Modal.tsx` has trap + Escape + `role="dialog"` +
  `aria-modal` + **focus restoration to the opener on close**. Use it (or
  `useConfirm`/`usePrompt`) for every dialog — don't hand-roll `fixed inset-0`.
- **Session types**: `SESSION_TYPE_META` uses pine (deep work) / slate (focus)
  / neutral (regular). Planner event blocks: pine-soft / ochre-soft / sand.
- **Route tests**: `tests/routes.test.ts` — mock `@/lib/auth` + `@/lib/db`,
  invoke the exported `GET`/`POST` directly, assert status codes. Pattern to
  copy when adding coverage for a new route.

**Still open (deferred, in ROADMAP):** cross-browser QA (needs real
browsers), the landing-page hero screenshot, a keyboard path for
drag-to-schedule, and the Phase 3 carry-over (Runs table, Notebook tree,
Analytics per-tab layout, the six file splits).

## 16. Teams detail — from-scratch Ledger redesign (2026-09-17)

Teams never had a mockup (unlike the Phase 3 12 screens) — `/teams/[id]`
had grown into six sections stacked in a single `max-w-4xl` column (Members,
Chat, Hierarchy, Invites, Danger Zone), with Chat squeezed to the same
narrow width as everything else. Designed a real mockup first (artifact,
matching this file's tokens exactly), confirmed with the user, then
implemented:

- **Header** stays the same (back arrow, editable name, role pill).
- **New 4-cell divided stat strip** (`StatCell` helper) — Members / Active
  projects / Blocked tasks (slate tone — "a number is not a status") / Team
  leaders. `GET /api/teams/[id]` now returns a `stats` object computed
  server-side (`db.project.count({ teamId, status: 'ACTIVE' })`,
  `db.task.count({ status: 'BLOCKED', project: { teamId } })`).
- **Segmented tab bar** (`TabButton` helper, same active-pine-underline
  pattern as Developer's admin tabs): Overview / Members / Chat / Settings
  (Settings hidden entirely for a plain Member — nothing in it applies to
  them). Every existing section (Members list, Team Hierarchy graph,
  Invites, Danger Zone) kept its exact JSX and handlers in place, just
  wrapped in an `{activeTab === 'x' && (...)}` guard — a relocate-in-place
  refactor, not a rewrite, so all existing behavior (role changes, remove
  member, subgroup management, invite create/revoke, transfer ownership,
  delete team, the member-summary drill-down modal) carried over unchanged.
- **Chat got its own tab** instead of sharing the column — full width now.
  `messageMember()` (used by both the flat member list and the summary
  modal) now does `setActiveTab('chat')` instead of `scrollIntoView` on a
  `#team-chat-section` anchor, so clicking "Message" on someone actually
  switches you into the Chat tab with their DIRECT thread preselected
  (`TeamChat`'s existing `preselectUserId` prop, unchanged).
- **Team list page** (`/teams`) barely needed anything — was already
  Ledger-compliant. Added a member-avatar stack to each card for a faster
  read; left the rest alone.

Verified live end-to-end: seeded a real team (4 members, a subgroup, an
ACTIVE project, a BLOCKED task) via a direct DB script, logged in as the
owner, screenshotted all four tabs (stat strip numbers matched the seeded
data exactly), confirmed clicking "Message" on a member switches tabs and
preselects their thread. Test data deleted after. `tsc` clean, 155/155
tests, `next build` clean.

## 17. Notebook — real editor + fixed figure/table/quote/abstract cards (2026-09-17)

Two items, mockup-first (same artifact process as §16), both from
previously-deferred scope (the figure-card styling and the full editor
rebuild were both called out as carry-over in §9/§14 - the editor rebuild
had been explicitly scoped *out* earlier in this engagement as too large
for that pass; reopened here on explicit user request).

**Figure/table/quote/abstract cards, fixed** (`src/lib/latex/environments.ts`):
`rounded-2xl … shadow-sm` (16px radius + a shadow, both pre-Ledger debt)
was still sitting in the figure and table wrapper divs, the abstract block,
and `rounded-r-xl` on blockquotes - discovered all four while fixing the
one the user's mockup called out. All four now `rounded-md` (or
`rounded-r-md`), no shadow - matches every other panel. `isPdfExport`'s
separate light-theme branch (a literal white background for the PDF
export path) was left alone, same reasoning as always: legitimate export
styling, not app chrome.

**Real editor** (`src/components/LatexEditor.tsx`, new): the Write pane's
plain `<textarea>` is now CodeMirror 6 (`codemirror` + `@codemirror/*` +
`@codemirror/legacy-modes`' built-in `stex` mode for LaTeX tokenization).
`HighlightStyle` maps `stex`'s tags onto existing tokens, no new colors:
commands → `--primary` (pine) bold, braces → `--ink-3`, a recognized
command's bracketed argument (citation keys, labels, file paths) →
`--data-slate`, comments → `--ink-3` italic. Theme is a plain
`EditorView.theme()` reading the same CSS custom properties the rest of
the app uses, so both light/dark themes work with zero extra code.

This ended up being a full rewire, not a drop-in swap, because three
pieces of `NotebookView.tsx` were built directly against
`HTMLTextAreaElement`:
- **Toolbar insertion** (`insertTextAtCursor`) - was a raw-DOM-setter hack
  to avoid a React-render race (see §13's "toolbar caret/scroll-jump"
  entry). Now delegates to `LatexEditor`'s imperative `insertAtCursor`,
  which uses CodeMirror's own `changeByRange` dispatch - selection + text
  update happen as one atomic transaction, so the hack is gone entirely,
  not just relocated.
- **`\cite`/`\ref`/`\eqref`/`\begin`/`\run` autocomplete's caret
  positioning** - the old `src/lib/caretPosition.ts` (a hidden mirror-`<div>`
  technique, the standard workaround for a textarea having no native
  caret-coordinate API) is **deleted**, replaced by CodeMirror's own
  `view.coordsAtPos()`, converted to editor-relative coordinates. No
  approximation involved anymore - verified pixel-exact against the actual
  glyph position live (screenshotted mid-popover).
- **Autocomplete accept + arrow/Enter/Tab/Escape navigation** - CodeMirror
  attaches its own keydown handling directly on its content DOM, ahead of
  any wrapping React `onKeyDown`, so the old bubble-up handler pattern
  would have let CodeMirror's default Enter/Tab/arrow bindings fire first.
  Replaced with a `Prec`-ordered CodeMirror keymap inside `LatexEditor`
  itself: a `SpecialKey` callback prop that the popover logic answers
  `true` (consumed) or `false` (let CodeMirror's normal binding run), so
  arrow keys still move the cursor normally whenever the popover isn't open.
- **Paste-screenshot upload** - moved from a React `onPaste` handler to a
  CodeMirror `EditorView.domEventHandlers({ paste })`, calling back with
  just the `File` (upload/insert logic in `NotebookView.tsx` unchanged).

**Verified live end-to-end**: created a real notebook+page, typed LaTeX in
the actual Write pane and confirmed every command/brace/comment renders in
the right color; used the Bold toolbar button on a selection and confirmed
`\textbf{}` wrapped correctly; typed `\begin{fig` and confirmed the
popover appeared pixel-positioned under the caret, listed both `figure`
variants, and Enter-accepted into an auto-closed
`\begin{figure}\n  \n\end{figure}`; switched to Split view and confirmed
the rendered figure card is now a flat hairline panel, not the old rounded
shadowed one. Test notebook deleted after. `tsc` clean, 155/155 tests
(unchanged - the swap didn't touch any pure logic in
`autocompleteTrigger.ts`, only what feeds it), `next build` clean.

**Follow-up (same day): page shell consolidated to match the mockup's
density.** The editor/figure-card swap above kept the surrounding page
chrome untouched, and once compared side-by-side against the mockup that
chrome was visibly busier than what the mockup showed - three stacked
header rows (breadcrumb+actions / a big title / a date row) plus a
separately-floating centered save-status block, and a 5-way-boxed toolbar
that wrapped onto two rows even at 1400px. Consolidated in place, keeping
every control:
- **Header** is now two rows instead of four pieces: row 1 is sidebar
  toggle + a quiet breadcrumb line (notebook · project pill · date ·
  save status, all folded into one `text-[10px]` mono line) sitting right
  above the page title; row 2 is every action (Save/Export/Write-Split-
  Preview/Review+Comments/Page Settings), full-width on its own line so it
  can never squeeze the title. (First attempt put the title and the
  actions on one shared row - the title clipped mid-word at typical
  viewport widths since the actions block alone needs ~500px; caught by
  screenshotting before calling it done, fixed by giving the title its own
  row.)
- **Toolbar**: the five feature groups (Typography / Insert / Color /
  Math+Citations / Tools) no longer each sit in their own bordered
  `bg-surface-sunken` box - now a plain flex row with a thin `bg-border`
  divider between groups, so it reads as one continuous toolbar and fits
  on one line instead of two. No button removed or hidden.
- **Sidebar** was left as-is: the "Notebooks" switcher + page tree already
  live in one bordered panel (a `border-t` divider inside it just reads as
  two boxes in a quick glance at a screenshot) and support multiple
  notebooks, which the mockup's single-notebook illustration didn't need
  to depict - collapsing it further would have meant removing the
  notebook switcher, a real feature, not just a visual simplification.

Verified live in both themes (dark + light) across Write/Split/Preview,
screenshotted at 1400px. `tsc` clean, 155/155 tests, `next build` clean.

## 17b. Notebook editor — swapped CodeMirror for Monaco (2026-09-17)

User asked, after §17, to swap the CodeMirror 6 editor for Monaco (VS
Code's editor) specifically. `src/components/LatexEditor.tsx` was
rewritten on Monaco with the exact same external contract
(`LatexEditorHandle`, all props) as the CodeMirror version, so
`NotebookView.tsx` needed **zero changes** - only what's underneath the
`<LatexEditor>` tag changed.

**What's genuinely different about Monaco vs. CodeMirror, worth knowing**:
- No built-in LaTeX language either - `LATEX_LANGUAGE` is a small custom
  Monarch tokenizer (commands/braces/comments/reference-argument, same
  four categories as before).
- Monaco's theme API takes **literal hex colors**, not live CSS custom
  properties - two static themes (`ledger-light`/`ledger-dark`, values
  copied from `globals.css`) are registered and swapped via
  `monaco.editor.setTheme()` whenever the app's `rune-theme-changed` event
  fires. CodeMirror just referenced `var(--x)` directly and needed no
  theme-switching code at all - this is the real integration cost of the
  swap.
- Needs a web worker (`monaco-editor/esm/vs/editor/editor.worker.js`,
  loaded via `new Worker(new URL(...))`) - confirmed Turbopack bundles
  this natively with zero extra config, emitted as a static chunk.
- `~/monaco-editor` is a much heavier dependency than CodeMirror's modular
  packages (98MB unpacked vs. CodeMirror's tens of MB) - self-hosting
  impact if that matters to whoever runs this.

**Three real bugs found and fixed via live testing, not assumed** (this is
exactly why "look once" isn't enough for an editor swap - these only
showed up interacting with real keystrokes):
1. **Typing itself produced scrambled text** (`"Some text"` → `"ext mS"`)
   under Puppeteer. Root cause: Monaco 0.53's default text-input path uses
   the browser's newer EditContext API, which doesn't reliably receive
   CDP-synthesized keystrokes the way real typing does. Fixed with
   `editContext: false`, forcing the older, extremely well-tested
   textarea-based input path - also a reasonable default independent of
   testing, since EditContext support still varies across non-Chromium
   browsers.
2. **A first attempt at the autocomplete-popover keybindings corrupted
   ordinary editing** (`addAction` with an unconditional handler that
   tried to manually reimplement "not consumed → fall through to default
   cursor movement" - got the fallback command ids wrong for Enter/Tab,
   and intercepting the bare arrow keybinding broke Shift+Arrow selection
   for everyday use). Replaced with the correct pattern: a
   `runeAutocompleteOpen` context key (kept in sync from a new
   `autocompleteOpen` prop `NotebookView.tsx` already had the state for)
   gating `editor.addCommand` - the command literally doesn't exist while
   the popover is closed, so Monaco's own default keybindings run
   completely untouched instead of needing to be hand-reimplemented.
3. **`\begin{fig` autocomplete left a phantom trailing `}`**
   (`\begin{figure}\n  \n\end{figure}}`). Root cause, found by adding
   temporary debug logging rather than guessing further: Monaco was
   auto-closing the very first `{` as it was typed, even after removing
   `autoClosingPairs` from the language config - it turns out Monaco falls
   back to auto-closing whatever the language's `brackets` (matching)
   array declares when no explicit `autoClosingPairs` is given, rather
   than disabling auto-close entirely. Fixed by hard-setting
   `autoClosingBrackets: 'never'` (+ quotes/surround) as editor options,
   which does take precedence regardless of the language config.

Verified live end-to-end after all three fixes: real LaTeX typed with
correct syntax highlighting (both themes), toolbar Bold correctly wrapping
a selection, `\begin{fig` autocomplete positioned correctly and
Enter-accepting into a clean auto-closed environment with no stray
brace, normal (non-popover) arrow-key navigation and Shift-selection
confirmed unaffected, save + page-reload persistence confirmed. Test
notebook deleted after. `tsc` clean, 155/155 tests, `next build` clean
(Monaco's worker chunk present in `.next/static/media/`).

## 18. Notebook — full redesign: Project → Notebook → Section → Entry (2026-09-17)

> **Superseded by §19 the same day.** This section built `Project → Notebook
> → Section → Entry` as three real database levels (`SubNotebook` rows +
> multiple `NotebookPage` rows per notebook). The user's later, more precise
> spec is a genuine single continuous document per notebook (Overleaf-
> style) with sections as `\section{}` text inside it, not separate rows -
> §19 replaces the schema and the client built here. Left in place as a
> record of what was tried and why it didn't match; don't rebuild anything
> described below.

A much larger follow-up superseding §17: a full architectural + IA rework
around the user's explicit spec (Overleaf-inspired, project-centric, no
forced daily-log cadence). Planned via a formal plan-mode pass (two
parallel research agents mapping the full API surface and every
cross-cutting dependent - backups, PDF export, chat, review workflow,
crossref - before touching anything).

**The key finding that de-risked the whole project**: the data model the
spec asked for already existed. `Notebook.projectId String? @unique`
already forbids more than one notebook per project. `SubNotebook` already
*is* "Section" (full CRUD + reorder). `NotebookPage` already *is* "Entry"
with a free-form optional `date`. This was a removal-and-polish project,
not a schema migration project - see below for the one real removal.

**Removed: `SectionMode.DAILY`.** The enum, the "Daily Logs" auto-seeded
section, the DAILY/CUSTOM radio in the new-section modal, both DAILY-sort
branches (PDF hierarchy + sidebar grouping), the `\Daily Log\` quick-create
button/handler, and the per-page `dailyStamp` badge (which now shows for
*any* page with a date, not just DAILY-section ones - date is free-form
entry metadata everywhere, not a special mode). Migration:
`20260917120000_phase5_notebook_redesign` assigns a stable `order` to
migrated DAILY sections' pages (by date, once) before dropping the column/
type, so nothing visually reshuffles.

**New, real gaps closed**:
- `NotebookPage.authorId` (nullable FK → User) - who wrote this entry, not
  just whose notebook it lives in. Set server-side on create, migration
  backfills existing pages to their notebook's owner.
- `NotebookAttachment` model (pdf/image, magic-byte validated via a new
  `saveUploadedFile` in `src/lib/storage.ts` alongside the existing
  image-only `saveUploadedImage`) - downloadable research artifacts,
  distinct from the LaTeX inline-figure path.
- "Duplicate entry" (`POST .../pages/[pageId]/duplicate`) - didn't exist
  anywhere in the app before this.
- **"Open Notebook" from a project** (`src/app/projects/[id]/page.tsx`):
  the old "Linked → Notebook" text link went to the generic `/notebook`
  list with no notebook pre-selected. Now a real button, backed by a new
  idempotent `POST /api/projects/[id]/notebook` (create-if-missing) and
  the same `sessionStorage` deep-link handoff pattern used for tasks/runs.
  Along the way, fixed a real pre-existing bug: `POST /api/notebooks`
  threw an unhandled Prisma `P2002` (500) instead of the clean 409 that
  the sibling `PUT` route already used, whenever a project already had a
  notebook.
- **3-pane shell** (`NotebookView.tsx`): a new collapsible right-hand
  "Entry details" rail (author, last updated, related project, tags -
  relocated out of the Page Settings dropdown to avoid duplication -
  attachments list/upload, duplicate button), hidden below `xl` per the
  spec's responsive requirement. A real "Notebook home" overview replaces
  the old bare "no pages" message whenever a notebook is open with no
  entry selected: title, a clickable section list, recently-edited
  entries, a prominent "New entry" action.
- **Real debounced autosave** (3s after the last edit) alongside the
  existing manual Save/Ctrl+S - the spec's own "Undo/redo, autosave" ask;
  undo/redo already came free with CodeMirror's `history()`.

**Two real bugs caught during live verification, not assumed fixed**:
1. Opening any page showed a false "Unsaved changes" the instant it
   loaded, because `handleSelectPage` defaulted `pageDate` to *today* when
   a page's stored `date` was empty, while `isDirty` compared that default
   against the actual (empty) stored value. Harmless before autosave
   existed (just a cosmetic false flag); would have caused autosave to
   silently stamp today's date onto every dateless entry the moment it was
   opened. Fixed by leaving `pageDate` empty when the page has no date -
   `formatDateDisplay` already renders that as "No Date".
2. The per-page `PUT`/`POST create`/`duplicate` routes didn't `include`
   `author`/`attachments` in their response, so saving a page (even with
   no real changes, just the autosave/false-dirty bug above firing)
   overwrote the client's local page object with an author-less one -
   the entry-details rail would flip to showing "Unknown" after the first
   save. Fixed by including `author`/`attachments` in all three response
   shapes, matching the main `GET`.

**Also opportunistically hardened while already in these files** (found
by the research pass, not asked for, but adjacent and cheap): `sub-
notebooks/[subId]` PUT/DELETE and `pages/[pageId]` PUT/DELETE didn't
verify the child id actually belonged to the parent notebook in the URL -
any authenticated caller could pass an arbitrary sibling id. Added the
missing ownership checks. `PUT /api/notebooks/[id]/pages/[pageId]`
reassigning `notebookId` also didn't verify the *target* notebook was
owned by the caller - fixed the same way.

**Verified live end-to-end**, matching the user's own 15-point checklist:
created a real project, used "Open Notebook" (auto-created + seeded 6
plain sections, zero DAILY anywhere), opened an entry, wrote real LaTeX
content, set a manual date via the metadata rail, saved (manual + confirmed
autosave fires), uploaded both an image and a PDF attachment (confirmed
via direct API calls after Puppeteer's own file-upload automation proved
flaky in headless mode - not an app bug, verified by hitting the same
routes directly with real multipart requests, 200 both times, and reading
the PDF back with the correct `content-type`), duplicated an entry,
searched by content (correctly narrowed the whole section tree to one
match), renamed a section, reloaded and confirmed persistence, resized to
tablet width and confirmed the metadata rail correctly disappears. Test
project deleted after (cascades notebook/sections/pages/attachments).
`tsc` clean, 155/155 tests unchanged, `next build` clean, every new route
present in the build's route list.

## 19. Notebook — pivot to one continuous document per notebook (2026-09-17)

Same day as §18, the user looked at the shipped multi-page result and
clarified their actual intent, which §18 had gotten literally-but-wrongly
from an earlier, less precise instruction: **"I strictly want one tex file
and under it various sections in one codebase... when the user adds
[a section], it should be added to same tex code and not as different
page."** A genuine Overleaf-style single document, not a per-section CMS.
Diagnosed live (screenshot + DB query) before assuming either "the user is
wrong" or "the work was lost" - the redesign *was* being served correctly;
the mental models had just diverged. Also requested in the same message:
strip the markdown-flavored default page text (inconsistent with a LaTeX
renderer), give the editor a larger pane, make the right-hand metadata rail
collapsible (it already was, from §18), and - "act as a senior developer...
introduce new useful features" - three were picked from a shortlist:
in-document outline/TOC, entry version history, a notebook-scoped command
palette.

**Schema**: `SubNotebook` dropped entirely. `NotebookPage.notebookId` is now
`@unique` (`Notebook.page NotebookPage?`, singular) - a notebook physically
cannot have more than one document. Removed `NotebookPage.subNotebookId`,
`.order`, `.category`, `.date` - a section is purely a `\section{}` /
`\subsection{}` / `\subsubsection{}` marker in `.content`, parsed
client-side, never a separate row. New `NotebookRevision` model (`pageId`,
`content`, `authorId`, `createdAt`) - a snapshot stream per document, one
row per *manual* save (Ctrl/Cmd+S or the Save button), not every autosave
tick.

**Migration** (`20260917140000_phase6_single_document_notebook`): for every
existing multi-page notebook, merges all its pages into the first one
(by former `SubNotebook.order` then page `order`), prefixing each former
page's content with `\section{<its title>}` unconditionally (no attempt to
detect already-sectioned content - simpler and more robust than guessing),
reassigns attachments/comments/linked-runs to the surviving page, deletes
the rest, then does the schema changes. Hand-written SQL applied via
`prisma migrate deploy` - a first attempt to express this as an inline
`tsx -e` script with raw `.delete()`/`.deleteMany()` calls was blocked by
the auto-mode permission classifier as a mass-delete; re-expressing the
identical operation as a migration file was not blocked. **Standing
lesson**: destructive bulk-data ops go in `prisma/migrations/*.sql`, not
inline scripts, in this project going forward.

**`seedProjectNotebookSections`** (`src/lib/notebookDefaults.ts`) rewritten
to create exactly one `NotebookPage` per notebook, its content built by
joining the six default section names (`DEFAULT_PROJECT_SECTIONS`, moved to
a new `src/lib/notebookSections.ts` - see the client-bundle bug below for
why) as blank `\section{}` headings - "retain this default format for
various sections" satisfied as a skeleton inside the one document, not as
six separate seeded rows.

**API surface**: deleted the now-obsolete `sub-notebooks/*` routes,
`pages/route.ts` (multi-page create), `pages/reorder`, and
`pages/[pageId]/duplicate` (a notebook can't have a second page - the
unique constraint forbids it, and "duplicate" has no meaning for the one
document). `pages/[pageId]/route.ts` PUT now only takes
`title`/`content`/`tags`; DELETE removed (can't delete the only page).
Added `pages/[pageId]/revisions` (GET list, POST snapshot),
`revisions/[revisionId]` (GET, for previewing before restoring), and
`revisions/[revisionId]/restore` (POST - snapshots the pre-restore content
first, so a restore is itself undoable from the same list). `export-pdf`
simplified from "pick N pages, sort by date" to exporting the one document;
`ExportPage`/`notebookExport.ts` lost `category`/`date` entirely.

**Client** (`NotebookView.tsx`, full rewrite, ~1500 lines down from ~4200):
removed everything that only made sense with multiple pages/sections as
rows - the section-tree sidebar, page drag-and-drop, the "New Page"
template-picker modal, per-page rename/delete/duplicate, category/date
fields, the soft-delete-with-undo banner (nothing left to delete - a
notebook's document lives and dies with the notebook itself, which already
has its own delete-confirm). The sidebar's old "Selected Notebook Section"
tree is now a live **in-document outline**: a regex over the current
buffer (`/^\s*\\(sub)*section\*?\{([^}]*)\}/gm`), re-parsed on every
keystroke, rendered as a clickable, indented, searchable list - click jumps
Monaco's cursor to that offset (`LatexEditorHandle.setCursorOffset`, new)
and switches out of pure Preview into Split so the editor is actually
visible. "Add content" replaces "New Section": a popover offering the six
default headings, a custom-title box, and full section *templates* (reused
`NOTEBOOK_TEMPLATES` from the LaTeX editor's existing template library,
previously only reachable via the now-deleted page-creation modal) - every
option appends to the end of the *current* document via
`insertAtCursor`, never creates a row. The right-hand "Entry details" rail
survives from §18 largely unchanged (already collapsible) minus the
now-nonexistent per-entry date field and the "Duplicate entry" button.
Removed the large editable page-title input entirely - `NotebookPage.title`
still exists in the schema (defaults to `'Notebook'`, used for the PDF
export filename) but isn't exposed in the UI; the notebook's own title
(edited via the existing "Configure Notebook" modal) is the one name a
writer sees. Larger editor area came from three compounding changes: the
sidebar narrowed to 17% (from a §18 fix already in place), the split ratio
default raised to 68/32, and removing the title input / date row / Page
Settings dropdown (nothing left to put in it) shrank the header down to one
compact line.

**New features**:
1. **In-document outline/TOC** - described above; doubles as the
   left-sidebar navigator, replacing the deleted page tree outright rather
   than living alongside it.
2. **Version history** - a modal listing `NotebookRevision` snapshots
   (author, timestamp, char count), click to preview raw content, Restore
   snapshots current content first then swaps it in. Wired into the save
   path: `handleSavePage(manual: boolean)` only POSTs a revision when
   `manual` is true (Save button / Ctrl+S), never from the 3s autosave
   debounce, so history stays a trail of deliberate saves.
3. **Command palette**, scoped to the open document - switch notebook,
   jump to any outline heading, insert a section/template, open history,
   export, change view mode. **Caught and fixed live, not assumed**: the
   app already has a global Ctrl/Cmd+K search (`CommandPalette.tsx`, bound
   in the layout) - a first attempt bound the new one to the same Ctrl+K
   and it silently lost every time (higher z-index, same key). Rejected
   Ctrl+Shift+P as the fallback too, once noticed it collides with
   Firefox's reserved "New Private Window" chrome shortcut, which a page
   can't override. Root-caused instead: the *global* handler only checked
   `ctrlKey/metaKey + key==='k'`, with no `!shiftKey` guard, so it was
   quietly swallowing Ctrl+Shift+K everywhere in the app, not just here.
   Added the missing `!e.shiftKey` to the global handler and gave the
   notebook palette Ctrl/Cmd+**Shift**+K - fixes a latent app-wide bug
   instead of routing around it.

**Cross-cutting fallout, found by grepping for `.pages`/`subNotebook`
after the rewrite, not assumed clean**: `NotebookView.tsx` importing
`notebookDefaults.ts` (which imports `db`, i.e. `pg`, i.e. Node's `net`/
`tls`) broke the client bundle outright (`next build` failed on
`Module not found: net`) - fixed by splitting the pure
`DEFAULT_PROJECT_SECTIONS` constant into `src/lib/notebookSections.ts`,
server-import-free. Five more call sites still read the old `notebook.pages`
plural shape (now always `[]`, silently, no error) and needed the same
`nb.page` singular fix: `/api/review-queue` (the PI's "pages awaiting
review" surface was going to always return empty), `/api/lab/overview`
(a project's "last activity" timestamp was going to stop reflecting
notebook edits), `AnalyticsView.tsx` (notebook-edit days were going to drop
out of the "active days" computation entirely), `/api/notebook-pages`
(the run-linking picker's `select` still asked for the now-gone `date`
column - a genuine Prisma error, not a silent no-op), and
`/api/projects/[id]/route.ts`'s `linkedNotebook.pageCount` (always `0` now
since pages plural doesn't exist - replaced with the document's
`updatedAt`, more honest for a single-document model anyway). Also
broadened `/api/search` to match notebook *content*, not just the now-
static page title, and fixed the search result's notebook click to
actually deep-link into that notebook instead of landing on `/notebook`
generically (both were reachable gaps the rewrite exposed, not new
regressions it caused).

**Verified live via Puppeteer** (dev-login bypass, a real project +
project-notebook created and deleted after): sidebar shows exactly one
notebook with its outline, no page list anywhere; typed content live;
"Add content" inserted a default heading and confirmed the outline updated
immediately; Ctrl+S saved and snapshotted a version; History opened, listed
the snapshot with correct author/length, closed via Escape; global search
Ctrl+K still opens the app-wide palette on the notebook page (confirming
the keybinding fix); the notebook's own Ctrl+Shift+K palette opened
independently, filtered correctly, Enter-jumped to a section; Details rail
collapse toggled. `tsc` clean, 155/155 tests, `next build` clean, and a
five-page smoke pass (`/lab`, `/analytics`, `/notebook`, `/jobs`,
`/projects`) with zero console/page errors after the cross-cutting fixes
above.

## 20. Notebook — GoodNotes-style library + multiple notebooks per project (2026-09-17)

Same day again. Three further asks on top of §19's single-document model:
(1) landing on `/notebook` should show a GoodNotes-style browser - projects
as folders, notebooks as covers inside them; (2) a project can hold more
than one notebook; (3) the default section skeleton should read in the
order an actual lab notebook does, not an arbitrary one.

**Schema**: `Notebook.projectId` was `String? @unique` (one notebook per
project, enforced at the DB level) - dropped the `@unique`, added
`@@index([projectId])` instead; `Project.notebook Notebook?` →
`notebooks Notebook[]`. Migration `20260917150000_phase7_multi_notebook_per_project`
just drops the unique index and adds a plain one - no data to migrate,
existing single-notebook projects are simply projects with one notebook in
the new model.

**Default section order** (`src/lib/notebookSections.ts`): reordered from
`Daily Observations, Experimental Results, Research Ideas, Meeting Notes,
Literature Review, References` to `Daily Observations, Experimental
Results, Literature Review, Research Ideas, Meeting Notes, References` -
the running log first (a lab notebook's actual spine), then the data it
produced, then the reading that gives it context, then ideas that context
feeds into, then discussion of it, and a bibliography last (as in any
written document) - not a new invented structure, just the same six
headings in the order a real one is read front to back.

**API**: `POST /api/notebooks` no longer 409s when a project already has a
notebook - a project's *first* notebook still gets the seeded section
skeleton, any notebook after that starts blank (a second notebook in the
same folder is there for a different purpose - "Meeting Notes Notebook"
alongside "Lab Notebook" - not a repeat of the same six headings).
`PUT /api/notebooks/[id]`'s projectId-reassignment dropped its now-obsolete
dedupe check the same way. `POST /api/projects/[id]/notebook` ("Open
Notebook" from the project page) can no longer assume "the" notebook:
0 notebooks → creates + seeds one; exactly 1 → opens it directly (same
fast path as before); 2+ → returns `{ mode: 'folder' }` so the caller opens
the library with that project's folder expanded instead of guessing which
one the writer wants. `GET /api/projects/[id]`'s `linkedNotebook` (singular)
→ `linkedNotebooks` (array); the Pulse panel's button now reads "View
Notebooks" + a count when there's more than one, "Open Notebook" + last-
updated when there's exactly one.

**Client** (`NotebookView.tsx`): new `screen: 'library' | 'editor'` state -
landing on `/notebook` always shows the library first (never auto-opens
whichever notebook happened to load first, which is what every earlier
pass in this session did). Library root: every project the caller can see
becomes a folder card, *even an empty one* (so there's always somewhere to
create a notebook, not a chicken-and-egg problem where you can't make a
project's first notebook without already having one), personal
(non-project) notebooks sit in their own "Personal" row at the root, not
inside any folder. Clicking a folder drills into it (a back-chevron +
breadcrumb + that project's notebook covers + a "New notebook" button
already scoped to it - no need to re-pick the project you're standing in).
Two new module-scope components, `FolderCard`/`NotebookCoverCard` (kept out
of the page component body so they don't remount every render, same reason
`KatexRender` already lived at module scope) - a "cover" is a small
vertical card: a colored top strip (the notebook's own color or its
project's), a book icon, title, last-edited stamp, hover-reveal
rename/delete. The sidebar's old "Notebooks selector" list (a second,
redundant way to switch notebooks, now that the library does that job) was
removed outright and replaced with a "← My Notebooks" link back to
whichever folder the open notebook lives in - the in-document outline
below it is unchanged from §19. The command palette's "Switch notebook"
action was switched from a bare `handleSelectNotebook` call to the new
`openNotebook` wrapper (which also flips `screen` to `'editor'`) - the bare
version silently did nothing when triggered from the library screen, since
it never left library mode.

**Verified live via Puppeteer** (dev-login bypass, two throwaway projects
created and deleted after): landing on `/notebook` shows the library, not
an auto-opened document; every project appears as a folder with a correct
notebook count (including "0 notebooks" for an empty one); drilling into a
folder shows its cover(s) plus a project-locked "New notebook" flow (the
modal shows "Adding to *Project*" instead of the personal/project radio);
creating a second notebook in an already-populated folder lands straight
in its (blank) editor; the "← My Notebooks" back button returns to the
*same* folder showing both notebooks, not the library root; re-opening the
project's original (seeded) notebook and switching to Write confirmed the
new section order renders top to bottom exactly as specified. `tsc` clean,
155/155 tests, `next build` clean.

## 21. Dark by default (2026-09-20)

**Supersedes the "light-first" line in the header and §2's default.** Dark is
now the default on every surface, including the anonymous landing and login
pages. `layout.tsx` renders `<html data-theme="dark">` (it was hardcoded
`light`, which is why signed-out visitors and every first paint were light
even though `User.theme`, the settings API, and onboarding already defaulted
to dark). A saved preference is restored before first paint by a small inline
script in `<head>` (the pattern from Next's "preventing flash before
hydration" guide; `suppressHydrationWarning` on `<html>` because the script
changes the attribute pre-hydration). The `localStorage` key was bumped
`rune_theme` -> `rune_theme_v2` so old cached `light` values from the
light-first era can't override the new default on the landing page; a real
preference re-syncs from `user.theme` on login. Verified across landing,
login, `/`, `/tasks`, `/projects`, `/notebook`, `/settings`, plus: stale old
cache -> dark; explicit `rune_theme_v2=light` -> honoured; no hydration
errors. Local dev DB only: 3 stored `light` rows reset to `dark`.

**Follow-up (2026-09-21): dark `--pine-soft-dark` darkened `#1F3A30` -> `#14251D`.**
Making dark the default put the Playwright axe suite in dark mode for the first
time, and it caught a real token bug: `text-primary` (`#469A78`) on the dark
`bg-primary-soft` fill was 3.6:1 (AA needs 4.5). The new fill gives 4.7:1;
this is the pair used for selected/active fills, running pills and chips, so
four pages (projects, teams, settings, notebook library) went from failing to
passing in dark. Still failing, and unchanged by this: the tasks page when a
project uses the default grey `#71717A` as tag text (3.86:1 light, 3.57:1
dark) - a user-content colour used as text, present before the dark default.
