'use client'

import {
  ExternalLink,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { LightButton, LightIconButton } from '@/components/ui/LightButton'
import { lightButtonClass } from '@/components/ui/light-button-styles'
import { cn } from '@/lib/utils'

const VIDEO_URL = 'https://www.youtube.com/watch?v=ukYfrg0ZNbA'
const VIDEO_ASSET_URL = '/nsso-vision-ukYfrg0ZNbA.mp4'
const VIDEO_POSTER_URL = '/nsso-vision-ukYfrg0ZNbA-poster.jpg'

interface WebkitFullscreenVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return '0:00'

  const rounded = Math.floor(value)
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default function HomeVisionPlayer() {
  const descriptionId = useId()
  const lastNonzeroVolumeRef = useRef(1)
  const shellRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [playbackNotice, setPlaybackNotice] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const video = videoRef.current
    // Metadata may be ready before hydration attaches React's event handlers.
    const syncMedia = () => {
      if (!video) return
      setDuration(Number.isFinite(video.duration) ? video.duration : 0)
      setCurrentTime(video.currentTime || 0)
      setVolume(video.volume)
      setIsMuted(video.muted)
      setIsPlaying(!video.paused && !video.ended)
    }
    syncMedia()
    const mediaEvents = ['loadedmetadata', 'durationchange', 'canplay', 'timeupdate', 'volumechange', 'play', 'pause', 'ended']
    mediaEvents.forEach(event => video?.addEventListener(event, syncMedia))
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current)
    }
    const onWebkitBeginFullscreen = () => setIsFullscreen(true)
    const onWebkitEndFullscreen = () => setIsFullscreen(false)

    document.addEventListener('fullscreenchange', onFullscreenChange)
    video?.addEventListener('webkitbeginfullscreen', onWebkitBeginFullscreen)
    video?.addEventListener('webkitendfullscreen', onWebkitEndFullscreen)

    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      video?.removeEventListener('webkitbeginfullscreen', onWebkitBeginFullscreen)
      video?.removeEventListener('webkitendfullscreen', onWebkitEndFullscreen)
      mediaEvents.forEach(event => video?.removeEventListener(event, syncMedia))
    }
  }, [])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused || video.ended) {
      // Attaching the URL on user intent avoids downloading a second large film
      // during an ordinary homepage visit.
      if (!video.getAttribute('src')) video.src = VIDEO_ASSET_URL
      if (video.ended) video.currentTime = 0
      setIsLoading(true)
      setPlaybackNotice(null)
      void video.play().catch(() => {
        setIsLoading(false)
        setPlaybackNotice('Playback could not start. Please try again or watch on YouTube.')
      })
    } else {
      video.pause()
    }
  }, [])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.muted || video.volume === 0) {
      if (video.volume === 0) video.volume = lastNonzeroVolumeRef.current
      video.muted = false
    } else {
      video.muted = true
    }
  }, [])

  const seek = useCallback((value: number) => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = value
    setCurrentTime(value)
  }, [])

  const updateVolume = useCallback((value: number) => {
    const video = videoRef.current
    if (!video) return
    video.volume = value
    if (value > 0) {
      lastNonzeroVolumeRef.current = value
      video.muted = false
    } else {
      video.muted = true
    }
  }, [])

  const toggleFullscreen = useCallback(async () => {
    const shell = shellRef.current
    const video = videoRef.current as WebkitFullscreenVideo | null
    if (!shell || !video) return

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined)
      return
    }

    if (shell.requestFullscreen) {
      try {
        await shell.requestFullscreen()
        return
      } catch {
        // Fall through to the native WebKit video fullscreen path.
      }
    }

    try {
      video.webkitEnterFullscreen?.()
    } catch {
      // The browser has no supported fullscreen path; inline playback remains available.
    }
  }, [])

  const controlsAvailable = !error
  const timelineAvailable = controlsAvailable && duration > 0

  return (
    <div
      ref={shellRef}
      role="group"
      aria-label="The nsso vision video player"
      aria-describedby={descriptionId}
      className="w-full overflow-hidden bg-black text-white"
      data-home-video-player="native-controls"
    >
      <p id={descriptionId} className="sr-only">
        The most beautiful way to present yourself online. Subtitles are included in the video.
      </p>

      <div className="aspect-video w-full bg-black">
        <video
          ref={videoRef}
          poster={VIDEO_POSTER_URL}
          preload="none"
          playsInline
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none block h-full w-full object-contain"
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration)
            setVolume(event.currentTarget.volume)
            setIsMuted(event.currentTarget.muted)
          }}
          onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => {
            setError(null)
            setPlaybackNotice(null)
            setIsPlaying(true)
            setIsLoading(false)
          }}
          onPlaying={() => setIsLoading(false)}
          onWaiting={() => setIsLoading(true)}
          onStalled={() => setPlaybackNotice('Video loading has stalled. Try playback again or watch on YouTube.')}
          onCanPlay={() => setIsLoading(false)}
          onPause={() => { setIsPlaying(false); setIsLoading(false) }}
          onEnded={() => setIsPlaying(false)}
          onVolumeChange={(event) => {
            setIsMuted(event.currentTarget.muted)
            setVolume(event.currentTarget.volume)
            if (event.currentTarget.volume > 0) {
              lastNonzeroVolumeRef.current = event.currentTarget.volume
            }
          }}
          onError={() => { setIsLoading(false); setError('This video is temporarily unavailable.') }}
        />
      </div>

      <div
        role="group"
        aria-label="Playback controls"
        className="flex min-h-16 w-full items-center gap-3 border-t border-white/50 bg-white/60 text-slate-950 px-3 py-3 sm:px-5"
      >
        <LightIconButton
          type="button"
          onClick={togglePlayback}
          disabled={!controlsAvailable}
          className="disabled:cursor-wait disabled:opacity-45"
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
        </LightIconButton>

        <span aria-live="off" className="w-[4.75rem] shrink-0 text-center text-xs tabular-nums text-slate-950">
          {formatTime(currentTime)} / {duration > 0 ? formatTime(duration) : '--:--'}
        </span>

        <input
          type="range"
          min={0}
          max={Math.max(duration, 0)}
          step={0.1}
          value={Math.min(currentTime, Math.max(duration, 0))}
          onChange={(event) => seek(Number(event.target.value))}
          disabled={!timelineAvailable}
          aria-label="Video progress"
          aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
          className="h-11 min-w-0 flex-1 cursor-pointer accent-slate-950 disabled:cursor-wait"
        />

        <LightIconButton
          type="button"
          onClick={toggleMute}
          disabled={!controlsAvailable}
          className="disabled:cursor-wait disabled:opacity-45"
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </LightIconButton>

        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={isMuted ? 0 : volume}
          onChange={(event) => updateVolume(Number(event.target.value))}
          disabled={!controlsAvailable}
          aria-label="Video volume"
          aria-valuetext={`${Math.round((isMuted ? 0 : volume) * 100)} percent`}
          className="hidden h-11 w-24 cursor-pointer accent-slate-950 disabled:cursor-wait md:block"
        />

        <a
          href={VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(lightButtonClass, 'hidden h-11 w-11 shrink-0 p-0 sm:inline-flex')}
          aria-label="Watch this video on YouTube"
          title="Watch on YouTube"
        >
          <ExternalLink size={19} />
        </a>

        <LightIconButton
          type="button"
          onClick={toggleFullscreen}
          disabled={!controlsAvailable}
          className="disabled:cursor-wait disabled:opacity-45"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </LightIconButton>
      </div>

      {isLoading && !error && <p role="status" className="bg-white/60 px-4 pb-3 text-sm text-slate-950">Loading video…</p>}

      {error || playbackNotice ? (
        <div
          role={error ? 'alert' : 'status'}
          className="border-t border-red-800/20 bg-red-100/90 px-4 py-3 text-sm text-red-950"
        >
          {error ?? playbackNotice}{' '}
          {error && <LightButton type="button" onClick={() => { const video = videoRef.current; if (!video) return; setError(null); video.removeAttribute('src'); video.load(); togglePlayback() }} className="mr-3 min-h-11 px-4 py-2" contentClassName="text-sm">Retry video</LightButton>}
          <a href={VIDEO_URL} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">
            Watch on YouTube
          </a>
        </div>
      ) : null}
    </div>
  )
}
