'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/layout/Header'
import GlassCard from '@/components/ui/GlassCard'
import GlassButton from '@/components/ui/GlassButton'
import Input from '@/components/ui/Input'
import Link from 'next/link'

import { createClient } from '@/lib/supabase/client'

// Animated words for hero section
const animatedWords = ['Clarify', 'Organise', 'Future-Proof', 'Present']

export default function HomePage() {
  const router = useRouter()
  const [reservedName, setReservedName] = useState('')
  const [currentWordIndex, setCurrentWordIndex] = useState(0)
  const supabase = createClient()
  const videoRef = useRef<HTMLVideoElement>(null)

  // Animate through words
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % animatedWords.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [])

  // Redirect authenticated users to dashboard (unless they clicked the logo)
  useEffect(() => {
    const checkAuthAndRedirect = async () => {
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
    checkAuthAndRedirect()
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
      <Header />

      {/* Hero Section */}
      {/* Hero Section */}
      <section className="pt-[calc(140px+5vh)] lg:pt-[140px] pb-16 px-6 lg:px-[165px] max-w-[1470px] mx-auto">

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
            <GlassCard
              className="h-full flex flex-col justify-start relative group rounded-[40px] glass-distortion-active"
            >
              <div className="relative z-10 flex flex-col gap-4 h-full p-4 lg:p-10">
                {/* Top Row: Body Text */}
                <p className="text-white text-lg font-medium text-center lg:text-left">
                  Your bio, contact, links, experiences, projects, qualifications, products and services...
                </p>

                {/* Middle Row: Title Text */}
                <h3 className="text-3xl lg:text-5xl font-bold text-white leading-tight text-center lg:text-left">
                  All of you,<br />all in one place.
                </h3>

                {/* Bottom Row: Subtitle Text */}
                <p className="text-white text-lg leading-relaxed text-center lg:text-left">
                  Use nsso as a link-in-bio tool, a resumé, website, and personal shop. Your profile provides you with the most beautiful way to present yourself online - a way that makes you feel clear, and proud, of who you are.
                </p>

                {/* Coming Soon Features - Visual Filter for Whitespace */}
                <div className="flex flex-col gap-3 mt-12 w-full max-w-sm mx-auto lg:mx-0">
                  {/* AI Assisted Profile Creation - Now Live */}
                  <div className="relative group z-[30] hover:z-30">
                    <div className="w-full text-left px-4 py-3 rounded-xl bg-white/15 border border-white/5 flex items-center justify-between cursor-help hover:bg-white/20 transition-all">
                      <span className="text-white/90 text-[15px]">AI-assisted profile creation</span>
                      <div className="relative border-[0.75px] border-emerald-500/30 rounded-[200px] px-[10px] py-[3px] overflow-hidden flex items-center justify-center select-none bg-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                        <span className="relative z-10 font-medium text-[10px] text-emerald-100 leading-[14px] whitespace-nowrap" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 600 }}>
                          Now live
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Web3 Coming Soon Teaser */}
                  <div className="relative group z-[20] hover:z-20">
                    <div className="w-full text-left px-4 py-3 rounded-xl bg-white/15 border border-white/5 flex items-center justify-between cursor-help hover:bg-white/20 transition-all">
                      <span className="text-white/90 text-[15px]">Integrate web3 wallet</span>
                      <div className="relative border-[0.75px] border-white/45 rounded-[200px] px-[10px] py-[3px] overflow-hidden flex items-center justify-center select-none">
                        <div className="absolute inset-0 bg-white/[0.03] mix-blend-luminosity rounded-[200px]" />
                        <div className="absolute inset-0 bg-gray-500/15 mix-blend-color-dodge rounded-[200px]" />
                        <img
                          alt=""
                          src="/assets/premium-bezel.png"
                          className="absolute inset-0 w-full h-full object-cover backdrop-blur-[68px]"
                        />
                        <span className="relative z-10 font-medium text-[10px] text-white/96 leading-[14px] whitespace-nowrap" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                          Coming soon
                        </span>
                      </div>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute left-0 -bottom-2 translate-y-full w-full p-3 rounded-xl bg-black/90 border border-white/10 text-white/80 text-xs leading-relaxed z-[60] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-xl shadow-xl">
                      Allow customers to pay for your products & services using crypto, available February 2026 subject to regulatory approvals
                    </div>
                  </div>

                  {/* Facebook Pixel Coming Soon Teaser */}
                  <div className="relative group z-[10] hover:z-10">
                    <div className="w-full text-left px-4 py-3 rounded-xl bg-white/15 border border-white/5 flex items-center justify-between cursor-help hover:bg-white/20 transition-all">
                      <span className="text-white/90 text-[15px]">Connect Facebook Pixel</span>
                      <div className="relative border-[0.75px] border-white/45 rounded-[200px] px-[10px] py-[3px] overflow-hidden flex items-center justify-center select-none">
                        <div className="absolute inset-0 bg-white/[0.03] mix-blend-luminosity rounded-[200px]" />
                        <div className="absolute inset-0 bg-gray-500/15 mix-blend-color-dodge rounded-[200px]" />
                        <img
                          alt=""
                          src="/assets/premium-bezel.png"
                          className="absolute inset-0 w-full h-full object-cover backdrop-blur-[68px]"
                        />
                        <span className="relative z-10 font-medium text-[10px] text-white/96 leading-[14px] whitespace-nowrap" style={{ fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif", fontWeight: 510 }}>
                          Coming soon
                        </span>
                      </div>
                    </div>
                    {/* Tooltip */}
                    <div className="absolute left-0 -bottom-2 translate-y-full w-full p-3 rounded-xl bg-black/90 border border-white/10 text-white/80 text-xs leading-relaxed z-[60] invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 backdrop-blur-xl shadow-xl">
                      Track conversions and optimize your ads with Facebook Pixel integration.
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
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
      < section className="py-16 px-6 lg:px-[165px] max-w-[1470px] mx-auto" >
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
            <div className="relative w-full h-[54px]">
              {/* Base container with all layers */}
              <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                {/* Glassmorphic background layers */}
                <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />

                {/* Purple gradient layer */}
                <div className="absolute inset-0 bg-[rgba(94,92,230,0.18)] rounded-[12px]" />

                {/* Siri gradient background image */}
                <div
                  className="absolute inset-0 opacity-40 rounded-[12px]"
                  style={{
                    backgroundImage: 'url(/siri-gradient.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                />

                {/* Prefix text - nsso.me/ */}
                <span
                  className="relative z-10 text-[22px] font-medium text-white/96 shrink-0 pl-4"
                  style={{
                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontWeight: 510
                  }}
                >
                  nsso.me/
                </span>

                {/* Input field */}
                <input
                  type="text"
                  value={reservedName}
                  onChange={(e) => setReservedName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()}
                  placeholder="yourname"
                  className="relative z-10 flex-1 bg-transparent border-none outline-none text-[22px] font-medium text-white placeholder:text-white placeholder:opacity-100 min-w-0"
                  style={{
                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontWeight: 510
                  }}
                />

                {/* Shiny CLAIM IT Button - Figma Exact Design */}
                <div className="relative z-10 mr-1.5 shrink-0">
                  {/* Gradient border wrapper */}
                  <div
                    className="p-[0.75px] rounded-[12px]"
                    style={{
                      background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)'
                    }}
                  >
                    <button
                      onClick={handleClaimIt}
                      className="relative h-[42px] w-[133px] rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)'
                      }}
                    >
                      {/* Shiny button background layers */}
                      <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" />
                      <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" />

                      <span
                        className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide"
                        style={{
                          fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                          fontWeight: 590
                        }}
                      >
                        CLAIM IT
                      </span>
                    </button>
                  </div>
                </div>

                {/* Inset shadow overlay */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-[12px]"
                  style={{
                    boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Stacked layout for small screens (≤ 400px) */}
          <div className="min-[400px]:hidden flex flex-col gap-3">
            {/* Input field */}
            <div className="relative w-full h-[54px]">
              <div className="absolute inset-0 flex items-center overflow-hidden rounded-[12px]">
                {/* Glassmorphic background layers */}
                <div className="absolute inset-0 bg-[rgba(208,208,208,0.5)] mix-blend-color-burn rounded-[12px]" />
                <div className="absolute inset-0 bg-[rgba(0,0,0,0.1)] mix-blend-luminosity rounded-[12px]" />
                <div className="absolute inset-0 bg-[rgba(94,92,230,0.18)] rounded-[12px]" />
                <div
                  className="absolute inset-0 opacity-40 rounded-[12px]"
                  style={{
                    backgroundImage: 'url(/siri-gradient.png)',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                />

                {/* Prefix text */}
                <span
                  className="relative z-10 text-[20px] font-medium text-white/96 shrink-0 pl-3"
                  style={{
                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontWeight: 510
                  }}
                >
                  nsso.me/
                </span>

                {/* Input field - full width */}
                <input
                  type="text"
                  value={reservedName}
                  onChange={(e) => setReservedName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleClaimIt()}
                  placeholder="yourname"
                  className="relative z-10 flex-1 bg-transparent border-none outline-none text-[20px] font-medium text-white placeholder:text-white placeholder:opacity-100 min-w-0 pr-3"
                  style={{
                    fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                    fontWeight: 510
                  }}
                />

                {/* Inset shadow overlay */}
                <div
                  className="absolute inset-0 pointer-events-none rounded-[12px]"
                  style={{
                    boxShadow: 'inset 0px -0.5px 1px 0px rgba(255,255,255,0.3), inset 0px -0.5px 1px 0px rgba(255,255,255,0.25), inset 1px 1.5px 4px 0px rgba(0,0,0,0.08), inset 1px 1.5px 4px 0px rgba(0,0,0,0.1)'
                  }}
                />
              </div>
            </div>

            {/* Button - centered below */}
            <div className="flex justify-center">
              <div
                className="p-[0.75px] rounded-[12px]"
                style={{
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.45) 0%, rgba(255,255,255,0.01) 40%, rgba(255,255,255,0.01) 57%, rgba(255,255,255,0.15) 100%)'
                }}
              >
                <button
                  onClick={handleClaimIt}
                  className="relative h-[42px] w-[133px] rounded-[12px] flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    boxShadow: '0px 3px 3px 0px rgba(0,0,0,0.13)'
                  }}
                >
                  <div className="absolute inset-0 bg-[rgba(255,255,255,0.06)] mix-blend-luminosity rounded-[12px]" />
                  <div className="absolute inset-0 bg-[rgba(128,128,128,0.3)] mix-blend-color-dodge rounded-[12px]" />
                  <span
                    className="relative z-10 text-[16px] font-semibold text-white/96 tracking-wide"
                    style={{
                      fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                      fontWeight: 590
                    }}
                  >
                    CLAIM IT
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto mb-12">
          <Link href="/earnings" className="block">
            <GlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full">
              <h3 className="text-xl font-bold text-white mb-2">Monetise</h3>
              <p className="text-white/70 text-sm">
                Do you have an engaged following? See our nsso earnings programme
              </p>
            </GlassCard>
          </Link>

          <a href="https://nsso.me/ramin" target="_blank" rel="noopener noreferrer" className="block">
            <GlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full">
              <h3 className="text-xl font-bold text-white mb-2">Example Profile</h3>
              <p className="text-white/70 text-sm">
                See how your unified identity could look.
              </p>
            </GlassCard>
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
      < section className="w-full min-h-screen flex items-center justify-center bg-black" >
        <div className="w-full h-full max-w-[1470px] aspect-video">
          <iframe
            width="100%"
            height="100%"
            src="https://www.youtube.com/embed/n9-WjzJlq-Q"
            title="YouTube video player"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="w-full h-full"
          ></iframe>
        </div>
      </section >
    </main >
  )
}
