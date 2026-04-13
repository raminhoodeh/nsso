# RazinFlix UI & Interaction Architecture

## 1. Overview
The RazinFlix frontend uses a Next.js App Router paradigm, optimized deeply for Mobile-Native presentation constraints. It borrows visual elements from the "Liquid Glass" NSSO design system while strictly mimicking standard Netflix layout algorithms and iOS Safari bottom-sheet gestures.

## 2. Core Components

### `page.tsx`
- **Dynamic Category Grouping**: Derives horizontal carousels algorithmically from the database's `categories` string array. Zero hard-coded assumptions exists, allowing backend Node scripts to alter topologies remotely.
- **Hero Billboard**: Features an inline algorithmic `featuredFilms` selection. Uses the YouTube iframe API offset parameter `start=10` to bypass unskippable studio bumper logos.
- **Desktop Mute Binding**: On Desktop viewports (`>=768px`), the entire Hero background acts as a global Volume Toggle, mapping state sequentially to `mute={isHeroMuted ? 1 : 0}` in the iframe string. Uses modulo math for infinite array navigation via Chevrons.

### `MovieModal.tsx`
- **Mobile Sheet Boundaries**: Due to known defects in Safari 15+ computing `100vh`, the outermost Modal logic relies strictly on `100dvh` mapping paired with a hardware `bg-[#0c0c0e]` paint. The container is pushed to `bottom: 0` using `mt-auto flex-1` rendering rules, closing out the `env(safe-area-inset-bottom)` bleeding gaps.
- **Navigation Physics**: Modals are unbolted from document scrolling by forcing `document.body.style.overflow = 'hidden'`, while ensuring the Modal container itself manages `.no-scrollbar` overflow tracking.
- **Header Top-Bar Ergonomics**: The Native iPhone "Back" button and the Admin "Edit" blocks are integrated into a single unified top-bar matrix on mobile, reclaiming 100% of the typography description area space.
- **Desktop Expansion**: Desktop modal shells expand 45% horizontally (`max-w-[1600px]`) with a 20% reduced height footprint (`md:h-[50%]`) specifically to escalate the bounding volume of the Similar Films poster carousels underneath. Width vectors scale accordingly (`w-40`).

## 3. Topography Rules
## 4. Administrative Features

### Update Mode & Self-Healing Poster Validation
The frontend relies on an "Update Mode" string in `viewMode` for systematic database curation. Rather than relying solely on arbitrary manual sorting, this engine programmatically forces titles that require immediate metadata polishing (missing posters, missing trailers) to the absolute top grid index.

**Self-Healing Poster Validation Implementation:**
- **Dynamic Pinging:** Because static string heuristics (`N/A`, `placeholder`) cannot detect URL payloads that look correct but physically `404` at runtime, the mode executes a non-blocking `window.Image()` loop checking all fetched posters from the user's browser in batch groupings. 
- **Aggressive Timeouts:** To prevent asynchronous `Promise.all` stalls caused by completely dead or permanently-hanging remote image servers, a strict 4000ms unmount timeout is forced. Any image failing to emit an `onload` or `onerror` response within this window is forcefully marked as broken, ensuring completion on 100% of the dataset.
- **Vercel Cache-Bypass:** TMDB domains are passed with `unoptimized={true}` inside `next/image` tags (in `MovieCard`). Due to aggressive server-side rate limits, valid TMDB links frequently 504 on the Next.js `_next/image` proxy server while the underlying base-URL is completely healthy. Bypassing the optimization loop prevents healthy DB links from appearing completely blank or being falsely flagged by administrators.
