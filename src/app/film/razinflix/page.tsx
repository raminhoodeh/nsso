'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import CategoryRow from '@/components/film/CategoryRow';
import MovieModal from '@/components/film/MovieModal';
import MovieCard, { type Film } from '@/components/film/MovieCard';
import AddFilmModal from '@/components/film/AddFilmModal';
import { Search, Loader2, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import {
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassField,
    TahoeGlassProvider,
    TahoeGlassSurface,
    type TahoeGlassWebGLSource,
} from '@/components/ui/tahoe-glass';

type ViewMode = 'category' | 'alpha' | 'date_desc' | 'rating_desc' | 'rating_asc' | 'update_mode';

export default function RazinFlixPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('category');
    const [selectedFilm, setSelectedFilm] = useState<Film | null>(null);
    const [featuredFilms, setFeaturedFilms] = useState<Film[]>([]);
    const [featuredIndex, setFeaturedIndex] = useState(0);
    const [modalContext, setModalContext] = useState<{ list: Film[], index: number }>({ list: [], index: 0 });
    const [scrolled, setScrolled] = useState(false);
    const [films, setFilms] = useState<Film[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [brokenPosters, setBrokenPosters] = useState<Set<number>>(new Set());
    const [isCheckingPosters, setIsCheckingPosters] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const touchStartX = useRef(0);

    useEffect(() => {
        if (viewMode === 'update_mode' && !isCheckingPosters && films.length > 0) {
            setIsCheckingPosters(true);
            const checkAll = async () => {
                const batchSize = 10;
                for (let i = 0; i < films.length; i += batchSize) {
                    const batch = films.slice(i, i + batchSize);
                    const newlyBroken = new Set<number>();
                    await Promise.all(batch.map(async (f) => {
                        if (!f.poster || f.poster === 'N/A') return;
                        const p = f.poster.toLowerCase();
                        if (p.includes('null') || p.includes('placeholder') || p.includes('nopicture') || p.includes('no-image')) return;
                        
                        const isValid = await new Promise<boolean>((resolve) => {
                             const img = new window.Image();
                             let isDone = false;
                             const timeout = setTimeout(() => {
                                 if (!isDone) {
                                     isDone = true;
                                     img.src = ''; // Cancel loading attempt
                                     resolve(false); // Assume broken if hangs > 4s
                                 }
                             }, 4000);
                             
                             img.onload = () => {
                                 if (!isDone) {
                                     isDone = true;
                                     clearTimeout(timeout);
                                     resolve(true);
                                 }
                             };
                             img.onerror = () => {
                                 if (!isDone) {
                                     isDone = true;
                                     clearTimeout(timeout);
                                     resolve(false);
                                 }
                             };
                             img.src = f.poster;
                        });
                        if (!isValid) {
                             newlyBroken.add(f.id);
                        }
                    }));
                    if (newlyBroken.size > 0) {
                        setBrokenPosters(prev => new Set([...prev, ...newlyBroken]));
                    }
                }
            };
            checkAll();
        }
    }, [viewMode, films, isCheckingPosters]);

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
                    const loadedFilms = data as Film[];
                    setFilms(loadedFilms);
                    // Select 5 random featured films with a trailer
                    const filmsWithTrailers = loadedFilms.filter(film => film.trailer_key);
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

    const featuredFilm = featuredFilms[featuredIndex];
    const heroSceneUrl = featuredFilm?.trailer_key
        ? `/api/razinflix/hero/${encodeURIComponent(featuredFilm.trailer_key)}`
        : '/siri-gradient.png';
    const heroWebglSource = useMemo<TahoeGlassWebGLSource>(
        () => ({
            kind: 'image',
            src: heroSceneUrl,
            fit: 'cover',
            label: 'razinflix-featured',
        }),
        [heroSceneUrl],
    );

    const requestAddFilmAccess = () => {
        setAdminPassword('');
        setPasswordError(null);
        setIsPasswordDialogOpen(true);
    };

    const confirmAddFilmAccess = () => {
        if (adminPassword.trim().toLowerCase() !== 'azinam') {
            setPasswordError('Incorrect password.');
            return;
        }
        setIsPasswordDialogOpen(false);
        setAdminPassword('');
        setPasswordError(null);
        setIsAddModalOpen(true);
    };

    const handleFilmClick = (film: Film, list: Film[]) => {
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
        const cats: Record<string, Film[]> = {};
        
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

            // Post-process to aggressively consolidate and delete visually thin categories
            const finalCats: Record<string, Film[]> = {};
            const leftovers: Film[] = [];
            
            Object.keys(cats).forEach(key => {
                 if (cats[key].length < 5) {
                     leftovers.push(...cats[key]);
                 } else {
                     finalCats[key] = cats[key];
                 }
            });

            if (leftovers.length > 0) {
                 if (!finalCats["Visually Striking Emotional Dramas"]) finalCats["Visually Striking Emotional Dramas"] = [];
                 finalCats["Visually Striking Emotional Dramas"].push(...leftovers);
            }
            return finalCats;
        } else {
            cats['Search Results'] = films.filter(f =>
                f.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.director.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.description.toLowerCase().includes(searchTerm.toLowerCase())
            );
            return cats;
        }
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
        } else if (viewMode === 'update_mode') {
            const hasMissingPoster = (f: Film) => {
                if (!f.poster || f.poster === 'N/A') return true;
                const p = f.poster.toLowerCase();
                if (p.includes('null') || p.includes('placeholder') || p.includes('nopicture') || p.includes('no-image')) return true;
                if (brokenPosters.has(f.id)) return true;
                return false;
            };

            const hasMissingTrailer = (f: Film) => !f.trailer_key;
            
            result.sort((a, b) => {
                const aNoPoster = hasMissingPoster(a);
                const bNoPoster = hasMissingPoster(b);
                if (aNoPoster && !bNoPoster) return -1;
                if (!aNoPoster && bNoPoster) return 1;

                const aNoTrailer = hasMissingTrailer(a);
                const bNoTrailer = hasMissingTrailer(b);
                if (aNoTrailer && !bNoTrailer) return -1;
                if (!aNoTrailer && bNoTrailer) return 1;

                return extractYear(b.year) - extractYear(a.year);
            });
        }
        return result;
    }, [films, viewMode, searchTerm, brokenPosters]);

    // Handle scroll for navbar bg
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 50);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <TahoeGlassProvider
            scene={(
                <div
                    className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                    style={{ backgroundImage: `url(${JSON.stringify(heroSceneUrl)})` }}
                />
            )}
            sourceLabel="razinflix-featured"
            webglSource={heroWebglSource}
            preferredBackend="auto"
            fallback="webgl"
            className="min-h-screen bg-black text-white font-sans"
            contentClassName="min-h-screen"
        >
        <div className="min-h-screen text-white pb-[calc(max(env(safe-area-inset-bottom),_5rem))] font-sans relative">
            <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.5)_65%,rgba(0,0,0,0.78))]" />
            {/* Navbar */}
            <TahoeGlassSurface
                as="nav"
                variant="menu"
                radius={0}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={scrolled ? 0.08 : 0.025}
                className="fixed top-0 w-full z-40 transition-all duration-300 px-4 md:px-12 pt-[calc(max(env(safe-area-inset-top),_1rem))] pb-4"
                contentClassName="flex flex-col md:flex-row items-center justify-between gap-3 md:gap-0"
            >
                
                {/* Desktop Add Button (Absolute Left) */}
                <div className="hidden md:block absolute left-12 top-1/2 -translate-y-1/2">
                    <TahoeGlassButton
                        onClick={requestAddFilmAccess}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.04}
                        className="px-4 py-2 hover:scale-105"
                        contentClassName="flex items-center justify-center gap-1 text-sm font-semibold text-white"
                    >
                        <Plus size={16} /> Add Film
                    </TahoeGlassButton>
                </div>

                {/* Desktop Right Side Navigation */}
                <div className="flex w-full md:w-auto items-center justify-between md:justify-end gap-2 md:ml-auto">
                    <TahoeGlassSurface
                        variant="recessed"
                        radius={12}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.035}
                        className="relative flex-1 md:w-96 px-3 py-2"
                        contentClassName="flex items-center gap-2"
                    >
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            type="text"
                            placeholder="Titles, people, genres"
                            aria-label="Search films"
                            className="w-full bg-transparent pl-7 pr-1 text-sm text-white outline-none placeholder:text-white/55"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </TahoeGlassSurface>
                    <TahoeGlassField
                        visuallyHideLabel
                        label="Film view"
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.035}
                        className="flex-1 md:w-56"
                        surfaceClassName="px-4 py-2"
                        controlClassName="cursor-pointer overflow-hidden text-ellipsis text-sm text-white"
                    >
                        <select
                            value={viewMode}
                            onChange={(e) => setViewMode(e.target.value as ViewMode)}
                        >
                            <option value="category">Category View</option>
                            <option value="alpha">Alphabetical (A-Z)</option>
                            <option value="date_desc">Release Date (Newest)</option>
                            <option value="rating_desc">IMDb Rating (Highest)</option>
                            <option value="rating_asc">IMDb Rating (Lowest)</option>
                            <option value="update_mode">Update Mode</option>
                        </select>
                    </TahoeGlassField>
                </div>

                {/* Mobile Add Button Row (Under Search) */}
                <div className="md:hidden w-full flex justify-end">
                    <TahoeGlassButton
                        onClick={requestAddFilmAccess}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.04}
                        className="w-full px-4 py-2.5"
                        contentClassName="flex items-center justify-center gap-1 text-sm font-semibold text-white"
                    >
                        <Plus size={16} /> Add Film
                    </TahoeGlassButton>
                </div>
            </TahoeGlassSurface>

            {/* Cinematic Hero Billboard (Hidden on search/filter) */}
            {!searchTerm && viewMode === 'category' && featuredFilms.length > 0 && (
                <div 
                    onClick={() => {
                        handleFilmClick(featuredFilms[featuredIndex], films);
                    }}
                    onTouchStart={(e) => { touchStartX.current = e.touches[0].clientX; }}
                    onTouchEnd={(e) => {
                        const touchEndX = e.changedTouches[0].clientX;
                        const deltaX = touchEndX - touchStartX.current;
                        if (Math.abs(deltaX) > 50) {
                            if (deltaX > 0) setFeaturedIndex((curr) => (curr - 1 + featuredFilms.length) % featuredFilms.length);
                            else setFeaturedIndex((curr) => (curr + 1) % featuredFilms.length);
                        }
                    }}
                    className="relative z-10 h-[75vh] md:h-[85vh] w-full overflow-hidden group cursor-pointer pt-[calc(max(env(safe-area-inset-top),_8rem))]"
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
                        {/* Gradient Fade Overlays */}
                        <div className="absolute inset-x-0 bottom-0 h-[60%] bg-gradient-to-t from-black/90 md:from-black via-black/40 to-transparent z-10 pointer-events-none"></div>
                        <div className="absolute inset-y-0 left-0 w-[80%] md:w-[50%] bg-gradient-to-r from-black/80 md:from-black via-black/40 to-transparent z-10 pointer-events-none"></div>

                        {/* Desktop Hero Controls */}
                        <TahoeGlassButton
                            onClick={(e) => { e.stopPropagation(); setFeaturedIndex((curr) => (curr - 1 + featuredFilms.length) % featuredFilms.length); }}
                            aria-label="Previous featured film"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.03}
                            className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 z-50 p-4 text-white/70 hover:text-white"
                            contentClassName="flex items-center justify-center text-white"
                        >
                            <ChevronLeft size={36} />
                        </TahoeGlassButton>
                        <TahoeGlassButton
                            onClick={(e) => { e.stopPropagation(); setFeaturedIndex((curr) => (curr + 1) % featuredFilms.length); }}
                            aria-label="Next featured film"
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.03}
                            className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 z-50 p-4 text-white/70 hover:text-white"
                            contentClassName="flex items-center justify-center text-white"
                        >
                            <ChevronRight size={36} />
                        </TahoeGlassButton>

                        {/* Billboard Content (Typography Slides In) */}
                        <div className="relative z-20 max-w-3xl space-y-4 md:space-y-6" style={{ animation: 'slideInX 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                        <h1 className="text-white font-black text-4xl md:text-8xl tracking-tighter drop-shadow-2xl leading-tight capitalize">
                            {featuredFilms[featuredIndex].title}
                        </h1>
                        <p className="text-gray-300 text-lg md:text-xl line-clamp-3 font-medium drop-shadow-md">
                            {featuredFilms[featuredIndex].description}
                        </p>
                        
                        <div className="flex gap-3 pt-6">
                            <TahoeGlassButton
                                onClick={(e) => { e.stopPropagation(); handleFilmClick(featuredFilms[featuredIndex], films); }}
                                tone="dark"
                                semanticTint="light"
                                semanticTintOpacity={0.08}
                                className="px-5 py-2.5 hover:scale-105 whitespace-nowrap"
                                contentClassName="flex items-center gap-2 text-sm md:text-base font-bold text-black/90"
                            >
                                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                Play Trailer
                            </TahoeGlassButton>
                            <TahoeGlassButton
                                onClick={(e) => { e.stopPropagation(); handleFilmClick(featuredFilms[featuredIndex], films); }}
                                tone="light"
                                semanticTint="dark"
                                semanticTintOpacity={0.035}
                                className="px-5 py-2.5 hover:scale-105 whitespace-nowrap"
                                contentClassName="flex items-center gap-2 text-sm md:text-base font-medium text-white"
                            >
                                <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                More Info
                            </TahoeGlassButton>
                        </div>
                    </div>
                </div>
                </div>
            )}

            {/* Content Feed */}
            <div className={`relative z-10 space-y-4 ${!searchTerm && viewMode === 'category' ? 'pb-12 pt-8 md:pt-16' : 'pt-44 md:pt-24'}`}>
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center mt-32 text-gray-400">
                        <Loader2 className="animate-spin mb-4" size={48} />
                        <p className="font-medium tracking-wide">Loading from Razin database...</p>
                    </div>
                ) : viewMode === 'category' ? (
                    <>
                        {Object.entries(categories)
                            .filter(([, categoryFilms]) => categoryFilms.length > 0)
                            .sort(([titleA], [titleB]) => {
                                if (titleA === 'Recently Added') return -1;
                                if (titleB === 'Recently Added') return 1;
                                return 0;
                            })
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
            <div className="relative z-10 text-center pb-6 pt-8 text-sm text-gray-400">
                © 2026 RazinFlix.
            </div>

            <TahoeGlassDialog
                open={isPasswordDialogOpen}
                onOpenChange={(open) => {
                    setIsPasswordDialogOpen(open);
                    if (!open) {
                        setAdminPassword('');
                        setPasswordError(null);
                    }
                }}
                title="Add a film"
                description="Enter the RazinFlix administrator password to continue."
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.04}
                className="max-w-md"
            >
                <form
                    className="mt-5 space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        confirmAddFilmAccess();
                    }}
                >
                    <TahoeGlassField
                        label="Password"
                        error={passwordError}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.025}
                    >
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={adminPassword}
                            onChange={(event) => {
                                setAdminPassword(event.target.value);
                                setPasswordError(null);
                            }}
                        />
                    </TahoeGlassField>
                    <div className="flex justify-end gap-3">
                        <TahoeGlassButton
                            onClick={() => setIsPasswordDialogOpen(false)}
                            tone="light"
                            className="px-5 py-2.5"
                            contentClassName="text-white"
                        >
                            Cancel
                        </TahoeGlassButton>
                        <TahoeGlassButton
                            type="submit"
                            tone="dark"
                            semanticTint="light"
                            semanticTintOpacity={0.08}
                            className="px-5 py-2.5"
                            contentClassName="text-black/90"
                        >
                            Continue
                        </TahoeGlassButton>
                    </div>
                </form>
            </TahoeGlassDialog>

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
                        onUpdate={(updatedFilm) => {
                            setFilms(prev => prev.map(f => f.id === updatedFilm.id ? updatedFilm : f));
                            setSelectedFilm(updatedFilm);
                        }}
                        onDelete={(id) => {
                            setFilms(prev => prev.filter(f => f.id !== id));
                        }}
                        onSearch={(term) => {
                            setSearchTerm(term);
                            setViewMode('category'); 
                            setSelectedFilm(null);
                        }}
                    />
                )
            }

            {isAddModalOpen && (
                <AddFilmModal 
                    onClose={() => setIsAddModalOpen(false)} 
                    onFilmAdded={(newFilm) => {
                        setFilms(prev => {
                            const existingIndex = prev.findIndex(film => film.id === newFilm.id);
                            if (existingIndex === -1) return [newFilm, ...prev];
                            return prev.map(film => film.id === newFilm.id ? newFilm : film);
                        });
                    }} 
                />
            )}
        </div>
        </TahoeGlassProvider>
    );
}
