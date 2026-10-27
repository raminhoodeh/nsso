import React, { useState } from 'react';
import Image from 'next/image';
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass';
import { formatFilmRating } from '@/lib/razinflix/browsing';

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

const MovieCard = ({ film, onClick, isGrid = false }: MovieCardProps) => {
    const [failedPoster, setFailedPoster] = useState<string | null>(null);
    const hasPoster = Boolean(film.poster && film.poster !== 'N/A' && film.poster !== failedPoster);

    return (
        <div
            className={`relative transition-transform duration-300 motion-reduce:transition-none hover:scale-105 hover:z-50 origin-center ${isGrid ? 'w-full min-w-0' : 'flex-none w-48'}`}
        >
            <button
                type="button"
                aria-label={`Open details for ${film.title}`}
                onClick={() => onClick(film)}
                onPointerDown={(event) => event.currentTarget.focus({ preventScroll: true })}
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
                {hasPoster ? (
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
                    <h3 className="font-bold line-clamp-2">{film.title}</h3>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 text-gray-300">
                        <span className="shrink-0">{film.year}</span>
                        <span className="text-yellow-400" aria-label={`Rating: ${formatFilmRating(film.rating)}`}>★ {formatFilmRating(film.rating)}</span>
                    </div>
                </div>
            </TahoeGlassSurface>
        </div>
    );
};

export default MovieCard;
