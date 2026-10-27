'use client'

import { useEffect, useMemo, useId } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import LightGlassPanel from '@/components/ui/LightGlassPanel'
import HomeVisionPlayer from '@/components/home/HomeVisionPlayer'
import HomeProfileClaim from '@/components/home/HomeProfileClaim'
import HomeProfileDemo from '@/components/home/HomeProfileDemo'
import Link from 'next/link'
import { useUser } from '@/components/providers/UserProvider'
import { createClient } from '@/lib/supabase/client'
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass'
import { boundedClientRead } from '@/lib/client-read'



interface FeatureTeaserProps {
  label: string
  tooltip: string
  status: 'live' | 'soon'
  stackClassName: string
}

function FeatureTeaser({ label, tooltip, status, stackClassName }: FeatureTeaserProps) {
  const tooltipId = useId()

  return (
    <div className={`group/feature relative ${stackClassName}`}>
      <TahoeGlassSurface
        variant="recessed"
        radius={12}
        tone="dark"
        semanticTint="light"
        semanticTintOpacity={0.12}
        tabIndex={0}
        aria-describedby={tooltipId}
        className="w-full cursor-help text-left outline-none transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950/60"
        contentClassName="flex w-full flex-col items-start gap-2 px-4 py-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between min-[400px]:gap-3"
      >
        <span className="min-w-0 text-[15px] leading-relaxed text-slate-950">{label}</span>
        {status === 'live' ? (
          <span
            className="relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full border border-emerald-800/15 bg-emerald-100/80 px-2.5 py-1"
          >
            <span
              className="whitespace-nowrap text-[10px] font-semibold leading-[14px] text-emerald-950"
              style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600 }}
            >
              Now live
            </span>
          </span>
        ) : (
          <span className="relative flex shrink-0 select-none items-center justify-center rounded-full border border-slate-950/15 bg-white/20 px-2.5 py-1">
            <span
              className="relative z-10 whitespace-nowrap text-[10px] font-medium leading-[14px] text-slate-950/75"
              style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}
            >
              Coming soon
            </span>
          </span>
        )}
      </TahoeGlassSurface>

      <div
        id={tooltipId}
        role="tooltip"
        className="invisible absolute -bottom-2 left-0 z-[60] w-full translate-y-full rounded-xl border border-white/10 bg-[#202126] p-3 text-xs leading-relaxed text-white opacity-0 shadow-xl transition-all duration-200 group-hover/feature:visible group-hover/feature:opacity-100 group-focus-within/feature:visible group-focus-within/feature:opacity-100"
      >
        {tooltip}
      </div>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const { user } = useUser()
  const supabase = useMemo(() => createClient(), [])

  // Redirect authenticated users to dashboard (unless they clicked the logo)
  useEffect(() => {
    let cancelled = false
    const checkAuthAndRedirect = async () => {
      const hashParams = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')
      const authType = hashParams.get('type')

      if (
        accessToken
        && refreshToken
        && (authType === 'invite' || authType === 'recovery')
      ) {
        try {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (cancelled) return
          window.history.replaceState(null, '', window.location.pathname)
          router.replace(error ? '/sign-in?error=password-link' : '/set-password')
        } catch {
          if (!cancelled) {
            window.history.replaceState(null, '', window.location.pathname)
            router.replace('/sign-in?error=password-link')
          }
        }
        return
      }

      // Check if user came via logo click (view=home parameter)
      const params = new URLSearchParams(window.location.search)
      const viewHome = params.get('view') === 'home'

      // Only redirect if NOT a logo click
      if (!viewHome) {
        try {
          const { data: { session }, error } = await boundedClientRead(() => supabase.auth.getSession())
          if (!cancelled && !error && session) router.replace('/dashboard')
        } catch {
          // Public discovery remains usable during an Auth network outage.
        }
      }
    }
    void checkAuthAndRedirect()
    return () => { cancelled = true }
  }, [router, supabase])

  return (
    <main className="min-h-screen">
      {!user && <Header />}

      <section
        data-home-hero="true"
        aria-label="Future-proof your identity"
        className="relative mx-auto flex min-h-[100svh] max-w-6xl flex-col items-center justify-center gap-[clamp(1.5rem,4.5svh,3rem)] px-5 pb-16 pt-[calc(88px+env(safe-area-inset-top)+2rem)] text-center font-bold tracking-tight text-white [text-shadow:0_2px_12px_rgba(15,23,42,0.55)]"
        style={{ fontFamily: 'var(--font-sf-pro-display)' }}
      >
        <p className="text-[clamp(1.75rem,7.5vw,3.5rem)] leading-tight text-slate-200/75">Clarify</p>
        <p className="text-[clamp(1.75rem,7.5vw,3.5rem)] leading-tight text-slate-200/75">Organise</p>
        <h1 className="w-full text-[clamp(2.5rem,12vw,7.5rem)] leading-[1.03] tracking-[-0.04em]">
          <span className="block">Future-Proof</span>{' '}
          <span className="block">Yourself</span>
        </h1>
        <p className="text-[clamp(1.75rem,7.5vw,3.5rem)] leading-tight text-slate-200/75">Present</p>
        <p className="text-[clamp(1.75rem,7.5vw,3.5rem)] leading-tight text-slate-200/75">Discover</p>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-16 sm:px-8 lg:pb-24" aria-label="Meet nsso">
        <LightGlassPanel data-home-intro="true" className="p-6 sm:p-8 lg:p-12">
          <div className="mx-auto max-w-2xl space-y-8 lg:space-y-10">
            <div className="space-y-5 text-center">
              <h2 className="text-3xl font-bold leading-tight text-slate-950 sm:text-4xl lg:text-5xl">All of you. All in one place.</h2>
              <p className="text-base font-medium leading-relaxed text-slate-950/80 sm:text-lg">The most beautiful way to present yourself online</p>
            </div>

            <HomeProfileDemo />

            <div data-home-story="true" className="space-y-6 text-base leading-[1.75] text-slate-950/85 sm:text-lg">
              <p>
                nsso stands for "new sovereign self online". Your nsso profile acts as a unified professional homepage that triples as a link-in-bio tool, professional Resumé, and personal shop. Here you can showcase all of your skills, experiences, products and services in a cohesive manner, thereby making it easier to turn your followers into customers.
              </p>
              <p>
                nsso embodies a vision to revolutionize how we present our multifaceted identities online. Inspired by the challenge of unifying fragmented digital personas, nsso offers a platform where personal and professional stories intertwine beautifully. At its heart, nsso is about celebrating individuality, empowering users to showcase their entire selves; work, passions, and aspirations - in one holistic place.
              </p>
            </div>

            <div className="mx-auto flex w-full max-w-md flex-col gap-3">
              <FeatureTeaser label="AI-assisted profile creation" status="live" stackClassName="z-[30] hover:z-30" tooltip="Ask Deity to create your profile for you, gain suggested business and profile ideas based on your profile content" />
              <FeatureTeaser label="Integrate web3 wallet" status="soon" stackClassName="z-[20] hover:z-20" tooltip="Wallet sign-in and crypto payments are planned for a future release." />
              <FeatureTeaser label="Connect Facebook Pixel" status="soon" stackClassName="z-[10] hover:z-10" tooltip="Track conversions and optimize your ads with Facebook Pixel integration." />
            </div>
          </div>
        </LightGlassPanel>
      </section>

      <section className="mx-auto max-w-2xl px-5 pb-16 sm:px-8 lg:pb-24" aria-labelledby="home-claim-title">
        <LightGlassPanel className="p-6 sm:p-8 lg:p-10">
          <h2 id="home-claim-title" className="mb-8 text-center text-2xl font-bold leading-tight text-slate-950 sm:text-3xl">Your whole story in one profile</h2>
          <HomeProfileClaim />
        </LightGlassPanel>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-16 sm:px-8" aria-label="Explore nsso">
        <div className="mx-auto mb-12 grid max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
          <Link href={user ? '/dashboard' : '/sign-up'} className="block">
            <LightGlassPanel data-home-offer-card="monetise" className="h-full cursor-pointer overflow-hidden transition-transform hover:scale-[1.02]">
              <div data-home-offer-header="true" className="border-b border-white/60 bg-white/40 px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <h3 className="text-xl font-bold text-slate-950">Monetise</h3>
              </div>
              <p className="p-6 text-sm leading-relaxed text-slate-950/75">
                Showcase your products and services with purchase links and PayPal buttons.
              </p>
            </LightGlassPanel>
          </Link>

          <a href="https://nsso.me/ramin" target="_blank" rel="noopener noreferrer" className="block">
            <LightGlassPanel data-home-offer-card="example-profile" className="h-full cursor-pointer overflow-hidden transition-transform hover:scale-[1.02]">
              <div data-home-offer-header="true" className="border-b border-white/60 bg-white/40 px-6 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                <h3 className="text-xl font-bold text-slate-950">Example Profile</h3>
              </div>
              <p className="p-6 text-sm leading-relaxed text-slate-950/75">
                See how your unified identity could look.
              </p>
            </LightGlassPanel>
          </a>
        </div>

        {/* Contact Footer */}
        <div className="text-center text-sm italic text-slate-950/85">
          Message us on{' '}
          <a
            href="https://www.instagram.com/ramin.nsso"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-slate-950 underline hover:no-underline"
          >
            Instagram
          </a>
          {' '}or{' '}
          <a
            href="https://wa.link/gh1dhy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-slate-950 underline hover:no-underline"
          >
            WhatsApp
          </a>
        </div>
      </section >

      {/* Video Feature Section */}
      <section className="w-full lg:min-h-screen flex flex-col items-center justify-center pt-12 pb-24 lg:py-0 gap-12">
        <div className="h-full w-full max-w-[1470px]">
          <HomeVisionPlayer />
        </div>

        {/* Create Profile Button - Mobile Only */}
        <div className="lg:hidden">
          <TahoeGlassSurface
            as="a"
            variant="button"
            href={user ? '/dashboard' : '/sign-up'}
            tone="dark"
            semanticTint="light"
            semanticTintOpacity={0.25}
            data-home-create-profile="true"
            className="group flex min-h-12 items-center justify-center overflow-hidden px-8 py-4 transition-all duration-300 hover:scale-105 active:scale-95 focus-visible:outline-slate-950"
            contentClassName="flex flex-col items-center justify-center"
          >
            <span className="text-center text-base font-semibold leading-normal text-slate-950">
              Create your nsso profile
            </span>
          </TahoeGlassSurface>
        </div>
      </section>
    </main >
  )
}
