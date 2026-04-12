import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Edit2, Save, Upload, Loader2, Check } from 'lucide-react';
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
    onSearch?: (term: string) => void;
}

const MovieModal = ({ film, filmList = [], onClose, onNext, onPrev, onSelect, onSearch }: MovieModalProps) => {
    const carouselRef = useRef<HTMLDivElement>(null);

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editForm, setEditForm] = useState({
        title: film?.title || '',
        description: film?.description || '',
        year: film?.year || '',
        rating: film?.rating || ''
    });
    const [editPoster, setEditPoster] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        // Reset form when film changes
        setEditForm({
            title: film?.title || '',
            description: film?.description || '',
            year: film?.year || '',
            rating: film?.rating || ''
        });
        setEditPoster(null);
        setPreviewUrl(null);
        setIsEditing(false);
    }, [film]);

    const handleSave = async () => {
        if (!film) return;
        setIsSaving(true);
        try {
            const fd = new FormData();
            fd.append('id', film.id.toString());
            fd.append('title', editForm.title);
            fd.append('description', editForm.description);
            fd.append('year', editForm.year);
            fd.append('rating', editForm.rating);
            if (editPoster) {
                fd.append('poster', editPoster);
            }

            const res = await fetch('/api/razinflix/update', {
                method: 'POST',
                body: fd
            });
            const data = await res.json();
            
            if (!res.ok) throw new Error(data.error || 'Failed to update');
            
            // Push updated film upstream
            onSelect(data.film);
            setIsEditing(false);
        } catch(err: any) {
            alert(err.message || 'Error saving file.');
        } finally {
            setIsSaving(false);
        }
    };

    // Advanced "Similar Films" Similarity Matrix (Client-Side Jaccard Indexing)
    const [similarFilms, setSimilarFilms] = useState<Film[]>([]);

    useEffect(() => {
        if (!film || !filmList.length) return;

        // Naive tokenizer stripping stop-words visually
        const getTokens = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 3);
        const targetTokens = new Set(getTokens(film.description));

        const scored = filmList.filter(f => f.id !== film.id).map(f => {
            let score = 0;
            // High weight: Director match
            if (f.director && film.director && f.director === film.director) score += 50;
            
            // Medium weight: Categorical intersection
            if (f.categories && film.categories) {
                const catOverlap = f.categories.filter(c => film.categories.includes(c)).length;
                score += (catOverlap * 10);
            }
            
            // Algorithmic weight: Description keyword Jaccard overlap
            const fTokens = getTokens(f.description || '');
            const overlap = fTokens.filter(t => targetTokens.has(t)).length;
            score += (overlap * 2); 
            
            return { film: f, score };
        });

        const recommendations = scored.sort((a, b) => b.score - a.score).slice(0, 15).map(s => s.film);
        setSimilarFilms(recommendations);
    }, [film, filmList]);


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
            {/* Back Button (Top Left) */}
            <button
                onClick={onClose}
                className="absolute left-6 top-6 z-[120] flex items-center gap-2 px-6 py-3 bg-black/40 hover:bg-black/80 text-white rounded-full backdrop-blur-md border border-white/10 transition-all duration-300 hover:scale-105 group"
            >
                <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                <span className="font-medium text-lg">Back</span>
            </button>

            {/* Edit/Save Button (Top Right) */}
            <div className="absolute right-6 top-6 z-[120] flex gap-3">
                {isEditing ? (
                    <>
                        <button
                            onClick={() => setIsEditing(false)}
                            className="flex items-center gap-2 px-6 py-3 bg-red-500/20 hover:bg-red-500/40 text-red-100 rounded-full backdrop-blur-md border border-red-500/20 transition-all duration-300"
                            disabled={isSaving}
                        >
                            <X size={20} />
                            <span className="font-medium">Cancel</span>
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-2 px-6 py-3 bg-green-500/80 hover:bg-green-500 text-white rounded-full backdrop-blur-md border border-green-400/50 transition-all duration-300"
                            disabled={isSaving}
                        >
                            {isSaving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            <span className="font-medium">{isSaving ? 'Saving...' : 'Save Changes'}</span>
                        </button>
                    </>
                ) : (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-6 py-3 bg-black/40 hover:bg-white/10 text-white rounded-full backdrop-blur-md border border-white/10 transition-all duration-300 hover:scale-105"
                    >
                        <Edit2 size={18} />
                        <span className="font-medium text-lg">Edit Record</span>
                    </button>
                )}
            </div>

            {/* Global Previous Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-50 p-3 text-white/50 hover:text-white bg-black/20 hover:bg-black/60 rounded-full transition-all hidden md:block"
            >
                <ChevronLeft size={48} />
            </button>

            {/* Global Next Button */}
            <button
                onClick={(e) => { e.stopPropagation(); onNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-50 p-3 text-white/50 hover:text-white bg-black/20 hover:bg-black/60 rounded-full transition-all hidden md:block"
            >
                <ChevronRight size={48} />
            </button>

            <div
                className="relative w-full max-w-[95vw] h-[85vh] flex flex-col items-center justify-center"
                onClick={e => e.stopPropagation()}
            >
                {/* Main Content Area (70% Height) */}
                <div className="relative w-full h-[70%] glass-style-card rounded-[32px] shadow-2xl flex flex-col md:flex-row overflow-hidden border border-white/10 mb-4">

                    {/* Left Column: Media (75%) */}
                    <div className="w-full md:w-[75%] h-full relative bg-black flex items-center justify-center group overflow-hidden">
                        {isEditing ? (
                            <div className="absolute inset-0 z-50 bg-black/70 flex flex-col items-center justify-center p-8 text-center border-4 border-dashed border-white/20 hover:border-white/50 transition-colors cursor-pointer">
                                <Upload size={48} className="text-white/50 mb-4" />
                                <p className="text-white font-medium mb-1">Click to Upload New Poster</p>
                                <p className="text-white/50 text-sm mb-4">Max 2MB. JPG or PNG</p>
                                <input 
                                    type="file" 
                                    accept="image/png, image/jpeg" 
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) {
                                            const file = e.target.files[0];
                                            if (file.size > 2 * 1024 * 1024) {
                                                alert("Image must be under 2MB");
                                                return;
                                            }
                                            setEditPoster(file);
                                            setPreviewUrl(URL.createObjectURL(file));
                                        }
                                    }}
                                />
                                {previewUrl && (
                                     <div className="absolute inset-0 z-[-1] opacity-50">
                                         <Image src={previewUrl} alt="Preview" fill className="object-cover blur-sm" />
                                     </div>
                                )}
                                {(previewUrl || editPoster) && (
                                    <div className="flex items-center gap-2 text-green-400 bg-green-900/40 px-4 py-2 rounded-full backdrop-blur">
                                        <Check size={16} /> Image Ready for Save
                                    </div>
                                )}
                            </div>
                        ) : null}

                        {film.trailer_key && !isEditing ? (
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
                                        src={previewUrl || film.poster}
                                        alt={film.title}
                                        fill
                                        className="object-contain md:object-cover opacity-80"
                                    />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent pointer-events-none" />
                            </>
                        )}
                    </div>

                    {/* Right Column: Content (25%) */}
                    <div className="w-full md:w-[25%] h-full bg-transparent overflow-y-auto custom-scrollbar border-l border-white/10">
                        <div className="p-6 flex flex-col h-full">
                            {isEditing ? (
                                <textarea
                                    value={editForm.title}
                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                    maxLength={100}
                                    rows={2}
                                    className="text-2xl font-bold bg-white/5 border border-white/20 rounded p-2 text-white mb-2 w-full focus:outline-none focus:border-white leading-tight resize-none"
                                    placeholder="Film Title"
                                />
                            ) : (
                                <h2 className="text-2xl font-bold text-white mb-1 leading-tight">{film.title}</h2>
                            )}
                            
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-4 font-medium">
                                {isEditing ? (
                                    <>
                                        <input 
                                             value={editForm.rating} 
                                             onChange={(e) => setEditForm({ ...editForm, rating: e.target.value })}
                                             className="bg-white/5 border border-white/20 rounded px-2 py-1 w-20 text-green-400 text-xs focus:outline-none" 
                                             maxLength={15} 
                                             placeholder="IMDb e.g. 8.5/10"
                                        />
                                        <input 
                                             value={editForm.year} 
                                             onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                                             className="bg-white/5 border border-white/20 rounded px-2 py-1 w-16 text-gray-300 text-xs focus:outline-none" 
                                             maxLength={10} 
                                             placeholder="Year"
                                        />
                                    </>
                                ) : (
                                    <>
                                        <span className="text-green-400">{typeof film.rating === 'string' && film.rating.includes('/') ? film.rating.split('/')[0] : film.rating} Rating</span>
                                        <span>{film.year}</span>
                                        <span className="border border-gray-600 px-1 rounded text-[10px] tracking-wide">HD</span>
                                    </>
                                )}
                            </div>

                            <div className="mb-4 flex-grow">
                                {isEditing ? (
                                    <textarea
                                        value={editForm.description}
                                        onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                        maxLength={1000}
                                        rows={8}
                                        className="w-full bg-white/5 border border-white/20 rounded p-3 text-gray-200 text-sm focus:outline-none focus:border-white leading-relaxed resize-none"
                                        placeholder="Enter film description..."
                                    />
                                ) : (
                                    <p className="text-gray-300 leading-relaxed text-sm">
                                        {film.description}
                                    </p>
                                )}
                            </div>

                            <div className="space-y-3 text-sm text-gray-400 mt-auto">
                                <div>
                                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Director</span>
                                    {isEditing ? (
                                        <input
                                            value={editForm.director}
                                            onChange={(e) => setEditForm({...editForm, director: e.target.value})}
                                            className="bg-white/5 border border-white/20 rounded px-2 py-1 w-full text-white text-sm focus:outline-none"
                                            placeholder="Director Name"
                                        />
                                    ) : (
                                        <span 
                                            className="text-white text-sm hover:underline cursor-pointer transition-colors hover:text-red-400"
                                            onClick={() => onSearch && onSearch(film.director)}
                                        >
                                            {film.director}
                                        </span>
                                    )}
                                </div>
                                <div>
                                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Categories</span>
                                    <div className="flex flex-wrap gap-1">
                                        {film.categories.map(cat => (
                                            <span 
                                                key={cat} 
                                                onClick={() => onSearch && onSearch(cat)}
                                                className="px-2 py-0.5 text-[10px] text-gray-300 bg-gray-800 rounded border border-gray-700 hover:bg-gray-700 hover:border-gray-500 cursor-pointer transition-all hover:text-white"
                                            >
                                                {cat}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Carousel: Recommended Films (Intelligent Overlap Algorithm) */}
                <div className="w-full h-[25%] px-12 flex flex-col justify-center">
                    <h3 className="text-gray-400 text-xs uppercase font-bold tracking-widest pl-4 mb-3">Similar Films</h3>
                    <div className="w-full overflow-x-auto flex gap-4 p-4 no-scrollbar items-center mask-image-blur" ref={carouselRef}>
                        {similarFilms.map((f, idx) => (
                            <div
                                key={idx}
                                data-title={f.title}
                                onClick={(e) => { e.stopPropagation(); onSelect(f); }}
                                className="flex-shrink-0 cursor-pointer transition-all duration-300 relative rounded-xl overflow-hidden border-2 w-28 h-40 border-transparent opacity-70 hover:opacity-100 hover:scale-105 hover:border-white/50"
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
