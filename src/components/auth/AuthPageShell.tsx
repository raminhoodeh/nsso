import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import LightGlassPanel from '@/components/ui/LightGlassPanel'

interface AuthPageShellProps {
    title: string
    description: string
    children: ReactNode
}

/** The sign-in design is the shared visual contract for account entry pages. */
export default function AuthPageShell({ title, description, children }: AuthPageShellProps) {
    return (
        <main className="min-h-screen flex items-center justify-center px-6 py-12 relative overflow-hidden">
            <LightGlassPanel
                as="section"
                className="w-full max-w-[440px] p-8 lg:p-12 relative z-10"
                contentClassName="h-full w-full"
                data-auth-card="true"
            >
                <div className="text-center mb-8">
                    <Link href="/" className="inline-block" aria-label="nsso home">
                        <Image
                            src="/assets/nsso-logo.png"
                            alt="nsso"
                            width={458}
                            height={224}
                            className="h-10 w-auto mx-auto"
                        />
                    </Link>
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-slate-950 mb-2">{title}</h1>
                    <p className="text-slate-950/80">{description}</p>
                </div>

                {children}
            </LightGlassPanel>
        </main>
    )
}
