import React, { useState, useRef } from 'react';
import Image from 'next/image';

interface Film {
    id: number;
    title: string;
    year: string;
    rating: string;
    poster: string;
    categories: string[];
    trailer_key?: string | null;
}

interface MovieCardProps {
    film: Film;
    onClick: (film: Film) => void;
    isGrid?: boolean;
}

const MovieCard = ({ film, onClick, isGrid = false }: MovieCardProps) => {
    const [isHoverPlaying, setIsHoverPlaying] = useState(false);
    const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        if (!film.trailer_key) return; // Only hover-play if there is a trailer
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = setTimeout(() => {
            setIsHoverPlaying(true);
        }, 1200);
    };

    const handleMouseLeave = () => {
        if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
        setIsHoverPlaying(false);
    };

    return (
        <div
            className={`relative transition-transform duration-300 transform cursor-pointer hover:scale-110 hover:z-50 group origin-center ${isGrid ? 'w-full' : 'flex-none w-48'}`}
            onClick={() => onClick(film)}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <div className="aspect-[2/3] glass-style-card rounded-[24px] overflow-hidden shadow-2xl relative border border-white/10 group-hover:border-white/40 transition-colors bg-black">
                {isHoverPlaying && film.trailer_key ? (
                    <div className="absolute inset-0 z-20 w-full h-full scale-[1.35] pointer-events-none">
                        <iframe
                            src={`https://www.youtube.com/embed/${film.trailer_key}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&loop=1&playlist=${film.trailer_key}`}
                            frameBorder="0"
                            allow="autoplay"
                            className="w-full h-full object-cover pointer-events-none"
                        ></iframe>
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent pointer-events-none z-30" />
                    </div>
                ) : (
                    <Image
                        src={film.poster}
                        alt={film.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="object-cover z-10"
                        loading="lazy"
                    />
                )}
                
                <div className={`absolute inset-x-0 bottom-0 p-3 text-xs text-white bg-gradient-to-t from-black via-black/80 to-transparent transition-opacity duration-300 ${isHoverPlaying ? 'z-40 opacity-100' : 'z-20 opacity-100 group-hover:opacity-0'}`}>
                    <h3 className="font-bold truncate">{film.title}</h3>
                    <div className="flex items-center justify-between text-gray-300">
                        <span>{film.year}</span>
                        {film.rating && film.rating !== 'N/A' && (
                            <span className="text-yellow-400">★ {film.rating}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MovieCard;
