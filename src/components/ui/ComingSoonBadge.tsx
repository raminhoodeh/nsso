import { cn } from '@/lib/utils'
import { LIGHT_PANEL } from '@/components/ui/light-panel'

export default function ComingSoonBadge({ className }: { className?: string }) {
    return <span data-coming-soon-badge="true" className={cn(LIGHT_PANEL.group, 'inline-flex select-none items-center justify-center whitespace-nowrap rounded-full px-[10px] py-[3px] text-[10px] font-medium leading-[14px] text-slate-700', className)} style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>Coming soon</span>
}
