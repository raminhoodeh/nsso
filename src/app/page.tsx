'use client'

import { useState, useEffect, useMemo, useRef, useId } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import CleanGlassCard from '@/components/ui/CleanGlassCard'
import Link from 'next/link'
import { useUser } from '@/components/providers/UserProvider'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import ComingSoonBadge from '@/components/ui/ComingSoonBadge'
import { TahoeGlassButton, TahoeGlassSurface } from '@/components/ui/tahoe-glass'



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
        variant="menu"
        radius={12}
        tabIndex={0}
        aria-describedby={tooltipId}
        tone="light"
        className="w-full cursor-help px-4 py-3 text-left outline-none transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        contentClassName="flex items-center justify-between gap-3"
      >
        <span className="text-[15px] text-white/90">{label}</span>
        {status === 'live' ? (
          <TahoeGlassSurface
            variant="pill"
            radius={200}
            semanticTint="light"
            semanticTintOpacity={0.1}
            tone="light"
            className="flex select-none items-center justify-center overflow-hidden px-[10px] py-[3px]"
          >
            <span
              className="whitespace-nowrap text-[10px] font-semibold leading-[14px] text-emerald-100"
              style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600 }}
            >
              Now live
            </span>
          </TahoeGlassSurface>
        ) : (
          <ComingSoonBadge />
        )}
      </TahoeGlassSurface>

      <TahoeGlassSurface
        id={tooltipId}
        role="tooltip"
        variant="popover"
        radius={12}
        tone="light"
        className="invisible absolute -bottom-2 left-0 z-[60] w-full translate-y-full p-3 text-xs leading-relaxed text-white/80 opacity-0 transition-all duration-200 group-hover/feature:visible group-hover/feature:opacity-100 group-focus-within/feature:visible group-focus-within/feature:opacity-100"
      >
        {tooltip}
      </TahoeGlassSurface>
    </div>
  )
}

