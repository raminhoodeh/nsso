import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass';

export interface Film {
    id: number;
    title: string;
    year: string;
    rating: string;
    poster: string;
    description: string;
    director: string;
    categories: string[];
    trailer_key?: string | null;
    created_at?: string;
}

interface MovieCardProps {
    film: Film;
    onClick: (film: Film) => void;
    isGrid?: boolean;
    previewsDisabled?: boolean;
}

const MovieCard = ({ film, onClick, isGrid = false, previewsDisabled = false }: MovieCardProps) => {
    const [isHoverPlaying, setIsHoverPlaying] = useState(false);
    const [failedPoster, setFailedPoster] = useState<string | null>(null);
    const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasPoster = Boolean(film.poster && film.poster !== 'N/A' && film.poster !== failedPoster);

    // Reset the preview with the incoming dialog state so closing a dialog cannot resume it.
    if (previewsDisabled && isHoverPlaying) setIsHoverPlaying(false);

    const stopPreview = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
        setIsHoverPlaying(false);
    };

    useEffect(() => {
        return () => {
            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
            hoverTimeoutRef.current = null;
        };
    }, [previewsDisabled, film.id]);

    const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.pointerType !== 'mouse' || previewsDisabled || !film.trailer_key ||
            !window.matchMedia('(hover: hover) and (pointer: fine)').matches ||
            window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        stopPreview();
        hoverTimeoutRef.current = setTimeout(() => {
            hoverTimeoutRef.current = null;
            setIsHoverPlaying(true);
        }, 1200);
    };

    return (
        <div
            className={`relative transition-transform duration-300 motion-reduce:transition-none hover:scale-105 hover:z-50 origin-center ${isGrid ? 'w-full min-w-0' : 'flex-none w-48'}`}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={stopPreview}
        >
            <button
                type="button"
                aria-label={`Open details for ${film.title}`}
                onClick={() => { stopPreview(); onClick(film); }}
                onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
                onBlur={stopPreview}
                className="absolute inset-0 z-[60] cursor-pointer rounded-3xl border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            />
            <TahoeGlassSurface
                variant="mediaFrame"
                radius={24}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.02}
                className="aspect-[2/3] p-[2px] shadow-2xl"
                contentClassName="relative h-full w-full overflow-hidden rounded-[22px] bg-neutral-950"
            >
                {!previewsDisabled && isHoverPlaying && film.trailer_key ? (
                    <div className="absolute inset-0 z-20 w-full h-full scale-[1.35] pointer-events-none">
                        <iframe
                            src={`https://www.youtube.com/embed/${film.trailer_key}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&loop=1&playlist=${film.trailer_key}`}
                            title={`${film.title} trailer preview`}
                            tabIndex={-1}
                            frameBorder="0"
                            allow="autoplay"
                            className="w-full h-full object-cover pointer-events-none"
                        ></iframe>
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none z-30" />
                    </div>
                ) : hasPoster ? (
                    <Image
                        src={film.poster}
                        alt={film.title}
                        fill
                        sizes={isGrid ? '(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 17vw' : '192px'}
                        className="object-cover z-10"
                        loading="lazy"
                        unoptimized={true}
                        onError={() => setFailedPoster(film.poster)}
                    />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-neutral-800 to-neutral-950 p-5 pb-20 text-center">
                        <span aria-hidden="true" className="text-4xl text-white/35">▶</span>
                        <span className="text-base font-semibold text-white">{film.title}</span>
                        <span className="text-xs text-neutral-400">Poster unavailable</span>
                    </div>
                )}
                
                <div className="absolute inset-x-0 bottom-0 z-40 bg-gradient-to-t from-black via-black/95 to-transparent px-3 pb-3 pt-10 text-xs text-white">
                    <h3 className="font-bold truncate capitalize">{film.title}</h3>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 text-gray-300">
                        <span className="shrink-0">{film.year}</span>
                        {film.rating && film.rating !== 'N/A' && (
                            <span className="text-yellow-400">★ {film.rating}</span>
                        )}
                    </div>
                </div>
            </TahoeGlassSurface>
        </div>
    );
};

export default MovieCard;
