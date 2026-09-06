import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Edit2, Save, Upload, Loader2, Check, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { TahoeGlassDirectBackdropBoundaryContext } from '@/components/ui/tahoe-glass/TahoeGlassBoundaryContext';
import styles from './MovieModal.module.css';
import {
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassField,
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass';

const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'iframe',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[contenteditable="true"]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => (
        !element.hasAttribute('disabled')
        && element.getAttribute('aria-hidden') !== 'true'
        && !element.closest('[inert]')
        && element.getClientRects().length > 0
    ));
}

function isEditableTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

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
    onUpdate?: (film: Film) => void;
    onDelete?: (id: number) => void;
    onSearch?: (term: string) => void;
}

const MovieModal = ({ film, filmList = [], onClose, onNext, onPrev, onSelect, onUpdate, onDelete, onSearch }: MovieModalProps) => {
    const carouselRef = useRef<HTMLDivElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLElement | null>(null);
    const dialogTitleId = React.useId();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;

        triggerRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const previousBodyOverflow = document.body.style.getPropertyValue('overflow');
        const previousBodyOverflowPriority = document.body.style.getPropertyPriority('overflow');
        const backgroundStates: Array<{ element: HTMLElement; inert: boolean }> = [];

        document.body.style.setProperty('overflow', 'hidden');

        let activeBranch: HTMLElement = dialog;
        while (activeBranch.parentElement) {
            const parent = activeBranch.parentElement;
            Array.from(parent.children).forEach((sibling) => {
                if (sibling === activeBranch || !(sibling instanceof HTMLElement)) return;
                backgroundStates.push({ element: sibling, inert: sibling.inert });
                sibling.inert = true;
            });
            if (parent === document.body) break;
            activeBranch = parent;
        }

        const focusFrame = window.requestAnimationFrame(() => {
            closeRef.current?.focus({ preventScroll: true });
        });

        return () => {
            window.cancelAnimationFrame(focusFrame);
            if (previousBodyOverflow) {
                document.body.style.setProperty('overflow', previousBodyOverflow, previousBodyOverflowPriority);
            } else {
                document.body.style.removeProperty('overflow');
            }
            backgroundStates.reverse().forEach(({ element, inert }) => {
                if (element.isConnected) element.inert = inert;
            });

            const trigger = triggerRef.current;
            if (trigger?.isConnected && trigger !== document.body) {
                trigger.focus({ preventScroll: true });
            }
        };
    }, []);

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isEditAuthOpen, setIsEditAuthOpen] = useState(false);
    const [editPassword, setEditPassword] = useState('');
    const [editPasswordError, setEditPasswordError] = useState<string | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [operationError, setOperationError] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({
        title: film?.title || '',
        description: film?.description || '',
        year: film?.year || '',
        rating: film?.rating || '',
        trailer_key: film?.trailer_key ? `https://youtube.com/watch?v=${film.trailer_key}` : '',
        director: film?.director || '',
        category: film?.categories && film.categories.length > 0 ? film.categories[0] : 'Uncategorized'
    });
    const [editPoster, setEditPoster] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        // Reset form when film changes
        setEditForm({
            title: film?.title || '',
            description: film?.description || '',
            year: film?.year || '',
            rating: film?.rating || '',
            trailer_key: film?.trailer_key ? `https://youtube.com/watch?v=${film.trailer_key}` : '',
            director: film?.director || '',
            category: film?.categories && film.categories.length > 0 ? film.categories[0] : 'Uncategorized'
        });
        setEditPoster(null);
        setPreviewUrl(null);
        setIsEditing(false);
    }, [film]);

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: 0 });
        carouselRef.current?.scrollTo({ left: 0 });
    }, [film.id]);

    useEffect(() => () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);

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
            fd.append('director', editForm.director);
            fd.append('categories', editForm.category);

            // Extract just the key if they pasted a full URL
            let cleanedKey = editForm.trailer_key;
            const match = cleanedKey.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&?]+)/);
            if (match && match[1]) cleanedKey = match[1];
            fd.append('trailer_key', cleanedKey);

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
            if (onUpdate) {
                onUpdate(data.film);
            } else {
                onSelect(data.film);
            }
            setIsEditing(false);
        } catch(err: unknown) {
            setOperationError(err instanceof Error ? err.message : 'Error saving film.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!film) return;
        setIsDeleteConfirmOpen(false);
        setIsDeleting(true);
        try {
            const res = await fetch('/api/razinflix/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: film.id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete');
            
            if (onDelete) onDelete(film.id);
            onClose();
        } catch(err: unknown) {
            setOperationError(err instanceof Error ? err.message : 'Error deleting film.');
            setIsDeleting(false);
        }
    };

    const requestEditAccess = () => {
        setEditPassword('');
        setEditPasswordError(null);
        setIsEditAuthOpen(true);
    };

    const confirmEditAccess = () => {
        if (editPassword.trim().toLowerCase() !== 'azinam') {
            setEditPasswordError('Incorrect password.');
            return;
        }
        setIsEditAuthOpen(false);
        setEditPassword('');
        setEditPasswordError(null);
        setIsEditing(true);
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

    const nestedDialogOpen = isEditAuthOpen || isDeleteConfirmOpen || Boolean(operationError);

    // Modal keyboard navigation and focus containment. Nested Tahoe dialogs own
    // focus and Escape while open, including when portaled outside this subtree.
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const dialog = dialogRef.current;
            const eventTarget = e.target instanceof Element ? e.target : document.activeElement;
            const eventBelongsToNestedDialog = eventTarget instanceof Element
                && Boolean(eventTarget.closest('[data-tahoe-glass-dialog-overlay="true"]'));
            if (!dialog || nestedDialogOpen || eventBelongsToNestedDialog) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                onClose();
                return;
            }

            if (e.key === 'Tab') {
                const focusable = getFocusableElements(dialog);
                const activeElement = document.activeElement;
                const focusIsOutside = !(activeElement instanceof Node) || !dialog.contains(activeElement);

                if (focusable.length === 0) {
                    e.preventDefault();
                    dialog.focus({ preventScroll: true });
                    return;
                }

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (focusIsOutside || activeElement === dialog) {
                    e.preventDefault();
                    (e.shiftKey ? last : first).focus({ preventScroll: true });
                } else if (e.shiftKey && activeElement === first) {
                    e.preventDefault();
                    last.focus({ preventScroll: true });
                } else if (!e.shiftKey && activeElement === last) {
                    e.preventDefault();
                    first.focus({ preventScroll: true });
                }
                return;
            }

            if (isEditing || isEditableTarget(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
            if (eventTarget instanceof Element && eventTarget.closest('[data-film-recommendations]')) return;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                onPrev();
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                onNext();
            }
        };

        const handleFocusIn = (event: FocusEvent) => {
            const dialog = dialogRef.current;
            const target = event.target;
            if (!dialog || nestedDialogOpen || !(target instanceof HTMLElement) || dialog.contains(target)) return;
            if (target.closest('[data-tahoe-glass-dialog-overlay="true"]')) return;

            const first = getFocusableElements(dialog)[0];
            (first || dialog).focus({ preventScroll: true });
        };

        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('focusin', handleFocusIn, true);
        return () => {
            document.removeEventListener('keydown', handleKeyDown, true);
            document.removeEventListener('focusin', handleFocusIn, true);
        };
    }, [isEditing, nestedDialogOpen, onClose, onNext, onPrev]);

    return createPortal(
        <TahoeGlassDirectBackdropBoundaryContext.Provider value={true}>
        <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            tabIndex={-1}
            className={styles.overlay}
            data-razinflix-dialog="true"
        >
            <h2 id={dialogTitleId} className="sr-only">Film details: {film.title}</h2>
            <div aria-hidden="true" className={styles.backdrop} data-razinflix-backdrop="true" onClick={onClose} />
            <div className={styles.window}>
                <header className={styles.toolbar}>
                    <button ref={closeRef} type="button" onClick={onClose} className={styles.control} aria-label="Close film details">
                        <X size={20} aria-hidden="true" />
                        <span>Back to films</span>
                    </button>
                    <span className={styles.toolbarTitle} aria-live="polite">{film.title}</span>
                    <div className={styles.navigation}>
                        <button type="button" onClick={onPrev} disabled={isEditing} className={styles.control} aria-label="Previous film">
                            <ChevronLeft size={22} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={onNext} disabled={isEditing} className={styles.control} aria-label="Next film">
                            <ChevronRight size={22} aria-hidden="true" />
                        </button>
                    </div>
                </header>
                <div ref={scrollRef} className={styles.scrollBody}>
                <section className={styles.main}>

                    {/* Trailer or full poster, with its own readable black canvas. */}
                    <div className={styles.media}>
                        {isEditing ? (
                                <TahoeGlassSurface
                                    variant="panel"
                                    radius={24}
                                    tone="light"
                                    semanticTint="dark"
                                    semanticTintOpacity={0.08}
                                    className="absolute inset-0 z-50 p-8 text-center cursor-pointer"
                                    contentClassName="flex h-full flex-col items-center justify-center"
                                >
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
                                                setOperationError('Image must be under 2MB.');
                                                return;
                                            }
                                            setEditPoster(file);
                                            setPreviewUrl(URL.createObjectURL(file));
                                        }
                                    }}
                                />
                                {previewUrl && (
                                     <div className="absolute inset-0 z-[-1] opacity-50">
                                         <Image src={previewUrl} alt="Preview" fill className="object-cover blur-sm" unoptimized={true} />
                                     </div>
                                )}
                                {(previewUrl || editPoster) && (
                                    <TahoeGlassSurface
                                        variant="pill"
                                        tone="light"
                                        semanticTint="dark"
                                        semanticTintOpacity={0.035}
                                        className="px-4 py-2 text-green-300"
                                        contentClassName="flex items-center gap-2"
                                    >
                                        <Check size={16} /> Image Ready for Save
                                    </TahoeGlassSurface>
                                )}
                            </TahoeGlassSurface>
                        ) : null}

                        {film.trailer_key && !isEditing ? (
                            <div className="w-full h-full">
                                <iframe
                                    key={film.id}
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
                                        className="object-contain"
                                        unoptimized={true}
                                    />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-transparent to-transparent pointer-events-none" />
                            </>
                        )}
                    </div>

                    {/* Film information follows the media on smaller screens. */}
                    <div className={styles.details}>
                        
                        {/* Record controls remain reachable at every viewport size. */}
                        <div className={styles.editActions}>
                            {isEditing ? (
                                <TahoeGlassSurface
                                    variant="menu"
                                    tone="light"
                                    semanticTint="dark"
                                    semanticTintOpacity={0.035}
                                    className="p-1 shadow-lg"
                                    contentClassName="flex gap-2"
                                >
                                    <button onClick={() => setIsDeleteConfirmOpen(true)} className="p-2 text-red-300 transition-colors" aria-label="Delete">
                                        {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                    </button>
                                    <button onClick={() => setIsEditing(false)} className="p-2 text-gray-300 transition-colors" aria-label="Cancel"><X size={16} /></button>
                                    <button onClick={handleSave} className="p-2 text-green-300 transition-colors" aria-label="Save">
                                        {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    </button>
                                </TahoeGlassSurface>
                            ) : (
                                <TahoeGlassButton
                                    onClick={requestEditAccess}
                                    tone="light"
                                    semanticTint="dark"
                                    semanticTintOpacity={0.03}
                                    className="p-3 text-white/65 shadow-xl hover:text-white"
                                    contentClassName="text-white"
                                    aria-label="Edit"
                                >
                                    <Edit2 size={16} />
                                </TahoeGlassButton>
                            )}
                        </div>

                        <div className={styles.detailContent}>
                            {isEditing ? (
                                <TahoeGlassField
                                    visuallyHideLabel
                                    label="Film title"
                                    tone="light"
                                    semanticTint="dark"
                                    semanticTintOpacity={0.025}
                                    className="mb-2 flex-shrink-0"
                                    surfaceClassName="p-0"
                                    controlClassName="w-full resize-none p-2 text-2xl font-bold leading-tight text-white md:pr-24"
                                >
                                    <textarea
                                        value={editForm.title}
                                        onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                        maxLength={100}
                                        rows={2}
                                        placeholder="Film Title"
                                    />
                                </TahoeGlassField>
                            ) : (
                                <h2 className="text-2xl font-bold text-white mb-1 leading-tight capitalize">{film.title}</h2>
                            )}
                            
                            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-4 font-medium">
                                {isEditing ? (
                                    <>
                                        <TahoeGlassField
                                            visuallyHideLabel
                                            label="Rating"
                                            tone="light"
                                            className="w-24"
                                            surfaceClassName="px-2 py-1"
                                            controlClassName="text-xs text-green-300"
                                        >
                                            <input
                                                 value={editForm.rating}
                                                 onChange={(e) => setEditForm({ ...editForm, rating: e.target.value })}
                                                 maxLength={15}
                                                 placeholder="IMDb 8.5/10"
                                            />
                                        </TahoeGlassField>
                                        <TahoeGlassField
                                            visuallyHideLabel
                                            label="Year"
                                            tone="light"
                                            className="w-20"
                                            surfaceClassName="px-2 py-1"
                                            controlClassName="text-xs text-gray-200"
                                        >
                                            <input
                                                 value={editForm.year}
                                                 onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                                                 maxLength={10}
                                                 placeholder="Year"
                                            />
                                        </TahoeGlassField>
                                    </>
                                ) : (
                                    <>
                                        <span className="text-green-400">{typeof film.rating === 'string' && film.rating.includes('/') ? film.rating.split('/')[0] : film.rating} Rating</span>
                                        <span>{film.year}</span>
                                    </>
                                )}
                            </div>

                            <div className="mb-4 flex-grow">
                                {isEditing ? (
                                    <TahoeGlassField
                                        visuallyHideLabel
                                        label="Description"
                                        tone="light"
                                        semanticTint="dark"
                                        semanticTintOpacity={0.02}
                                        surfaceClassName="p-0"
                                        controlClassName="w-full resize-none p-3 text-sm leading-relaxed text-gray-200"
                                    >
                                        <textarea
                                            value={editForm.description}
                                            onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                            maxLength={1000}
                                            rows={8}
                                            placeholder="Enter film description..."
                                        />
                                    </TahoeGlassField>
                                ) : (
                                    <p className="text-gray-300 leading-relaxed text-sm">
                                        {film.description}
                                    </p>
                                )}
                            </div>

                            {isEditing && (
                                <div className="mb-4">
                                    <TahoeGlassField
                                        label="YouTube URL or Key"
                                        labelClassName="text-xs uppercase tracking-wider text-gray-400"
                                        tone="light"
                                        surfaceClassName="px-2 py-1.5"
                                        controlClassName="text-sm text-white"
                                    >
                                        <input
                                            value={editForm.trailer_key}
                                            onChange={(e) => setEditForm({ ...editForm, trailer_key: e.target.value })}
                                            placeholder="https://youtube.com/watch?v=..."
                                        />
                                    </TahoeGlassField>
                                </div>
                            )}

                            <div className="space-y-3 text-sm text-gray-400 mt-auto">
                                <div>
                                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Director</span>
                                    {isEditing ? (
                                        <TahoeGlassField visuallyHideLabel label="Director" tone="light" surfaceClassName="px-2 py-1.5" controlClassName="text-sm text-white">
                                            <input
                                                value={editForm.director}
                                                onChange={(e) => setEditForm({...editForm, director: e.target.value})}
                                                placeholder="Director Name"
                                            />
                                        </TahoeGlassField>
                                    ) : (
                                        <button
                                            type="button"
                                            className="text-left text-sm text-white transition-colors hover:text-red-400 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                                            onClick={() => onSearch?.(film.director)}
                                            aria-label={`Search for films directed by ${film.director}`}
                                        >
                                            {film.director}
                                        </button>
                                    )}
                                </div>
                                <div>
                                    <span className="block text-gray-500 text-xs uppercase tracking-wider mb-1">Categories</span>
                                    {isEditing ? (
                                        <TahoeGlassField visuallyHideLabel label="Category" tone="light" surfaceClassName="px-2 py-1.5" controlClassName="appearance-none text-sm text-white">
                                            <select
                                                value={editForm.category}
                                                onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                                            >
                                            {[
                                                "Critically-Acclaimed Mind-Bending Sci-Fi", 
                                                "Visually Striking Emotional Dramas",
                                                "Gritty Heist & Crime Thrillers", 
                                                "Suspenseful Psychological Mysteries",
                                                "Epic Historical Period Pieces", 
                                                "Heartfelt Coming-of-Age Tales",
                                                "Surreal & Left-of-Center Cinema", 
                                                "Dark Comedies & Sharp Satire",
                                                "Riveting Global Documentaries", 
                                                "Classic Masterpieces of World Cinema",
                                                "Intense Action, War & Adventure", 
                                                "Prestige Television & Miniseries",
                                                "Nostalgic Cult Classics", 
                                                "Japanese Anime",
                                                "Uncategorized"
                                                ].map(cat => <option key={cat} value={cat} className="bg-black text-white">{cat}</option>)}
                                            </select>
                                        </TahoeGlassField>
                                    ) : (
                                        <div className="flex flex-wrap gap-1">
                                            {film.categories.map(cat => (
                                                <TahoeGlassSurface
                                                    as="button"
                                                    variant="pill"
                                                    radius={999}
                                                    tone="light"
                                                    key={cat} 
                                                    onClick={() => onSearch && onSearch(cat)}
                                                    className="px-2 py-0.5 text-[10px] text-gray-200 hover:text-white"
                                                >
                                                    {cat}
                                                </TahoeGlassSurface>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Bottom Divider */}
                            <div className="mt-auto pt-4 border-t border-white/5" />
                        </div>
                    </div>
                </section>

                {/* Bottom Carousel: Recommended Films (Intelligent Overlap Algorithm) */}
                <section className={styles.recommendations} data-film-recommendations="true" aria-label="Similar films">
                    <div className={styles.recommendationsHeader}>
                        <h3>More like this</h3>
                        <div className={styles.navigation}>
                            <button type="button" className={styles.control} onClick={() => carouselRef.current?.scrollBy({ left: -carouselRef.current.clientWidth * 0.8, behavior: 'smooth' })} aria-label="Scroll similar films left"><ChevronLeft size={20} /></button>
                            <button type="button" className={styles.control} onClick={() => carouselRef.current?.scrollBy({ left: carouselRef.current.clientWidth * 0.8, behavior: 'smooth' })} aria-label="Scroll similar films right"><ChevronRight size={20} /></button>
                        </div>
                    </div>
                    <div className={styles.recommendationsRow} ref={carouselRef}>
                        {similarFilms.map((f) => (
                            <TahoeGlassSurface
                                as="button"
                                type="button"
                                key={f.id}
                                data-title={f.title}
                                onClick={() => { onSelect(f); closeRef.current?.focus({ preventScroll: true }); }}
                                aria-label={`View details for ${f.title}`}
                                variant="mediaFrame"
                                radius={12}
                                tone="light"
                                semanticTint="dark"
                                semanticTintOpacity={0.02}
                                className={styles.recommendation}
                                contentClassName="relative block h-full w-full overflow-hidden rounded-[10px]"
                            >
                                <Image src={f.poster} alt={f.title} fill className="object-cover" unoptimized={true} />
                                <span className={styles.recommendationCaption}>{f.title}<small>{f.year}</small></span>
                            </TahoeGlassSurface>
                        ))}
                    </div>
                </section>
                </div>
            </div>

            <TahoeGlassDialog
                open={isEditAuthOpen}
                onOpenChange={(open) => {
                    setIsEditAuthOpen(open);
                    if (!open) {
                        setEditPassword('');
                        setEditPasswordError(null);
                    }
                }}
                title="Edit film"
                description="Enter the RazinFlix administrator password to edit this record."
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.045}
                className={styles.nestedDialog}
                overlayClassName={styles.nestedOverlay}
                backdropClassName={styles.nestedBackdrop}
            >
                <form
                    className="mt-5 space-y-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        confirmEditAccess();
                    }}
                >
                    <TahoeGlassField label="Password" error={editPasswordError} tone="light" semanticTint="dark" semanticTintOpacity={0.025}>
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={editPassword}
                            onChange={(event) => {
                                setEditPassword(event.target.value);
                                setEditPasswordError(null);
                            }}
                        />
                    </TahoeGlassField>
                    <div className="flex justify-end gap-3">
                        <TahoeGlassButton onClick={() => setIsEditAuthOpen(false)} tone="light" className="px-5 py-2.5" contentClassName="text-white">
                            Cancel
                        </TahoeGlassButton>
                        <TahoeGlassButton type="submit" tone="light" semanticTint="dark" semanticTintOpacity={0.3} className="px-5 py-2.5" contentClassName="text-white">
                            Continue
                        </TahoeGlassButton>
                    </div>
                </form>
            </TahoeGlassDialog>

            <TahoeGlassDialog
                open={isDeleteConfirmOpen}
                onOpenChange={setIsDeleteConfirmOpen}
                title="Delete film?"
                description={`This permanently removes “${film.title}” from RazinFlix. This action cannot be undone.`}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.05}
                className={styles.nestedDialog}
                overlayClassName={styles.nestedOverlay}
                backdropClassName={styles.nestedBackdrop}
            >
                <div className="mt-6 flex justify-end gap-3">
                    <TahoeGlassButton onClick={() => setIsDeleteConfirmOpen(false)} tone="light" className="px-5 py-2.5" contentClassName="text-white">
                        Cancel
                    </TahoeGlassButton>
                    <TahoeGlassButton onClick={handleDelete} disabled={isDeleting} tone="light" semanticTint="dark" semanticTintOpacity={0.075} className="px-5 py-2.5" contentClassName="text-red-200">
                        {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                        Delete
                    </TahoeGlassButton>
                </div>
            </TahoeGlassDialog>

            <TahoeGlassDialog
                open={Boolean(operationError)}
                onOpenChange={(open) => {
                    if (!open) setOperationError(null);
                }}
                title="RazinFlix could not complete that action"
                description={operationError}
                tone="light"
                semanticTint="dark"
                semanticTintOpacity={0.05}
                className={styles.nestedDialog}
                overlayClassName={styles.nestedOverlay}
                backdropClassName={styles.nestedBackdrop}
            >
                <div className="mt-6 flex justify-end">
                    <TahoeGlassButton onClick={() => setOperationError(null)} tone="light" className="px-5 py-2.5" contentClassName="text-white">
                        Close
                    </TahoeGlassButton>
                </div>
            </TahoeGlassDialog>
        </div>
        </TahoeGlassDirectBackdropBoundaryContext.Provider>,
        document.body,
    );
};

export default MovieModal;
