## Add "Indigo" theme — fully isolated 5th option

> Historical plan — implemented under the working name "PrototypeLovable" and shipped as **Indigo**. References below use the final theme names ("Blue" → "Ocean", "PrototypeLovable" → "Indigo"). Indigo was later replaced entirely by **Sunset**, a light theme with a purple-to-pink gradient — the dark glassmorphism/depth design described below is no longer in the app.

A new opt-in theme. Zero changes to existing themes (Black/Gray/Light/Ocean), zero changes to app logic, zero changes to Scan AVS / Gemini integration, zero changes to My Day ↔ Calendar sync.

### Files touched (only 3)

**1. `src/lib/theme.ts`** — append, do not modify existing entries
- Extend `Theme` union: `"black" | "gray" | "light" | "ocean" | "indigo"`
- Add `{ id: "indigo", label: "Indigo" }` to `THEMES` array
- Add `"indigo"` to the `getStoredTheme` validation check
- `applyTheme` already handles arbitrary ids via `setAttribute` — keeps `dark` class (treated as a dark theme)

**2. `src/styles.css`** — append a new block at the very bottom
- All rules scoped under `[data-theme="indigo"]` — cannot leak to other themes
- Defines its own color tokens (background, card, card-elevated, border, etc.)
- Adds depth via stronger `--card-shadow` / `--card-shadow-lg` (3-tier elevation)
- Selective glassmorphism: `backdrop-filter: blur()` only on `aside`, bottom nav (`nav.fixed`), and `[role="dialog"]`
- Subtle radial gradient body background (adaptive feel)
- CSS-only `@keyframes proto-rise` applied to `[data-theme="indigo"] [data-app-shell] > *` for staggered fade-in on mount — no JS, no Framer Motion changes
- Typography: enables Inter stylistic sets via `font-feature-settings` on body when this theme is active. Does NOT change `--font-sans` globally.

**3. `src/routes/settings.tsx`** — no code change required
- Settings already maps over `THEMES` from `src/lib/theme.ts`, so the new option appears automatically. (Will verify by reading the file before edit; if it hardcodes 4 themes, add the 5th button in the same `THEMES.map` pattern.)

### Files NOT touched
- `src/routes/scan.tsx`, `src/services/VLMService.ts`, `netlify/functions/process-avs.ts` — Gemini/AVS untouched
- `src/hooks/useTasks.ts`, `useCalendarTasks.ts`, `useCalendarEvents.ts` — data sync untouched
- `src/routes/calendar.tsx`, `src/routes/index.tsx`, `src/routes/updates.tsx` — view logic untouched
- `src/components/AddButton.tsx`, `TaskCard.tsx`, all UI components — untouched (the SHADOW map in AddButton keeps its 4 entries; Indigo theme will fall back to the `black` entry for that one button, OR I'll add a 5th entry — confirming during implementation, no behavior change to other themes either way)
- All existing `[data-theme="..."]` CSS blocks — untouched

### Safety guarantees
- New theme is opt-in via Settings; default remains whatever the user currently has
- If user never selects Indigo, not a single pixel changes anywhere in the app
- Selecting it then switching back is bit-identical to the previous state
- No new dependencies, no package.json changes
- No SSR/runtime risk — pure CSS + a 1-line union extension

### Deliverable
A 5th theme button labeled **"Indigo"** in Settings. Selecting it applies the new depth, glass, gradient, and stagger-in look across the app. Deselecting returns to identical prior behavior.