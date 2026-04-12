'use client';

import React, { useState, useEffect, useMemo } from 'react';
import filmsData from '@/data/films.json';
import CategoryRow from '@/components/film/CategoryRow';
import MovieModal from '@/components/film/MovieModal';
import MovieCard from '@/components/film/MovieCard';
import { Search } from 'lucide-react';

type ViewMode = 'category' | 'alpha' | 'date_desc' | 'rating_desc' | 'rating_asc';
import { useUI } from '@/components/providers/UIProvider';

export default function RazinFlixPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('category');
    const [selectedFilm, setSelectedFilm] = useState<any>(null);
    const [modalContext, setModalContext] = useState<{ list: any[], index: number }>({ list: [], index: 0 });
    const [scrolled, setScrolled] = useState(false);

    const { setBackgroundDimmed } = useUI();

    useEffect(() => {
        setBackgroundDimmed(true);
        return () => setBackgroundDimmed(false);
    }, [setBackgroundDimmed]);

    // Type assertion for filmsData if needed, or just let it infer
    const films: any[] = filmsData as any[];

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
                film.categories.forEach((c: string) => {
                    if (!cats[c]) cats[c] = [];
                    cats[c].push(film);
                });
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
        <div className="min-h-screen text-white pb-20 font-sans">
            {/* Navbar - Logo Removed */}
            <nav className={`fixed top-0 w-full z-40 transition-all duration-300 px-4 md:px-12 py-4 flex items-center justify-end ${scrolled ? 'glass-style-navbar' : 'bg-transparent'}`}>
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Titles, people, genres"
                        className="bg-black/80 border border-gray-600 text-white text-sm rounded-none pl-10 pr-4 py-2 w-32 md:w-64 focus:outline-none focus:border-white transition-all shadow-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <select
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value as ViewMode)}
                        className="bg-black/80 border border-gray-600 text-white text-sm rounded-none px-4 py-2 ml-2 md:ml-4 focus:outline-none focus:border-white transition-all shadow-sm cursor-pointer"
                    >
                        <option value="category">Category View</option>
                        <option value="alpha">Alphabetical (A-Z)</option>
                        <option value="date_desc">Release Date (Newest)</option>
                        <option value="rating_desc">IMDb Rating (Highest)</option>
                        <option value="rating_asc">IMDb Rating (Lowest)</option>
                    </select>
                </div>
            </nav>

            {/* Rebranded Hero Section (Hidden on search) */}
            {!searchTerm && (
                <div className="relative h-[70vh] w-full flex items-center justify-center overflow-hidden">
                    {/* Background gradient hint */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#586E91]/20 to-transparent pointer-events-none"></div>
                    <div className="text-red-600 font-extrabold text-6xl md:text-8xl tracking-tighter animate-logo select-none z-10 drop-shadow-2xl">
                        RAZIN FLIX
                    </div>
                </div>
            )}

            {/* Content Feed */}
            <div className={`space-y-4 ${!searchTerm && viewMode === 'category' ? 'pb-12' : 'pt-24'}`}>
                {viewMode === 'category' ? (
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
            <footer className="mt-20 px-12 py-8 text-gray-500 text-sm text-center">
                © 2025 Razin Flix. Data provided by CSV.
            </footer>

            {/* Modal */}
            {
                selectedFilm && (
                    <MovieModal
                        film={selectedFilm}
                        filmList={modalContext.list}
                        onClose={() => setSelectedFilm(null)}
                        onNext={handleNextFilm}
                        onPrev={handlePrevFilm}
                        onSelect={setSelectedFilm}
                    />
                )
            }
        </div >
    );
}
