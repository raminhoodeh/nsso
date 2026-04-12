'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import CategoryRow from '@/components/film/CategoryRow';
import MovieModal from '@/components/film/MovieModal';
import MovieCard from '@/components/film/MovieCard';
import { Search, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

type ViewMode = 'category' | 'alpha' | 'date_desc' | 'rating_desc' | 'rating_asc';
import { useUI } from '@/components/providers/UIProvider';

export default function RazinFlixPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('category');
    const [selectedFilm, setSelectedFilm] = useState<any>(null);
    const [featuredFilms, setFeaturedFilms] = useState<any[]>([]);
    const [featuredIndex, setFeaturedIndex] = useState(0);
    const [modalContext, setModalContext] = useState<{ list: any[], index: number }>({ list: [], index: 0 });
    const [scrolled, setScrolled] = useState(false);
    const [films, setFilms] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const { setBackgroundDimmed } = useUI();
    const touchStartX = useRef(0);

    useEffect(() => {
        setBackgroundDimmed(true);
        return () => setBackgroundDimmed(false);
    }, [setBackgroundDimmed]);

    useEffect(() => {
        const fetchFilms = async () => {
            try {
                const supabase = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
                );
                const { data, error } = await supabase
                    .from('razinflix_films')
                    .select('*')
                    .order('id', { ascending: true });
                
                if (error) throw error;
                if (data) {
                    setFilms(data);
                    // Select 5 random featured films with a trailer
                    const filmsWithTrailers = data.filter((f: any) => f.trailer_key);
                    if (filmsWithTrailers.length > 0) {
                        const shuffled = filmsWithTrailers.sort(() => 0.5 - Math.random());
                        setFeaturedFilms(shuffled.slice(0, 5));
                    }
                }
            } catch (err) {
                console.error('Failed to load films from Supabase:', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchFilms();
    }, []);

    const handleFilmClick = (film: any, list: any[]) => {
        setSelectedFilm(film);
        setModalContext({ list, index: list.indexOf(film) });
    };

    const handleNextFilm = () => {
        if (!modalContext.list.length) return;
        const nextIndex = (modalContext.index + 1) % modalContext.list.length;
        setSelectedFilm(modalContext.list[nextIndex]);
        setModalContext({ ...modalContext, index: nextIndex });
    };

    const handlePrevFilm = () => {
        if (!modalContext.list.length) return;
        const prevIndex = (modalContext.index - 1 + modalContext.list.length) % modalContext.list.length;
        setSelectedFilm(modalContext.list[prevIndex]);
        setModalContext({ ...modalContext, index: prevIndex });
    };

    // Group films by category
    const categories = useMemo(() => {
        const cats: Record<string, any[]> = {
            'Japanese Anime': [],
            'Television & Miniseries': [],
            'Global Documentaries': [],
            'The Crime & Thriller Collection': [],
            'Mind-Bending Sci-Fi & Fantasy': [],
            'Surrealism & The Subconscious': [],
            'Iranian Cinema & Middle East': [],
            'Love & Heartbreak': [],
            'Coming of Age & Youth': [],
            'Historical Epics & Period Pieces': [],
            'Psychological & Character Studies': [],
            'Contemporary Comedy & Satire': [],
            'World Cinema & Drama': []
        };
        
        if (!searchTerm) {
            films.forEach(film => {
                if (film.categories && film.categories.length > 0) {
                    // Forcefully prioritize Japanese Anime per UX directive, otherwise strictly assign 1 category
                    const targetCategory = film.categories.includes('Japanese Anime')
                                           ? 'Japanese Anime'
                                           : film.categories[0];
                    if (!cats[targetCategory]) cats[targetCategory] = [];
                    cats[targetCategory].push(film);
                }
            });
        } else {
            cats['Search Results'] = films.filter(f =>
                f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.director.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.description.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }
        return cats;
    }, [searchTerm, films]);

    // Flat sorted array for dynamic views
    const sortedFilms = useMemo(() => {
        if (viewMode === 'category') return [];

        let result = [...films];

        // Apply search filtering first
        if (searchTerm) {
             result = result.filter(f =>
                f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.director.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.description.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        const extractRating = (r: string) => {
            if (!r || r === 'N/A' || r.includes('TBD') || r === 'Unknown') return -1;
            const match = r.match(/(\d+(\.\d+)?)/);
            return match ? parseFloat(match[1]) : -1;
        };

        const extractYear = (y: string) => {
             if (!y || y === 'Unknown') return -1;
             const match = y.match(/(\d{4})/);
             return match ? parseInt(match[1], 10) : -1;
        };

        if (viewMode === 'alpha') {
            result.sort((a, b) => a.title.localeCompare(b.title));
        } else if (viewMode === 'date_desc') {
            result.sort((a, b) => extractYear(b.year) - extractYear(a.year));
        } else if (viewMode === 'rating_desc') {
            result.sort((a, b) => extractRating(b.rating) - extractRating(a.rating));
        } else if (viewMode === 'rating_asc') {
            result.sort((a, b) => {
                 const rA = extractRating(a.rating);
                 const rB = extractRating(b.rating);
                 if (rA === -1 && rB !== -1) return 1;
                 if (rB === -1 && rA !== -1) return -1;
                 return rA - rB;
            });
        }
        return result;
    }, [films, viewMode, searchTerm]);

    // Handle scroll for navbar bg
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div className="min-h-screen text-white pb-[calc(max(env(safe-area-inset-bottom),_5rem))] font-sans">
            {/* Navbar - Logo Removed */}
            <nav className={`fixed top-0 w-full z-40 transition-all duration-300 px-4 md:px-12 pt-[calc(max(env(safe-area-inset-top),_1rem))] pb-4 flex items-center justify-center md:justify-end ${scrolled ? 'glass-style-navbar' : 'bg-transparent'}`}>
                <div className="flex items-center w-full md:w-auto gap-2">
                    <div className="relative flex-1 md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Titles, people, genres"
                            className="bg-black/80 border border-gray-600 text-white text-sm rounded-none pl-10 pr-4 py-2 w-full focus:outline-none focus:border-white transition-all shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <select
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value as ViewMode)}
                        className="bg-black/80 border border-gray-600 text-white text-sm rounded-none px-4 py-2 flex-1 md:w-56 overflow-hidden text-ellipsis focus:outline-none focus:border-white transition-all shadow-sm cursor-pointer"
                    >
                        <option value="category">Category View</option>
                        <option value="alpha">Alphabetical (A-Z)</option>
                        <option value="date_desc">Release Date (Newest)</option>
                        <option value="rating_desc">IMDb Rating (Highest)</option>
                        <option value="rating_asc">IMDb Rating (Lowest)</option>
                    </select>
                </div>
            </nav>

            {/* Cinematic Hero Billboard (Hidden on search/filter) */}
            {!searchTerm && viewMode === 'category' && featuredFilms.length > 0 && (
                <div 
                    onClick={() => handleFilmClick(featuredFilms[featuredIndex], films)}
                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                    onTouchEnd={(e) => {
                        const touchEndX = e.changedTouches[0].clientX;
                        const deltaX = touchEndX - touchStartX.current;
                        if (Math.abs(deltaX) > 50) {
                            if (deltaX > 0) setFeaturedIndex((curr) => (curr - 1 + featuredFilms.length) % featuredFilms.length);
                            else setFeaturedIndex((curr) => (curr + 1) % featuredFilms.length);
                        }
                    }}
                    className="relative h-[65vh] md:h-[85vh] w-full overflow-hidden bg-black group cursor-pointer pt-[calc(max(env(safe-area-inset-top),_8rem))]"
                >
                    <style>{`
                        @keyframes slideInX { 
                            0% { opacity: 0; transform: translateX(40px); } 
                            100% { opacity: 1; transform: translateX(0); } 
                        }
                        @keyframes nativeFade { 
                            0% { opacity: 0.5; filter: blur(2px); } 
                            100% { opacity: 1; filter: blur(0px); } 
                        }
                    `}</style>
                    <div 
                        key={featuredFilms[featuredIndex].id} 
                        className="w-full h-full absolute inset-0 flex items-end justify-start pb-4 md:pb-24 px-6 md:px-24"
                        style={{ animation: 'nativeFade 0.6s ease-out forwards' }}
                    >
                        {/* Background Autoplay Trailer */}
                        <div className="absolute inset-0 z-0">
                            <iframe
                                 src={`https://www.youtube.com/embed/${featuredFilms[featuredIndex].trailer_key}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&iv_load_policy=3&loop=1&playlist=${featuredFilms[featuredIndex].trailer_key}&disablekb=1`}
                                 frameBorder="0"
                                 allow="autoplay"
                                 className="w-full h-full object-cover scale-[1.35] opacity-60 pointer-events-none"
                            ></iframe>
                        </div>

                        {/* Gradient Fade Overlays */}
                        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/90 md:from-black via-black/40 to-transparent z-10 pointer-events-none"></div>
                        <div className="absolute inset-y-0 left-0 w-[80%] md:w-[50%] bg-gradient-to-r from-black/80 md:from-black via-black/40 to-transparent z-10 pointer-events-none"></div>

                        {/* Billboard Content (Typography Slides In) */}
                        <div className="relative z-20 max-w-3xl space-y-4 md:space-y-6" style={{ animation: 'slideInX 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                        <h1 className="text-white font-black text-4xl md:text-8xl tracking-tighter drop-shadow-2xl leading-tight">
                            {featuredFilms[featuredIndex].title}
                        </h1>
                        <p className="text-gray-300 text-lg md:text-xl line-clamp-3 font-medium drop-shadow-md">
                            {featuredFilms[featuredIndex].description}
                        </p>
                        
                        <div className="flex gap-4 pt-4">
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleFilmClick(featuredFilms[featuredIndex], films); }}
                                className="px-8 py-3 bg-white text-black font-bold rounded flex items-center gap-3 hover:bg-gray-200 transition-all shadow-lg hover:scale-105"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                Play Trailer
                            </button>
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleFilmClick(featuredFilms[featuredIndex], films); }}
                                className="px-8 py-3 bg-gray-500/50 text-white font-medium rounded flex items-center gap-3 hover:bg-gray-500/80 transition-all backdrop-blur shadow-lg hover:scale-105"
                            >
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                More Info
                            </button>
                        </div>
                    </div>
                </div>

                {/* Navigation Arrows (Massive Hitboxes) */}
                    <div 
                        onClick={(e) => {
                            e.stopPropagation();
                            setFeaturedIndex((curr) => (curr - 1 + featuredFilms.length) % featuredFilms.length);
                        }}
                        className="absolute left-0 top-0 bottom-0 w-24 z-30 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 hover:backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 hidden md:flex"
                    >
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
                    </div>
                    
                    <div 
                        onClick={(e) => {
                            e.stopPropagation();
                            setFeaturedIndex((curr) => (curr + 1) % featuredFilms.length);
                        }}
                        className="absolute right-0 top-0 bottom-0 w-24 z-30 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 hover:backdrop-blur-sm transition-all opacity-0 group-hover:opacity-100 hidden md:flex"
                    >
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                    </div>
                </div>
            )}

            {/* Content Feed */}
            <div className={`space-y-4 ${!searchTerm && viewMode === 'category' ? 'pb-12 pt-8 md:pt-16' : 'pt-24'}`}>
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center mt-32 text-gray-400">
                        <Loader2 className="animate-spin mb-4" size={48} />
                        <p className="font-medium tracking-wide">Loading from Razin database...</p>
                    </div>
                ) : viewMode === 'category' ? (
                    <>
                        {Object.entries(categories)
                            .filter(([title, films]) => films.length > 0)
                            .map(([title, films]) => (
                            <CategoryRow
                                key={title}
                                title={title}
                                films={films}
                                onFilmClick={(film) => handleFilmClick(film, films)}
                            />
                        ))}
                        {searchTerm && categories['Search Results'].length === 0 && (
                            <div className="text-center text-gray-500 mt-20">No matching titles found.</div>
                        )}
                    </>
                ) : (
                    <div className="px-4 md:px-12">
                        {sortedFilms.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                {sortedFilms.map((film) => (
                                    <MovieCard
                                        key={film.id}
                                        film={film}
                                        onClick={(f) => handleFilmClick(f, sortedFilms)}
                                        isGrid={true}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="text-center text-gray-500 mt-20">No films found.</div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="text-center pb-8 pt-12 text-sm text-gray-500">
                © 2025 Razin Flix.
            </div>

            {/* Modal */}
            {
                selectedFilm && (
                    <MovieModal
                        film={selectedFilm}
                        filmList={films}
                        onClose={() => setSelectedFilm(null)}
                        onNext={handleNextFilm}
                        onPrev={handlePrevFilm}
                        onSelect={setSelectedFilm}
                        onSearch={(term) => {
                            setSearchTerm(term);
                            setViewMode('category'); 
                            setSelectedFilm(null);
                        }}
                    />
                )
            }
        </div >
    );
}
