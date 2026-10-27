import { TahoeBackdropHeader, type TahoeBackdropHeaderProps } from '@/components/ui/tahoe-glass'
import { cn } from '@/lib/utils'

export const NSSO_TOPBAR_CONTENT_CLASS = 'relative z-[60] mx-auto flex h-[calc(88px+env(safe-area-inset-top))] max-w-[1800px] items-center justify-between pb-0 pl-[max(12px,env(safe-area-inset-left))] pr-[max(12px,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)] sm:pl-[max(24px,env(safe-area-inset-left))] sm:pr-[max(24px,env(safe-area-inset-right))] lg:px-10'

type NssoTopBarProps = Omit<TahoeBackdropHeaderProps, 'radius' | 'tone' | 'chromiumAppearance' | 'displacementProfile' | 'materialLighting'>

/** Shared material and geometry for core nsso top bars, including profile preview. */
export default function NssoTopBar({ className, ...props }: NssoTopBarProps) {
    return <TahoeBackdropHeader
        {...props}
        data-nsso-topbar="true"
        className={cn('nsso-topbar-glass fixed top-0 left-0 right-0 z-[5000]', className)}
        radius="0 0 24px 24px"
        chromiumAppearance="light"
        tone="dark"
        displacementProfile="prism-top"
        materialLighting="uniform"
    />
}
