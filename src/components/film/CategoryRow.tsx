import React, { useRef } from 'react';
import MovieCard, { type Film } from './MovieCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CategoryRowProps {
    title: string;
    films: Film[];
    onFilmClick: (film: Film) => void;
    previewsDisabled?: boolean;
}

const CategoryRow = ({ title, films, onFilmClick, previewsDisabled = false }: CategoryRowProps) => {
    const rowRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: number) => {
        if (rowRef.current) {
            rowRef.current.scrollBy({
                left: direction * Math.max(220, rowRef.current.clientWidth * 0.85),
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
            });
        }
    };

    if (!films || films.length === 0) return null;

    return (
        <div className="mb-8 group/film-row relative px-4 md:px-12">
            <h2 className="mb-3 text-xl font-semibold text-gray-100 md:text-2xl flex items-center gap-2">
                {title}
                <span className="text-sm font-normal text-gray-400">({films.length})</span>
            </h2>

            <div className="relative -mx-4 px-4 md:-mx-12 md:px-12">
                <button
                    type="button"
                    className="absolute left-2 top-1/2 z-[70] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/90 text-white shadow-lg transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:pointer-events-none md:opacity-0 md:group-hover/film-row:pointer-events-auto md:group-hover/film-row:opacity-100 md:group-focus-within/film-row:pointer-events-auto md:group-focus-within/film-row:opacity-100"
                    onClick={() => scroll(-1)}
                    aria-label={`Scroll ${title} left`}
                >
                    <ChevronLeft size={28} aria-hidden="true" />
                </button>

                <div
                    ref={rowRef}
                    className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth py-8 pr-12 pl-2"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {films.map((film) => (
                        <MovieCard key={`${title}-${film.id}`} film={film} onClick={onFilmClick} previewsDisabled={previewsDisabled} />
                    ))}
                    <style jsx>{`
                        div::-webkit-scrollbar {
                            display: none;
                        }
                    `}</style>
                </div>

                <button
                    type="button"
                    className="absolute right-2 top-1/2 z-[70] flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/90 text-white shadow-lg transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:pointer-events-none md:opacity-0 md:group-hover/film-row:pointer-events-auto md:group-hover/film-row:opacity-100 md:group-focus-within/film-row:pointer-events-auto md:group-focus-within/film-row:opacity-100"
                    onClick={() => scroll(1)}
                    aria-label={`Scroll ${title} right`}
                >
                    <ChevronRight size={28} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
};

export default CategoryRow;
