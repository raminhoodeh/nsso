import React, { useRef } from 'react';
import MovieCard from './MovieCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Film } from './MovieCard'; // Import interface, need to export it from MovieCard or common type

interface CategoryRowProps {
    title: string;
    films: any[]; // Using any for now to avoid circular deps or complex type sharing, but ideally shared interface
    onFilmClick: (film: any) => void;
}

const CategoryRow = ({ title, films, onFilmClick }: CategoryRowProps) => {
    const rowRef = useRef<HTMLDivElement>(null);

    const scroll = (offset: number) => {
        if (rowRef.current) {
            rowRef.current.scrollBy({ left: offset, behavior: 'smooth' });
        }
    };

    if (!films || films.length === 0) return null;

    return (
        <div className="mb-8 group relative px-4 md:px-12">
            <h2 className="mb-3 text-xl font-semibold text-gray-100 md:text-2xl flex items-center gap-2">
                {title}
                <span className="text-sm font-normal text-gray-400">({films.length})</span>
            </h2>

            <div className="relative -mx-4 px-4 md:-mx-12 md:px-12">
                <button
                    className="absolute left-0 top-0 bottom-0 z-30 w-16 bg-gradient-to-r from-black/60 via-black/20 to-transparent flex items-center justify-start pl-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 disabled:opacity-0 cursor-pointer"
                    onClick={() => scroll(-500)}
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={40} className="text-white drop-shadow-lg" />
                </button>

                <div
                    ref={rowRef}
                    className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth py-8 pr-12 pl-2"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {films.map((film) => (
                        <MovieCard key={`${title}-${film.id}`} film={film} onClick={onFilmClick} />
                    ))}
                    <style jsx>{`
                        div::-webkit-scrollbar {
                            display: none;
                        }
                    `}</style>
                </div>

                <button
                    className="absolute right-0 top-0 bottom-0 z-30 w-16 bg-gradient-to-l from-black/60 via-black/20 to-transparent flex items-center justify-end pr-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer"
                    onClick={() => scroll(500)}
                    aria-label="Scroll right"
                >
                    <ChevronRight size={40} className="text-white drop-shadow-lg" />
                </button>
            </div>
        </div>
    );
};

export default CategoryRow;
