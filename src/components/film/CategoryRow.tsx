import React, { useEffect, useRef, useState } from 'react';
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
    const [visibleCount, setVisibleCount] = useState(10);
    const [bounds, setBounds] = useState({ left: false, right: false });

    useEffect(() => {
        const row = rowRef.current;
        if (!row) return;
        const update = () => setBounds({ left: row.scrollLeft > 2, right: row.scrollLeft + row.clientWidth < row.scrollWidth - 2 });
        update();
        row.addEventListener('scroll', update, { passive: true });
        const observer = new ResizeObserver(update);
        observer.observe(row);
        return () => { row.removeEventListener('scroll', update); observer.disconnect(); };
    }, [visibleCount, films.length]);

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
        <section aria-label={title} className="mb-8 relative px-4 md:px-12" data-film-shelf="true">
            <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex min-w-0 flex-wrap items-center gap-2 text-xl font-semibold text-gray-100 md:text-2xl">
                {title}
                <span className="text-sm font-normal text-gray-400">({films.length})</span>
            </h2>

            <div className="flex shrink-0 gap-2">
                <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/80 text-white disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-white"
                    disabled={!bounds.left}
                    onClick={() => scroll(-1)}
                    aria-label={`Scroll ${title} left`}
                >
                    <ChevronLeft size={28} aria-hidden="true" />
                </button>

                <button
                    type="button"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-black/80 text-white disabled:opacity-30 focus-visible:outline-2 focus-visible:outline-white"
                    disabled={!bounds.right}
                    onClick={() => scroll(1)}
                    aria-label={`Scroll ${title} right`}
                >
                    <ChevronRight size={28} aria-hidden="true" />
                </button>
            </div>
            </div>
            <div ref={rowRef} className="flex gap-4 overflow-x-auto py-3" style={{ scrollbarWidth: 'thin' }}>
                {films.slice(0, visibleCount).map(film => <MovieCard key={film.id} film={film} onClick={onFilmClick} previewsDisabled={previewsDisabled} />)}
                {visibleCount < films.length && <button type="button" className="min-h-44 w-48 shrink-0 rounded-3xl border border-white/25 bg-neutral-900 p-5 text-white focus-visible:outline-2 focus-visible:outline-white" onClick={() => setVisibleCount(count => count + 10)}>Show {Math.min(10, films.length - visibleCount)} more films in {title}</button>}
            </div>
        </section>
    );
};

export default CategoryRow;
