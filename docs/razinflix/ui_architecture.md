# RazinFlix UI & Interaction Architecture

## 1. Overview
The RazinFlix frontend uses a Next.js App Router paradigm, optimized deeply for Mobile-Native presentation constraints. It borrows visual elements from the "Liquid Glass" NSSO design system while strictly mimicking standard Netflix layout algorithms and iOS Safari bottom-sheet gestures.

## 2. Dynamic Categories & Layout Physics

### `page.tsx`
- **Dynamic Category Grouping**: Derives horizontal carousels algorithmically from the database's `categories` string array. Zero hard-coded assumptions exist, allowing backend Node scripts to alter topologies remotely.
- **Organic Sweeping (Thin Category Optimization)**: When `page.tsx` renders groupings, it executes an organic post-processing sweep across the `useMemo` category block. Any category returning fewer than 5 films natively dissolves itself entirely. All "orphaned" films drop smoothly into an agnostic master block ("Visually Striking Emotional Dramas") so the UI grid always appears 100% thick and continuously mapped.
- **Mobile Grid Padding Constraints**: A unique `pt-44 md:pt-24` conditional layout wrapper exists inside the core view list to aggressively ensure standard `A-Z` Grid displays are mapped cleanly beneath the absolute layout hooks of the blue "+ Add Film" trigger on iOS viewports. 
- **Desktop Mute Binding**: On Desktop viewports (`>=768px`), the entire Hero background acts as a global Volume Toggle, mapping state sequentially to `mute={isHeroMuted ? 1 : 0}` in the iframe string. Uses modulo math for infinite array navigation via Chevrons.

### `MovieModal.tsx`
- **Strict Domain Rendering Bypass**: The Similar Films and core Background poster headers leverage `unoptimized={true}` parameter keys natively embedded directly inside Next.js `<Image>` attributes. This permanently fixes strict caching domain whitelists that regularly break unvalidated cloud links running off arbitrary Supabase buckets. 
- **Navigation Physics**: Modals are unbolted from document scrolling by forcing `document.body.style.overflow = 'hidden'`, while ensuring the Modal container itself manages `.no-scrollbar` overflow tracking.
- **Category Edit Matrix**: When placed in "Edit" state, static category taxonomy tags dissolve and render into a physical dropdown `<select>` block prepopulated strictly with 14 approved variables. The API aggressively blocks non-system payloads.
- **Deletion Protocols**: Destructive database deletions (using lucide `Trash2` icon) trigger frontend callback hooks `onDelete={(id)}` executing recursive sweeps against the physical `films[]` state tree, allowing instant film removal without waiting for browser refreshes.

## 3. Administrative Auth & Self-Healing Constraints

### Native Auth Verification Limits
Any destructive behavior natively deployed to the dashboard hooks (such as triggering the Edit modal block via the `Edit2` pen, or engaging the `Add Film` prompt) relies on a native `window.prompt` intersection loop. 
Administrators MUST pass case-insensitive validation for string `azinam` before system state handlers `setIsEditing()` or `setIsAddModalOpen()` trigger to `true`. This locks the frontend securely.

### Update Mode & Self-Healing Poster Validation
The frontend relies on an "Update Mode" string in `viewMode` for systematic database curation. Rather than relying solely on arbitrary manual sorting, this engine programmatically forces titles that require immediate metadata polishing (missing posters, missing trailers) to the absolute top grid index.
