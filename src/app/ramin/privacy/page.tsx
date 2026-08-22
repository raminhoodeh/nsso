import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Cookie } from 'lucide-react'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'

export const metadata: Metadata = {
    title: 'Privacy and Tracking | Ramin on nsso',
    description: 'How Meta Pixel is used on Ramin Hoodeh\'s public nsso profile.',
}

export default function RaminTrackingPrivacyPage() {
    return (
        <main className="relative z-10 min-h-screen px-6 pb-24 pt-32 text-white sm:px-10">
            <article className="mx-auto max-w-3xl">
                <Link
                    href="/ramin"
                    className="inline-flex items-center gap-2 text-sm text-white/70 transition-colors hover:text-white"
                >
                    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                    Back to Ramin&apos;s profile
                </Link>

                <div className="mt-10 flex items-center gap-3">
                    <Cookie aria-hidden="true" className="h-6 w-6 text-white/70" />
                    <h1 className="text-3xl font-semibold sm:text-4xl">Privacy and tracking</h1>
                </div>

                <p className="mt-5 text-base leading-7 text-white/70">
                    This notice covers Meta Pixel tracking on Ramin Hoodeh&apos;s public profile at nsso.me/ramin. The pixel is not installed on other members&apos; profiles, private dashboards, or the rest of the nsso application.
                </p>

                <section className="mt-12 border-t border-white/15 pt-8">
                    <h2 className="text-xl font-semibold">What is collected</h2>
                    <p className="mt-3 leading-7 text-white/70">
                        If you allow marketing tracking, Meta Pixel may receive the page URL, referring page, browser and device information, IP-derived information, cookie identifiers, and a PageView event. No private dashboard or account content is intentionally sent through this integration.
                    </p>
                </section>

                <section className="mt-10 border-t border-white/15 pt-8">
                    <h2 className="text-xl font-semibold">Why it is used</h2>
                    <p className="mt-3 leading-7 text-white/70">
                        The data is used to measure advertising performance, understand whether campaigns lead people to Ramin&apos;s profile, and build audiences for relevant advertising. Meta processes the resulting data under its own privacy terms.
                    </p>
                    <a
                        href="https://www.facebook.com/privacy/policy/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-sm text-white underline decoration-white/40 underline-offset-4 hover:decoration-white"
                    >
                        Read Meta&apos;s Privacy Policy
                    </a>
                </section>

                <section className="mt-10 border-t border-white/15 pt-8">
                    <h2 className="text-xl font-semibold">Your choice</h2>
                    <p className="mt-3 leading-7 text-white/70">
                        Meta Pixel remains off until you select Allow. Your choice is stored for 180 days in the <code className="text-white">nsso_meta_marketing_consent</code> cookie. You can change it at any time using Privacy choices on Ramin&apos;s profile.
                    </p>
                    <TahoeGlassSurface
                        as="a"
                        variant="button"
                        href="/ramin#privacy-choices"
                        radius={12}
                        tone="light"
                        className="mt-5 inline-flex min-h-11 items-center px-4 text-sm font-medium transition-colors"
                    >
                        Manage tracking choices
                    </TahoeGlassSurface>
                </section>

                <section className="mt-10 border-t border-white/15 pt-8">
                    <h2 className="text-xl font-semibold">Contact</h2>
                    <p className="mt-3 leading-7 text-white/70">
                        Questions about this tracking can be sent to{' '}
                        <a className="text-white underline underline-offset-4" href="mailto:raminhoodeh@gmail.com">
                            raminhoodeh@gmail.com
                        </a>.
                    </p>
                </section>

                <p className="mt-12 text-sm text-white/45">Effective 17 August 2026</p>
            </article>
        </main>
    )
}
