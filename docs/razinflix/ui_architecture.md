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
All strings piped into Movie Title Nodes enforce CSS `.capitalize`. SVG icon spacing uses `flex-shrink-0` to guarantee grid alignment irrespective of typography wrapping in CTA buttons.
