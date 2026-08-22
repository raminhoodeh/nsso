import React, { useRef } from 'react';
import MovieCard from './MovieCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TahoeGlassButton } from '@/components/ui/tahoe-glass';

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
                <TahoeGlassButton
                    className="absolute left-2 top-1/2 z-30 -translate-y-1/2 p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    contentClassName="text-white"
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.025}
                    onClick={() => scroll(-500)}
                    aria-label="Scroll left"
                >
                    <ChevronLeft size={40} className="text-white drop-shadow-lg" />
                </TahoeGlassButton>

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

                <TahoeGlassButton
                    className="absolute right-2 top-1/2 z-30 -translate-y-1/2 p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    contentClassName="text-white"
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.025}
                    onClick={() => scroll(500)}
                    aria-label="Scroll right"
                >
                    <ChevronRight size={40} className="text-white drop-shadow-lg" />
                </TahoeGlassButton>
            </div>
        </div>
    );
};

export default CategoryRow;
