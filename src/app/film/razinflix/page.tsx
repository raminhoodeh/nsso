'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import CategoryRow from '@/components/film/CategoryRow';
import MovieModal from '@/components/film/MovieModal';
import MovieCard, { type Film } from '@/components/film/MovieCard';
import AddFilmModal from '@/components/film/AddFilmModal';
import { Search, Loader2, ChevronLeft, ChevronRight, Plus, X, Pause, Play } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import {
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassField,
    TahoeGlassProvider,
    TahoeGlassSurface,
    type TahoeGlassWebGLSource,
} from '@/components/ui/tahoe-glass';
import GlobalNavigation from '@/components/layout/GlobalNavigation';
import ConditionalNSSOAgent from '@/components/agent/ConditionalNSSOAgent';
import { ToastViewport } from '@/components/ui/Toast';
import modalStyles from '@/components/film/MovieModal.module.css';
import styles from './razinflix.module.css';

type ViewMode = 'category' | 'alpha' | 'date_desc' | 'rating_desc' | 'rating_asc' | 'update_mode';

function matchesFilmSearch(film: Film, query: string) {
    return [film.title, film.director, film.description, ...(film.categories ?? [])]
        .some(value => value?.toLowerCase().includes(query));
}

export default function RazinFlixPage() {
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('category');
    const [selectedFilm, setSelectedFilm] = useState<Film | null>(null);
    const [featuredFilms, setFeaturedFilms] = useState<Film[]>([]);
    const [featuredIndex, setFeaturedIndex] = useState(0);
    const [rotationPaused, setRotationPaused] = useState(false);
    const [heroHasFocus, setHeroHasFocus] = useState(false);
    const [modalContext, setModalContext] = useState<{ list: Film[], index: number }>({ list: [], index: 0 });
    const [scrolled, setScrolled] = useState(false);
    const [films, setFilms] = useState<Film[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [brokenPosters, setBrokenPosters] = useState<Set<number>>(new Set());
    const [isCheckingPosters, setIsCheckingPosters] = useState(false);
    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [adminPassword, setAdminPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const heroTouchStart = useRef<{ x: number; y: number } | null>(null);
    const suppressHeroClick = useRef(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchQuery = searchTerm.trim().toLowerCase();
    const previewsDisabled = Boolean(selectedFilm || isAddModalOpen || isPasswordDialogOpen);

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

    useEffect(() => {
        // Cache the five scene images before they enter the rotation.
        const images = featuredFilms.map(film => {
            const image = new window.Image();
            image.src = `/api/razinflix/hero/${encodeURIComponent(film.trailer_key!)}`;
            return image;
        });
        return () => images.forEach(image => { image.src = ''; });
    }, [featuredFilms]);

    useEffect(() => {
        if (featuredFilms.length < 2 || previewsDisabled || rotationPaused || heroHasFocus) return;
        let timer: ReturnType<typeof setInterval> | undefined;
        const restart = () => {
            clearInterval(timer);
            if (!document.hidden) {
                timer = setInterval(() => {
                    setFeaturedIndex(index => (index + 1) % featuredFilms.length);
                }, 5000);
            }
        };
        restart();
        document.addEventListener('visibilitychange', restart);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', restart);
        };
    }, [featuredFilms.length, featuredIndex, previewsDisabled, rotationPaused, heroHasFocus]);

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

    const rotationControl = (
        <button
            type="button"
            className={modalStyles.control}
            aria-label={rotationPaused ? 'Resume background rotation' : 'Pause background rotation'}
            title={rotationPaused ? 'Resume background rotation' : 'Pause background rotation'}
            aria-pressed={rotationPaused}
            onClick={() => setRotationPaused(paused => !paused)}
        >
            {rotationPaused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
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
        const index = list.findIndex(item => item.id === film.id);
        setModalContext(index >= 0 ? { list, index } : { list: [film], index: 0 });
    };

    const handleSimilarFilmClick = (film: Film) => {
        const list = modalContext.list.some(item => item.id === film.id) ? modalContext.list : films;
        handleFilmClick(film, list);
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
        
        if (!searchQuery) {
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
            cats['Search Results'] = films.filter(film => matchesFilmSearch(film, searchQuery));
            return cats;
        }
    }, [searchQuery, films]);

    // Flat sorted array for dynamic views
    const sortedFilms = useMemo(() => {
        if (viewMode === 'category') return [];

        let result = [...films];

        // Apply search filtering first
        if (searchQuery) {
             result = result.filter(film => matchesFilmSearch(film, searchQuery));
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
    }, [films, viewMode, searchQuery, brokenPosters]);

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
                    data-razinflix-background={featuredFilm?.id ?? ''}
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
        <GlobalNavigation />
        <div className="min-h-screen text-white pb-[calc(max(env(safe-area-inset-bottom),_5rem))] font-sans relative">
            <div aria-hidden="true" className={styles.backgroundShade} data-razinflix-background-shade="true">
                <div key={heroSceneUrl} className={styles.backgroundFade} />
            </div>
            {/* Navbar */}
            <TahoeGlassSurface
                as="nav"
                variant="menu"
                radius="0 0 24px 24px"
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={scrolled ? 0.08 : 0.025}
                className="fixed top-0 w-full z-40 transition-all duration-300 px-4 md:px-12 pt-[calc(max(env(safe-area-inset-top),_1rem))] pb-4"
                contentClassName="flex min-w-0 flex-col md:flex-row items-center justify-between gap-3"
            >
                
                {/* Keep desktop controls in normal flow at tablet widths. */}
                <div className="hidden shrink-0 items-center gap-2 md:flex">
                    <TahoeGlassButton
                        onClick={requestAddFilmAccess}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.04}
                        className="min-h-11 whitespace-nowrap px-4 py-2 hover:scale-105"
                        contentClassName="flex items-center justify-center gap-1 text-sm font-semibold text-white"
                    >
                        <Plus size={16} /> Add Film
                    </TahoeGlassButton>
                    {rotationControl}
                </div>

                {/* Desktop Right Side Navigation */}
                <div className="flex min-w-0 w-full items-center justify-between gap-2 md:ml-auto md:flex-1 md:max-w-2xl">
                    <TahoeGlassSurface
                        variant="recessed"
                        radius={12}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.035}
                        className="relative min-w-0 flex-1 p-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white"
                        contentClassName="flex items-center gap-2"
                    >
                        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                        <input
                            ref={searchInputRef}
                            type="search"
                            placeholder="Titles, directors, genres"
                            aria-label="Search films"
                            className={`relative min-h-11 w-full min-w-0 bg-transparent py-2 pl-10 text-base text-white outline-none placeholder:text-white/55 [&::-webkit-search-cancel-button]:appearance-none ${searchTerm ? 'pr-12' : 'pr-3'}`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                className="absolute right-0 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-white focus-visible:outline-2 focus-visible:outline-white"
                                onClick={() => { setSearchTerm(''); searchInputRef.current?.focus(); }}
                            >
                                <X size={18} aria-hidden="true" />
                            </button>
                        )}
                    </TahoeGlassSurface>
                    <TahoeGlassField
                        visuallyHideLabel
                        label="Film view"
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.035}
                        className="min-w-0 flex-1 md:w-56 md:flex-none"
                        surfaceClassName="p-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-white"
                        controlClassName="min-h-11 cursor-pointer overflow-hidden text-ellipsis px-3 py-2 text-base text-white [&>option]:bg-neutral-900 [&>option]:text-white"
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
                <div className="md:hidden w-full flex justify-end gap-2">
                    <TahoeGlassButton
                        onClick={requestAddFilmAccess}
                        tone="light"
                        semanticTint="dark"
                        semanticTintOpacity={0.04}
                        className="min-h-11 w-full px-4 py-2.5"
                        contentClassName="flex items-center justify-center gap-1 text-sm font-semibold text-white"
                    >
                        <Plus size={16} /> Add Film
                    </TahoeGlassButton>
                    {rotationControl}
                </div>
            </TahoeGlassSurface>

            {/* Cinematic Hero Billboard (Hidden on search/filter) */}
            {!searchQuery && viewMode === 'category' && featuredFilms.length > 0 && (
                <div 
                    onFocusCapture={() => setHeroHasFocus(true)}
                    onBlurCapture={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setHeroHasFocus(false);
                    }}
                    onClick={() => {
                        if (suppressHeroClick.current) {
                            suppressHeroClick.current = false;
                            return;
                        }
                        handleFilmClick(featuredFilms[featuredIndex], films);
                    }}
                    onPointerDown={() => { suppressHeroClick.current = false; }}
                    onTouchStart={(e) => {
                        if ((e.target as HTMLElement).closest('button') || e.touches.length !== 1) {
                            heroTouchStart.current = null;
                            return;
                        }
                        heroTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                    }}
                    onTouchCancel={() => { heroTouchStart.current = null; }}
                    onTouchEnd={(e) => {
                        const start = heroTouchStart.current;
                        heroTouchStart.current = null;
                        if (!start) return;
                        const deltaX = e.changedTouches[0].clientX - start.x;
                        const deltaY = e.changedTouches[0].clientY - start.y;
                        if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
                            suppressHeroClick.current = true;
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

                        {/* Featured-film controls remain available on touch and keyboard. */}
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFeaturedIndex((curr) => (curr - 1 + featuredFilms.length) % featuredFilms.length); }}
                            aria-label="Previous featured film"
                            className={`${modalStyles.control} !hidden md:!inline-flex absolute left-6 top-1/2 -translate-y-1/2 z-50`}
                        >
                            <ChevronLeft size={24} aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFeaturedIndex((curr) => (curr + 1) % featuredFilms.length); }}
                            aria-label="Next featured film"
                            className={`${modalStyles.control} !hidden md:!inline-flex absolute right-6 top-1/2 -translate-y-1/2 z-50`}
                        >
                            <ChevronRight size={24} aria-hidden="true" />
                        </button>

                        {/* Billboard Content (Typography Slides In) */}
                        <div className="relative z-20 max-w-3xl space-y-4 md:space-y-6" style={{ animation: 'slideInX 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards' }}>
                        <h1 className="text-white font-black text-4xl md:text-8xl tracking-tighter drop-shadow-2xl leading-tight capitalize">
                            {featuredFilms[featuredIndex].title}
                        </h1>
                        <p className="text-gray-300 text-lg md:text-xl line-clamp-3 font-medium drop-shadow-md">
                            {featuredFilms[featuredIndex].description}
                        </p>
                        
                        <div className="flex flex-wrap gap-3 pt-6">
                            <TahoeGlassButton
                                onClick={(e) => { e.stopPropagation(); handleFilmClick(featuredFilms[featuredIndex], films); }}
                                tone="light"
                                semanticTint="light"
                                semanticTintOpacity={0.08}
                                className="px-5 py-2.5 hover:scale-105 whitespace-nowrap"
                                contentClassName="flex items-center gap-2 text-sm md:text-base font-bold text-white"
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
                            <div className="flex w-full justify-end gap-2 md:hidden">
                                <button
                                    type="button"
                                    className={modalStyles.control}
                                    aria-label="Previous featured film"
                                    onClick={(event) => { event.stopPropagation(); setFeaturedIndex(current => (current - 1 + featuredFilms.length) % featuredFilms.length); }}
                                >
                                    <ChevronLeft size={24} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    className={modalStyles.control}
                                    aria-label="Next featured film"
                                    onClick={(event) => { event.stopPropagation(); setFeaturedIndex(current => (current + 1) % featuredFilms.length); }}
                                >
                                    <ChevronRight size={24} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            )}

            {/* Content Feed */}
            <div className={`relative z-10 space-y-4 ${!searchQuery && viewMode === 'category' ? 'pb-12 pt-8 md:pt-16' : 'pt-44 md:pt-24'}`}>
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
                                previewsDisabled={previewsDisabled}
                                onFilmClick={(film) => handleFilmClick(film, films)}
                            />
                        ))}
                        {searchQuery && categories['Search Results'].length === 0 && (
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
                                        previewsDisabled={previewsDisabled}
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
                className={modalStyles.nestedDialog}
                overlayClassName={modalStyles.nestedOverlay}
                backdropClassName={modalStyles.nestedBackdrop}
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
                        surfaceClassName="p-0"
                        controlClassName="min-h-11 px-3 py-2 text-base"
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
                            tone="light"
                            semanticTint="light"
                            semanticTintOpacity={0.08}
                            className="px-5 py-2.5"
                            contentClassName="text-white"
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
                        onSelect={handleSimilarFilmClick}
                        onUpdate={(updatedFilm) => {
                            setFilms(prev => prev.map(f => f.id === updatedFilm.id ? updatedFilm : f));
                            setModalContext(prev => ({ ...prev, list: prev.list.map(f => f.id === updatedFilm.id ? updatedFilm : f) }));
                            setSelectedFilm(updatedFilm);
                        }}
                        onDelete={(id) => {
                            setFilms(prev => prev.filter(f => f.id !== id));
                            setModalContext(prev => ({ list: prev.list.filter(f => f.id !== id), index: 0 }));
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
        <ConditionalNSSOAgent />
        <ToastViewport />
        </TahoeGlassProvider>
    );
}
