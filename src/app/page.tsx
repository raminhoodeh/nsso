'use client'

import { useState, useEffect } from 'react'
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

  // Animate through words
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentWordIndex((prev) => (prev + 1) % animatedWords.length)
    }, 2000)
    return () => clearInterval(interval)
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

        {/* Two Column Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Left Column - 3 Rows of Text */}
          <GlassCard className="h-full flex flex-col justify-start relative overflow-hidden group" style={{ '--glass-bg': 'rgba(255, 255, 255, 0.05)' } as React.CSSProperties}>
            <div className="relative z-10 flex flex-col gap-4 h-full p-4 lg:p-10">
              {/* Top Row: Body Text */}
              <p className="text-white/80 text-lg font-medium text-center lg:text-left">
                With the most beautiful way to present yourself online
              </p>

              {/* Middle Row: Title Text */}
              <h3 className="text-3xl lg:text-5xl font-bold text-white leading-tight text-center lg:text-left">
                A way that makes you feel clear, and proud, of who you are
              </h3>

              {/* Bottom Row: Subtitle Text */}
              <p className="text-white/60 text-lg leading-relaxed mt-auto text-center lg:text-left">
                Imagine having a link-in-bio tool, a resumé, website, and personal shop; all of you, all in one place. This is what it means to evolve your identity with our evolving world.
              </p>
            </div>
          </GlassCard>

          {/* Right Column - Product Demo */}
          <GlassCard className="p-8 lg:p-10 h-full min-h-[350px] flex flex-col items-center justify-center text-center relative overflow-hidden" style={{ '--glass-bg': 'rgba(255, 255, 255, 0.05)' } as React.CSSProperties}>
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />
            <div className="text-white/70 text-lg mb-6 relative z-10 max-w-lg leading-relaxed">
              <span className="text-white font-bold">All of you</span>; your bio, contact, links, experiences, projects, qualifications, products and services... <span className="text-white font-bold">all in one place</span>.
            </div>
            <div className="w-full max-w-[530px] h-[340px] rounded-[24px] border-[1px] border-white/10 shadow-2xl flex items-center justify-center relative z-10 overflow-hidden backdrop-blur-md isolate">
              {/* Video Demo */}
              <video
                src="/nsso-homepage-profile-demo.mp4"
                autoPlay
                loop
                muted
                playsInline
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/10 pointer-events-none rounded-[24px]" />
            </div>
          </GlassCard>
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
            <GlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full" style={{ '--glass-bg': 'rgba(255, 255, 255, 0.05)' } as React.CSSProperties}>
              <h3 className="text-xl font-bold text-white mb-2">Monetise</h3>
              <p className="text-white/70 text-sm">
                Do you have an engaged following? See our nsso earnings programme
              </p>
            </GlassCard>
          </Link>

          <a href="https://nsso.me/ramin" target="_blank" rel="noopener noreferrer" className="block">
            <GlassCard className="p-6 cursor-pointer hover:scale-[1.02] transition-transform h-full" style={{ '--glass-bg': 'rgba(255, 255, 255, 0.05)' } as React.CSSProperties}>
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
