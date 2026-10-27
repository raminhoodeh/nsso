import React, { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Play, Loader2, X } from 'lucide-react';
import type { Film } from './MovieCard';
import styles from './MovieModal.module.css';

type Playback = 'idle' | 'checking' | 'playing' | 'unavailable';

export default function FilmTrailer({ film, autoPlay = false }: { film: Film; autoPlay?: boolean }) {
    const [playback, setPlayback] = useState<Playback>('idle');
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const controllerRef = useRef<AbortController | null>(null);
    const key = film.trailer_key;

    const play = useCallback(async () => {
        if (!key) return;
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 8_000);
        setPlayback('checking');
        try {
            const response = await fetch(`/api/razinflix/trailer/${encodeURIComponent(key)}`, { signal: controller.signal });
            const result = await response.json() as { status?: string };
            if (controller.signal.aborted) return;
            setPlayback(result.status === 'unavailable' ? 'unavailable' : 'playing');
        } catch {
            if (!controller.signal.aborted) setPlayback('playing');
            else if (controllerRef.current === controller) setPlayback('unavailable');
        } finally { window.clearTimeout(timeout); }
    }, [key]);

    useEffect(() => {
        const frame = autoPlay ? window.requestAnimationFrame(() => void play()) : undefined;
        return () => {
            if (frame !== undefined) window.cancelAnimationFrame(frame);
            controllerRef.current?.abort();
            controllerRef.current = null;
        };
    }, [autoPlay, play]);

    useEffect(() => {
        if (playback !== 'playing') return;
        const readyTimeout = window.setTimeout(() => setPlayback('unavailable'), 15_000);
        const receive = (event: MessageEvent) => {
            if (event.origin !== 'https://www.youtube.com' || event.source !== iframeRef.current?.contentWindow) return;
            try {
                const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
                if (['onReady', 'initialDelivery', 'infoDelivery', 'onStateChange', 'onError'].includes(message?.event)) window.clearTimeout(readyTimeout);
                if (message?.event === 'onError') setPlayback('unavailable');
            } catch { /* Ignore unrelated player messages. */ }
        };
        window.addEventListener('message', receive);
        return () => { window.clearTimeout(readyTimeout); window.removeEventListener('message', receive); };
    }, [playback]);

    return (
        <div className={styles.trailerShell} data-film-trailer-state={playback}>
            {playback === 'playing' && key ? <>
                <iframe ref={iframeRef} title={`${film.title} trailer`} className="h-full w-full" src={`https://www.youtube.com/embed/${encodeURIComponent(key)}?autoplay=1&controls=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(typeof window === 'undefined' ? '' : window.location.origin)}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen onLoad={() => {
                    const player = iframeRef.current?.contentWindow;
                    player?.postMessage(JSON.stringify({ event: 'listening' }), 'https://www.youtube.com');
                    player?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onError'] }), 'https://www.youtube.com');
                }} onError={() => setPlayback('unavailable')} />
                <button type="button" onClick={() => setPlayback('idle')} className={`${styles.control} absolute right-2 top-2`} aria-label="Stop trailer"><X size={18} aria-hidden="true" /></button>
            </> : <>
                {film.poster && film.poster !== 'N/A' && <Image src={film.poster} alt={`${film.title} poster`} fill className="object-contain opacity-65" unoptimized />}
                <div className={styles.trailerOverlay}>
                    {playback === 'unavailable' || !key ? <>
                        <p className="rounded-lg bg-black/85 px-4 py-2 text-sm text-white" role="status">{key ? 'This trailer is unavailable. Film details are still available below.' : 'No trailer is available for this film yet.'}</p>
                        <a className={`${styles.control} text-center`} href={`https://www.youtube.com/results?search_query=${encodeURIComponent(`${film.title} ${film.year} official trailer`)}`} target="_blank" rel="noopener noreferrer">Find an official trailer on YouTube</a>
                        {key && <button type="button" className={styles.control} onClick={() => void play()}>Retry trailer</button>}
                    </> : <button type="button" disabled={playback === 'checking'} onClick={() => void play()} className={styles.control}>{playback === 'checking' ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />} {playback === 'checking' ? 'Checking trailer…' : 'Play trailer'}</button>}
                </div>
            </>}
        </div>
    );
}
