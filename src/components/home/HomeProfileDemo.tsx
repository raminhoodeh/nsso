'use client'

import { useEffect, useRef, useState } from 'react'
import { Pause, Play } from 'lucide-react'

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
    <figure className="mx-auto w-full max-w-[440px] space-y-3" aria-label="nsso profile preview">
      <figcaption className="text-center text-sm font-semibold text-slate-950">A demo of a nsso profile</figcaption>
      <div className="relative aspect-[10/13] overflow-hidden rounded-[24px] bg-slate-950 shadow-lg">
        <video ref={videoRef} poster="/homepage-profile-demo-poster.jpg" preload="none" loop muted playsInline aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" onPlay={() => { setPlaying(true); setNotice('') }} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); setNotice('Preview unavailable. Explore the example profile below.') }} />
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 bg-gradient-to-t from-black/75 to-transparent p-4 pt-12">
          <p className="text-sm leading-relaxed text-white" role="status">{notice || (!loaded ? 'Play to explore the profile.' : '')}</p>
          <button type="button" onClick={toggle} aria-label={playing ? 'Pause profile preview' : 'Play profile preview'} className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-white/40 bg-slate-950/80 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">{playing ? <Pause size={20} /> : <Play size={20} />}</button>
        </div>
      </div>
    </figure>
  )
}
