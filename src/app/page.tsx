'use client'

import { useEffect, useMemo, useId } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import ProfileGlassCard from '@/components/profile/ProfileGlassCard'
import HomeVisionPlayer from '@/components/home/HomeVisionPlayer'
import HomeProfileClaim from '@/components/home/HomeProfileClaim'
import HomeProfileDemo from '@/components/home/HomeProfileDemo'
import Link from 'next/link'
import { useUser } from '@/components/providers/UserProvider'
import { cn } from '@/lib/utils'
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
        tone="light"
        semanticTint="dark"
        semanticTintOpacity={0.38}
        tabIndex={0}
        aria-describedby={tooltipId}
        className="w-full cursor-help text-left outline-none transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        contentClassName="flex w-full items-center justify-between gap-3 px-4 py-3"
      >
        <span className="text-[15px] text-white/90">{label}</span>
        {status === 'live' ? (
          <span
            className="relative flex select-none items-center justify-center overflow-hidden rounded-[200px] border-[0.75px] border-emerald-500/30 bg-emerald-500/20 px-[10px] py-[3px] shadow-[0_0_10px_rgba(16,185,129,0.2)]"
          >
            <span
              className="whitespace-nowrap text-[10px] font-semibold leading-[14px] text-emerald-100"
              style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600 }}
            >
              Now live
            </span>
          </span>
        ) : (
          <span className="relative flex select-none items-center justify-center overflow-hidden rounded-[200px] border-[0.75px] border-white/45 px-[10px] py-[3px]">
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/[0.03] mix-blend-luminosity" />
            <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gray-500/15 mix-blend-color-dodge" />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-cover bg-center backdrop-blur-[68px]"
              style={{ backgroundImage: "url('/assets/premium-bezel.png')" }}
            />
            <span
              className="relative z-10 whitespace-nowrap text-[10px] font-medium leading-[14px] text-white/96"
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
        className="invisible absolute -bottom-2 left-0 z-[60] w-full translate-y-full rounded-xl border border-white/10 bg-black/90 p-3 text-xs leading-relaxed text-white/80 opacity-0 shadow-xl backdrop-blur-xl transition-all duration-200 group-hover/feature:visible group-hover/feature:opacity-100 group-focus-within/feature:visible group-focus-within/feature:opacity-100"
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

      {/* Hero Section */}
      {/* Hero Section */}
      <section className={cn(
        "pt-[128px] lg:pt-[140px] pb-16 px-5 max-w-[1470px] mx-auto",
        user ? "lg:px-8" : "lg:px-[165px]"
      )}>

        {/* Typographic Hero Animation/Layout - Centered Vertical Stack */}
        <div className="relative mb-12 flex flex-col items-center rounded-[32px] border border-white/15 bg-slate-950/45 px-4 py-6 font-bold tracking-tight z-0 shadow-xl backdrop-blur-lg [text-shadow:0_2px_5px_rgba(0,0,0,0.8)] lg:mb-24 lg:px-8 lg:py-10 [@media(max-height:500px)]:py-3">
          {/* Top words */}
          <div className="text-lg lg:text-4xl text-white/75 mb-1 [@media(max-height:500px)]:hidden" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Clarify
          </div>
          <div className="text-lg lg:text-4xl text-white/85 mb-1 [@media(max-height:500px)]:hidden" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Organise
          </div>

          {/* Main Title Line - Full Width Centered */}
          <h1 className="text-4xl lg:text-7xl text-white mb-2 w-full text-center [@media(max-height:500px)]:text-3xl" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Future-Proof Yourself
          </h1>

          {/* Bottom words */}
          <div className="text-lg lg:text-4xl text-white/85 mb-1 [@media(max-height:500px)]:hidden" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Present
          </div>
          <div className="text-lg lg:text-4xl text-white/75 [@media(max-height:500px)]:hidden" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Discover
          </div>
          <div className="mt-5 w-full font-normal tracking-normal [text-shadow:none]">
            <HomeProfileClaim />
            <Link href={user ? '/dashboard' : '/sign-up'} className="mt-3 flex min-h-11 items-center justify-center text-sm font-semibold text-white underline underline-offset-4">Create a profile and choose a name later →</Link>
          </div>
        </div>

        {/* Two Column Layout - Card Left, Video Right */}
        <div className="flex flex-col lg:flex-row gap-24 items-stretch min-h-[80vh]">
          {/* Left Half - Text Card */}
          <div className="w-full lg:w-1/2">
            <ProfileGlassCard
              className="h-full flex flex-col justify-start relative group"
            >
              <div className="relative z-10 flex h-full flex-col gap-4 px-8 pb-8 pt-[calc(2rem+7svh)] lg:px-10 lg:pb-10 lg:pt-[calc(2.5rem+7svh)]">
                {/* Top Row: Body Text */}
                <p className="text-white text-lg font-medium text-center lg:text-left">
                  The most beautiful way to present yourself online
                </p>

                {/* Middle Row: Title Text */}
                <h2 className="text-3xl lg:text-5xl font-bold text-white leading-tight text-center lg:text-left">
                  All of you. All in one place.
                </h2>

                {/* Bottom Row: Subtitle Text */}
                <div className="space-y-4 text-lg leading-relaxed text-white/90 text-center lg:text-left">
                  <p>
                    nsso stands for "new sovereign self online". Your nsso profile acts a unified professional homepage that triples as a link-in-bio tool, professional Resumé, and personal shop. Here you can showcase all of your skills, experiences, products and services in a cohesive manner, thereby making it easier to turn your followers into customers.
                  </p>
                  <p>
                    nsso embodies a vision to revolutionize how we present our multifaceted identities online. Inspired by the challenge of unifying fragmented digital personas, nsso offers a platform where personal and professional stories intertwine beautifully. At its heart, nsso is about celebrating individuality, empowering users to showcase their entire selves; work, passions, and aspirations - in one holistic place.
                  </p>
                </div>

                {/* Coming Soon Features - Visual Filter for Whitespace */}
                <div className="flex flex-col gap-3 mt-12 w-full max-w-sm mx-auto lg:mx-0">
                  <FeatureTeaser
                    label="AI-assisted profile creation"
                    status="live"
                    stackClassName="z-[30] hover:z-30"
                    tooltip="Ask Deity to create your profile for you, gain suggested business and profile ideas based on your profile content"
                  />
                  <FeatureTeaser
                    label="Integrate web3 wallet"
                    status="soon"
                    stackClassName="z-[20] hover:z-20"
                    tooltip="Wallet sign-in and crypto payments are planned for a future release."
                  />
                  <FeatureTeaser
                    label="Connect Facebook Pixel"
                    status="soon"
                    stackClassName="z-[10] hover:z-10"
                    tooltip="Track conversions and optimize your ads with Facebook Pixel integration."
                  />
                </div>
              </div>
            </ProfileGlassCard>
          </div>

          {/* Right Half - Fullscreen Vertical Video */}
          <div className="w-full lg:w-1/2 relative"><HomeProfileDemo /></div>
        </div>
      </section >

      {/* CTA Section */}
      <section className={cn(
        "py-16 px-6 max-w-[1470px] mx-auto",
        user ? "lg:px-8" : "lg:px-[165px]"
      )}>
        <div className="text-center mb-8">
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
            Your whole story starts with one profile
          </h2>
        </div>

        <div className="mb-12 text-center"><a href="#choose-profile-name" className="inline-flex min-h-11 items-center rounded-full border border-white/40 bg-slate-950/50 px-6 py-3 font-semibold text-white backdrop-blur-xl">Choose your profile name ↑</a></div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
          <Link href={user ? '/dashboard' : '/sign-up'} className="block">
            <ProfileGlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full">
              <h3 className="text-xl font-bold text-white mb-3">Monetise</h3>
              <div className="h-px w-full bg-white/10 mb-4" />
              <p className="text-white/70 text-sm">
                Showcase your products and services with purchase links and PayPal buttons.
              </p>
            </ProfileGlassCard>
          </Link>

          <a href="https://nsso.me/ramin" target="_blank" rel="noopener noreferrer" className="block">
            <ProfileGlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full">
              <h3 className="text-xl font-bold text-white mb-3">Example Profile</h3>
              <div className="h-px w-full bg-white/10 mb-4" />
              <p className="text-white/70 text-sm">
                See how your unified identity could look.
              </p>
            </ProfileGlassCard>
          </a>
        </div>

        {/* Contact Footer */}
        <div className="text-center text-white/70 italic text-sm">
          Message us on{' '}
          <a
            href="https://www.instagram.com/ramin.nsso"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-white underline hover:no-underline"
          >
            Instagram
          </a>
          {' '}or{' '}
          <a
            href="https://wa.link/gh1dhy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center text-white underline hover:no-underline"
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
            tone="light"
            className="group flex min-h-11 items-center justify-center overflow-hidden px-6 py-2 transition-all duration-300 hover:scale-105 active:scale-95"
            contentClassName="flex flex-col items-center justify-center"
          >
            <span className="whitespace-nowrap text-center text-[14px] font-semibold leading-normal tracking-wide text-[#5ac8f5] drop-shadow-sm">
              Create your nsso profile
            </span>
          </TahoeGlassSurface>
        </div>
      </section>
    </main >
  )
}
