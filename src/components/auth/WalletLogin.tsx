import type { TahoeGlassContentTone } from '@/components/ui/tahoe-glass'

interface WalletLoginProps {
    tone?: TahoeGlassContentTone
}

export default function WalletLogin({ tone = 'light' }: WalletLoginProps) {
    return (
        <p role="note" className={`px-4 py-2 text-center text-[11px] leading-relaxed ${tone === 'dark' ? 'text-slate-950/80' : 'text-white/70'}`}>
            Web3 wallet sign-in and crypto payments are planned for a future release.
        </p>
    )
}
