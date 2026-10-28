'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'
import GlassButton from '@/components/ui/GlassButton'

/** Decorative demo: no media URL is attached until it is visible and motion is allowed. */
export default function HomeProfileDemo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const pausedByUser = useRef(false)
  const [playing, setPlaying] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    const synchronize = () => {
      if (!visible || motion.matches || pausedByUser.current) { video.pause(); return }
      if (!video.getAttribute('src')) { video.src = '/homepage-video.mp4'; setLoaded(true) }
      void video.play().catch(() => setNotice('Select Play profile preview to start the video.'))
    }
    const observer = new IntersectionObserver(entries => { visible = entries.some(entry => entry.isIntersecting); synchronize() }, { threshold: 0.25 })
    observer.observe(video)
    motion.addEventListener('change', synchronize)
    return () => { observer.disconnect(); motion.removeEventListener('change', synchronize); video.pause() }
  }, [])

  const toggle = () => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) { pausedByUser.current = true; video.pause(); return }
    pausedByUser.current = false
    if (!video.getAttribute('src')) { video.src = '/homepage-video.mp4'; setLoaded(true) }
    void video.play().catch(() => setNotice('Preview unavailable. You can still explore the example profile below.'))
  }

  return (
    <figure className="relative mx-auto w-full max-w-[440px] lg:max-w-[520px]" aria-label="nsso profile preview">
      <div className="relative aspect-[10/13] overflow-hidden rounded-[24px] bg-slate-950 shadow-lg">
        <video ref={videoRef} poster="/homepage-profile-demo-poster.jpg" preload="none" loop muted playsInline aria-hidden="true" className="absolute inset-0 h-full w-full origin-center scale-[1.18] object-cover" onPlay={() => { setPlaying(true); setNotice('') }} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); setNotice('Preview unavailable. Explore the example profile below.') }} />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent p-4 pt-12">
          <div className="min-w-0 flex-1 pb-8">
            <p className="text-sm leading-relaxed text-white" role="status">{notice || (!loaded ? 'Play to explore the profile.' : '')}</p>
          </div>
          <GlassButton type="button" variant="secondary" tone="dark" onClick={toggle} aria-label={playing ? 'Pause profile preview' : 'Play profile preview'} className="h-11 w-11 shrink-0 p-0">{playing ? <Pause size={20} /> : <Play size={20} />}</GlassButton>
        </div>
      </div>
      <figcaption className="pointer-events-none absolute bottom-4 left-4 right-[76px] text-sm font-semibold leading-6 text-white">nsso profile demo</figcaption>
    </figure>
  )
}
