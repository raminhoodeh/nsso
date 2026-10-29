import { cn } from '@/lib/utils'
import { LIGHT_PANEL } from './light-panel'

/** Native controls share the supplied material and the scene's lens registry. */
export const lightButtonClass = cn(
    LIGHT_PANEL.control,
    LIGHT_PANEL.focus,
    'nsso-white-control inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium [text-shadow:none] [color-scheme:light] disabled:cursor-not-allowed aria-disabled:cursor-wait aria-disabled:opacity-50 focus-visible:shadow-[0_0_0_6px_rgba(255,255,255,0.9)] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-slate-950 has-[:focus-visible]:shadow-[0_0_0_6px_rgba(255,255,255,0.9)]',
)
