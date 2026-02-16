import React, { useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

interface Film {
    id: number;
    title: string;
    year: string;
    rating: string;
    poster: string;
    description: string;
    director: string;
    categories: string[];
    trailer_key?: string | null;
}

interface MovieModalProps {
    film: Film;
    filmList: Film[];
    onClose: () => void;
    onNext: () => void;
    onPrev: () => void;
    onSelect: (film: Film) => void;
}

const MovieModal = ({ film, filmList = [], onClose, onNext, onPrev, onSelect }: MovieModalProps) => {
    const carouselRef = useRef<HTMLDivElement>(null);

    if (!film) return null;

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') onPrev();
            if (e.key === 'ArrowRight') onNext();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, onNext, onPrev]);

    // Scroll carousel to active item
    useEffect(() => {
        if (carouselRef.current && film) {
            const activeItem = carouselRef.current.querySelector(`[data-title="${film.title}"]`);
            if (activeItem) {
                activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
    }, [film]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-2xl transition-opacity duration-300">
            {/* Global Previous Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onPrev(); }}
                className="absolute left-4 top-1/3 z-50 p-3 text-white/50 hover:text-white bg-black/20 hover:bg-black/60 rounded-full transition-all hidden md:block"
            >
                <ChevronLeft size={48} />
            </button>

            {/* Global Next Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onNext(); }}
                className="absolute right-4 top-1/3 z-50 p-3 text-white/50 hover:text-white bg-black/20 hover:bg-black/60 rounded-full transition-all hidden md:block"
            >
                <ChevronRight size={48} />
            </button>

            <div
                className="relative w-full max-w-[95vw] h-[85vh] flex flex-col items-center justify-center"
                onClick={e => e.stopPropagation()}
            >
                {/* Main Content Area (70% Height) */}
                <div className="relative w-full h-[70%] glass-style-card rounded-[32px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/10 mb-4">
                    <button
                        className="absolute top-4 right-4 z-50 p-3 text-white/90 bg-black/60 hover:bg-red-600 hover:text-white rounded-full backdrop-blur-md transition-all duration-300 transform hover:scale-110 shadow-lg border border-white/10 cursor-pointer"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <X size={32} />
                    </button>

                    {/* Left Column: Media (75%) */}
                    <div className="w-full md:w-[75%] h-full relative bg-black flex items-center justify-center group">
                        {film.trailer_key ? (
                            <div className="w-full h-full">
                                <iframe
                                    title={film.title + " Trailer"}
                                    width="100%"
                                    height="100%"
                                    src={`https://www.youtube.com/embed/${film.trailer_key}?autoplay=1&controls=1&modestbranding=1&rel=0&iv_load_policy=3`}
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="w-full h-full object-cover"
                                ></iframe>
                            </div>
                        ) : (
                            <>
                                <div className="relative w-full h-full">
                                    <Image
                                        src={film.poster}
                                        alt={film.title}
                                        fill
                                        className="object-contain md:object-cover opacity-80"
                                    />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent" />
                            </>
                        )}
                    </div>

                    {/* Right Column: Content (25%) */}
                    <div className="w-full md:w-[25%] h-full bg-transparent overflow-y-auto custom-scrollbar border-l border-white/10">
                        <div className="p-6 flex flex-col h-full">
                            <h2 className="text-2xl font-bold text-white mb-1 leading-tight">{film.title}</h2>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-4 font-medium">
                                <span className="text-green-400">{typeof film.rating === 'string' && film.rating.includes('/') ? film.rating.split('/')[0] : film.rating} Rating</span>
                                <span>{film.year}</span>
                                <span className="border border-gray-600 px-1 rounded text-[10px] tracking-wide">HD</span>
                            </div>

                            <div className="mb-4 flex-grow">
                                <p className="text-gray-300 leading-relaxed text-sm">
                                    {film.description}
                                </p>
                            </div>

                            <div className="space-y-3 text-sm text-gray-400 mt-auto">
                                <div>
                                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Director</span>
                                    <span className="text-white text-sm">{film.director}</span>
                                </div>
                                <div>
                                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Categories</span>
                                    <div className="flex flex-wrap gap-1">
                                        {film.categories.map(cat => (
                                            <span key={cat} className="px-2 py-0.5 text-[10px] text-gray-300 bg-gray-800 rounded border border-gray-700">
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Carousel (Remaining Height) */}
                <div className="w-full h-[25%] px-12 flex items-center">
                    <div className="w-full overflow-x-auto flex gap-4 p-4 no-scrollbar items-center" ref={carouselRef}>
                        {filmList.map((f, idx) => (
                            <div
                                key={idx}
                                data-title={f.title}
                                onClick={(e) => { e.stopPropagation(); onSelect(f); }}
                                className={`
                                   flex-shrink-0 cursor-pointer transition-all duration-300 relative rounded-2xl overflow-hidden border-2
                                   ${f.title === film.title ? 'w-48 h-32 border-white scale-105 shadow-xl z-10' : 'w-40 h-24 border-transparent opacity-60 hover:opacity-100 hover:scale-105'}
                               `}
                            >
                                <div className="relative w-full h-full">
                                    <Image src={f.poster} alt={f.title} fill className="object-cover" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MovieModal;
