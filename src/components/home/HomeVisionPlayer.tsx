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

const VIDEO_URL = 'https://www.youtube.com/watch?v=n9-WjzJlq-Q'

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
  const [volume, setVolume] = useState(1)

  useEffect(() => {
    const video = videoRef.current
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
    }
  }, [])

  const togglePlayback = useCallback(() => {
    const video = videoRef.current
    if (!video) return

    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0
      setPlaybackNotice(null)
      void video.play().catch(() => {
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
          src="/nsso-vision.mp4"
          poster="/nsso-vision-poster.jpg"
          preload="metadata"
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
          }}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onVolumeChange={(event) => {
            setIsMuted(event.currentTarget.muted)
            setVolume(event.currentTarget.volume)
            if (event.currentTarget.volume > 0) {
              lastNonzeroVolumeRef.current = event.currentTarget.volume
            }
          }}
          onError={() => setError('This video is temporarily unavailable.')}
        />
      </div>

      <div
        role="group"
        aria-label="Playback controls"
        className="flex min-h-16 w-full items-center gap-3 border-t border-white/10 bg-[#080c14] px-3 py-3 sm:px-5"
      >
        <button
          type="button"
          onClick={togglePlayback}
          disabled={!controlsAvailable}
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-45"
          aria-label={isPlaying ? 'Pause video' : 'Play video'}
        >
          {isPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
        </button>

        <span className="w-[4.75rem] shrink-0 text-center text-xs tabular-nums text-white/75">
          {formatTime(currentTime)} / {formatTime(duration)}
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
          className="h-1.5 min-w-0 flex-1 cursor-pointer accent-white disabled:cursor-wait"
        />

        <button
          type="button"
          onClick={toggleMute}
          disabled={!controlsAvailable}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-45"
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        >
          {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>

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
          className="hidden h-1.5 w-24 cursor-pointer accent-white disabled:cursor-wait md:block"
        />

        <a
          href={VIDEO_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden size-11 shrink-0 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:flex"
          aria-label="Watch this video on YouTube"
          title="Watch on YouTube"
        >
          <ExternalLink size={19} />
        </a>

        <button
          type="button"
          onClick={toggleFullscreen}
          disabled={!controlsAvailable}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-white/85 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-wait disabled:opacity-45"
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </button>
      </div>

      {error || playbackNotice ? (
        <div
          role={error ? 'alert' : 'status'}
          className="border-t border-red-300/20 bg-red-950 px-4 py-3 text-sm text-red-100"
        >
          {error ?? playbackNotice}{' '}
          <a href={VIDEO_URL} target="_blank" rel="noopener noreferrer" className="underline">
            Watch on YouTube
          </a>
        </div>
      ) : null}
    </div>
  )
}
