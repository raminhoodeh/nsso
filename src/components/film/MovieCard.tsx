import React from 'react';
import Image from 'next/image';

interface Film {
    id: number;
    title: string;
    year: string;
    rating: string;
    poster: string;
    categories: string[];
}

interface MovieCardProps {
    film: Film;
    onClick: (film: Film) => void;
    isGrid?: boolean;
}

const MovieCard = ({ film, onClick, isGrid = false }: MovieCardProps) => {
    return (
        <div
            className={`relative transition-transform duration-300 transform cursor-pointer hover:scale-105 hover:z-10 group ${isGrid ? 'w-full' : 'flex-none w-48'}`}
            onClick={() => onClick(film)}
        >
            <div className="aspect-[2/3] glass-style-card rounded-[24px] overflow-hidden shadow-2xl relative border border-white/10 group-hover:border-white/30 transition-colors">
                <Image
                    src={film.poster}
                    alt={film.title}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    className="object-cover"
                    loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 p-2 text-xs text-white bg-gradient-to-t from-black via-black/70 to-transparent">
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