export default function HomePage() {
  const router = useRouter()
  const { user } = useUser()
  const [reservedName, setReservedName] = useState('')
  const supabase = useMemo(() => createClient(), [])
  const videoRef = useRef<HTMLVideoElement>(null)

  // Redirect authenticated users to dashboard (unless they clicked the logo)
  useEffect(() => {
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
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        window.history.replaceState(null, '', window.location.pathname)
        router.replace(error ? '/sign-in?error=password-link' : '/set-password')
        return
      }

      // Check if user came via logo click (view=home parameter)
      const params = new URLSearchParams(window.location.search)
      const viewHome = params.get('view') === 'home'

      // Only redirect if NOT a logo click
      if (!viewHome) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          router.push('/dashboard')
        }
      }
    }
    void checkAuthAndRedirect()
  }, [router, supabase])

  // Lazy load video when it enters viewport
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            video.play()
          } else {
            video.pause()
          }
        })
      },
      { threshold: 0.5 } // Play when 50% visible
    )

    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  const handleClaimIt = async () => {
    // Check if user is logged in
    const { data: { session } } = await supabase.auth.getSession()

    if (session) {
      router.push('/dashboard')
      return
    }

    if (reservedName.trim()) {
      router.push(`/sign-up?name=${encodeURIComponent(reservedName.trim())}`)
    } else {
      router.push('/sign-up')
    }
  }

  return (
    <main className="min-h-screen">
      {!user && <Header />}

      {/* Hero Section */}
      {/* Hero Section */}
      <section className={cn(
        "pt-[calc(140px+5vh)] lg:pt-[140px] pb-16 px-6 max-w-[1470px] mx-auto",
        user ? "lg:px-8" : "lg:px-[165px]"
      )}>

        {/* Typographic Hero Animation/Layout - Centered Vertical Stack */}
        <div className="relative mb-48 flex flex-col items-center font-bold tracking-tight select-none z-0">
          {/* Top words */}
          <div className="text-4xl lg:text-7xl text-white/40 mb-2" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Clarify
          </div>
          <div className="text-4xl lg:text-7xl text-white/60 mb-2" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Organise
          </div>

          {/* Main Title Line - Full Width Centered */}
          <h1 className="text-5xl lg:text-8xl text-white mb-2 w-full text-center" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Future-Proof Yourself
          </h1>

          {/* Bottom words */}
          <div className="text-4xl lg:text-7xl text-white/60 mb-2" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Present
          </div>
          <div className="text-4xl lg:text-7xl text-white/40" style={{ fontFamily: 'var(--font-sf-pro-display)' }}>
            Discover
          </div>
        </div>

        {/* Two Column Layout - Card Left, Video Right */}
        <div className="flex flex-col lg:flex-row gap-24 items-stretch min-h-[80vh]">
          {/* Left Half - Text Card */}
          <div className="w-full lg:w-1/2">
            <CleanGlassCard
              className="h-full flex flex-col justify-start relative group"
            >
              <div className="relative z-10 flex flex-col gap-4 h-full p-8 lg:p-10">
                {/* Top Row: Body Text */}
                <p className="text-white text-lg font-medium text-center lg:text-left">
                  The most beautiful way to present yourself online
                </p>

                {/* Middle Row: Title Text */}
                <h3 className="text-3xl lg:text-5xl font-bold text-white leading-tight text-center lg:text-left">
                  All of you. All in one place.
                </h3>

                {/* Bottom Row: Subtitle Text */}
                <div className="space-y-4 text-white text-lg leading-relaxed text-center lg:text-left">
                  <p>
                    nsso stands for "new sovereign self online". nsso embodies a vision to revolutionize how we present our multifaceted identities online. Inspired by the challenge of unifying fragmented digital personas, nsso offers a platform where personal and professional stories intertwine beautifully. At its heart, nsso is about celebrating individuality, empowering users to showcase their entire selves; work, passions, and aspirations - in one holistic place.
                  </p>
                  <p>
                    Your nsso profile acts a unified professional homepage that triples as a link-in-bio tool, professional Resumé, and personal shop. Here you can showcase all of your skills, experiences, products and services in a cohesive manner, thereby making it easier to turn your followers into customers.
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
                    tooltip="Allow customers to pay for your products & services using crypto, available February 2026 subject to regulatory approvals"
                  />
                  <FeatureTeaser
                    label="Connect Facebook Pixel"
                    status="soon"
                    stackClassName="z-[10] hover:z-10"
                    tooltip="Track conversions and optimize your ads with Facebook Pixel integration."
                  />
                </div>
              </div>
            </CleanGlassCard>
          </div>

          {/* Right Half - Fullscreen Vertical Video */}
          <div className="w-full lg:w-1/2 relative">
            <video
              ref={videoRef}
              src="/homepage-video.mp4"
              loop
              muted
              playsInline
              className="w-full h-full object-cover rounded-[40px]"
              style={{ minHeight: '80vh' }}
            />
          </div>
        </div>
      </section >

      {/* CTA Section */}
      <section className={cn(
        "py-16 px-6 max-w-[1470px] mx-auto",
        user ? "lg:px-8" : "lg:px-[165px]"
      )}>
        <div className="text-center mb-8">
          <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
            Reserve your nsso profile name
          </h2>
        </div>

        {/* Reservation Input */}
        {/* Reservation Input - Figma Exact Design */}
        <div className="relative w-full max-w-[522px] mx-auto mb-12">
          {/* Horizontal layout for larger screens (> 400px) */}
          <div className="hidden min-[400px]:block">
            <TahoeGlassSurface
              variant="recessed"
              radius={12}
              tone="light"
              className="h-[54px] w-full overflow-hidden"
              contentClassName="flex h-full w-full items-center"
            >
              <span
                className="shrink-0 pl-4 text-[22px] font-medium text-white/96"
                style={{
                  fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontWeight: 510
                }}
              >
                nsso.me/
              </span>
              <input
                aria-label="Profile name"
                type="text"
                value={reservedName}
                onChange={(e) => setReservedName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()}
                placeholder="yourname"
                className="min-w-0 flex-1 border-none bg-transparent text-[22px] font-medium text-white outline-none placeholder:text-white placeholder:opacity-100"
                style={{
                  fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontWeight: 510
                }}
              />
              <TahoeGlassButton
                onClick={handleClaimIt}
                radius={12}
                tone="light"
                className="mr-1.5 h-[42px] w-[133px] shrink-0 px-4 py-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                contentClassName="text-[16px] font-semibold tracking-wide text-white/96"
              >
                CLAIM IT
              </TahoeGlassButton>
            </TahoeGlassSurface>
          </div>

          {/* Stacked layout for small screens (≤ 400px) */}
          <div className="min-[400px]:hidden flex flex-col gap-3">
            <TahoeGlassSurface
              variant="recessed"
              radius={12}
              tone="light"
              className="h-[54px] w-full overflow-hidden"
              contentClassName="flex h-full w-full items-center"
            >
              <span
                className="shrink-0 pl-3 text-[20px] font-medium text-white/96"
                style={{
                  fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontWeight: 510
                }}
              >
                nsso.me/
              </span>
              <input
                aria-label="Profile name"
                type="text"
                value={reservedName}
                onChange={(e) => setReservedName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()}
                placeholder="yourname"
                className="min-w-0 flex-1 border-none bg-transparent pr-3 text-[20px] font-medium text-white outline-none placeholder:text-white placeholder:opacity-100"
                style={{
                  fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontWeight: 510
                }}
              />
            </TahoeGlassSurface>

            {/* Button - centered below */}
            <div className="flex justify-center">
              <TahoeGlassButton
                onClick={handleClaimIt}
                radius={12}
                tone="light"
                className="h-[42px] w-[133px] px-4 py-2 transition-all hover:scale-[1.02] active:scale-[0.98]"
                contentClassName="text-[16px] font-semibold tracking-wide text-white/96"
              >
                CLAIM IT
              </TahoeGlassButton>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
          <Link href="/earnings" className="block">
            <CleanGlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full">
              <h3 className="text-xl font-bold text-white mb-3">Monetise</h3>
              <div className="h-px w-full bg-white/10 mb-4" />
              <p className="text-white/70 text-sm">
                Do you have an engaged following? See our nsso earnings programme
              </p>
            </CleanGlassCard>
          </Link>

          <a href="https://nsso.me/ramin" target="_blank" rel="noopener noreferrer" className="block">
            <CleanGlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full">
              <h3 className="text-xl font-bold text-white mb-3">Example Profile</h3>
              <div className="h-px w-full bg-white/10 mb-4" />
              <p className="text-white/70 text-sm">
                See how your unified identity could look.
              </p>
            </CleanGlassCard>
          </a>
        </div>

        {/* Contact Footer */}
        <div className="text-center text-white/70 italic text-sm">
          Message us on{' '}
          <a
            href="https://www.instagram.com/ramin.nsso"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline hover:no-underline"
          >
            Instagram
          </a>
          {' '}or{' '}
          <a
            href="https://wa.link/gh1dhy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white underline hover:no-underline"
          >
            WhatsApp
          </a>
        </div>
      </section >

      {/* Video Feature Section */}
      <section className="w-full lg:min-h-screen flex flex-col items-center justify-center pt-12 pb-24 lg:py-0 gap-12">
        <div className="w-full h-full max-w-[1470px] aspect-video">
          <iframe
            width="100%"
            height="100%"
            src="https://www.youtube.com/embed/n9-WjzJlq-Q"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="w-full h-full lg:rounded-none"
          ></iframe>
        </div>

        {/* Create Profile Button - Mobile Only */}
        <div className="lg:hidden">
          <TahoeGlassSurface
            as="a"
            variant="button"
            href="/sign-in"
            tone="light"
            className="group flex items-center justify-center overflow-hidden px-6 py-2 transition-all duration-300 hover:scale-105 active:scale-95"
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
