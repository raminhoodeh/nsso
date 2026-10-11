import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Terminal } from 'lucide-react';
import type { Film } from './MovieCard';
import styles from './AddFilmModal.module.css';

interface MatchCandidate {
    title: string;
    year?: string | null;
}

interface AddFilmApiResponse extends Partial<Film> {
    error?: string;
    suggestion?: string;
    candidates?: MatchCandidate[];
    _posterVerified?: boolean;
    _operation?: 'inserted' | 'updated';
    _match?: {
        canonicalTitle?: string;
        confidence?: number;
        trailerTitle?: string;
        trailerSource?: string;
    };
}

interface AddFilmModalProps {
    onClose: () => void;
    onFilmAdded: (newFilm: Film) => void;
}

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[href]',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function AddFilmModal({ onClose, onFilmAdded }: AddFilmModalProps) {
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [hasAttemptedCancel, setHasAttemptedCancel] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);
    const dialogRef = useRef<HTMLElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const addLog = (msg: string) => {
        setLogs(prev => [...prev, `[System] ${msg}`]);
    };

    const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

    const parseInput = (text: string) => {
        // Preserve punctuation and numeric words in titles; the server evaluates year hypotheses.
        return text
            .split(/\n+/)
            .map(title => ({ title: title.trim(), year: '' }))
            .filter(film => Boolean(film.title));
    };

    const handleAdd = async () => {
        if (!inputText.trim()) return;

        setIsProcessing(true);
        setIsFinished(false);
        setLogs([]);
        setHasAttemptedCancel(false);

        const films = parseInput(inputText);
        let addedCount = 0;
        let failedCount = 0;

        await delay(300);
        addLog(`▶ SYSTEM: Initializing RazinFlix Intelligence Engine...`);
        await delay(500);

        for (const film of films) {
            addLog(`========================================`);
            addLog(`▶ SYSTEM: Initiating search for "${film.title}" ${film.year ? `(${film.year})` : ''}`);
            await delay(400);

            addLog(`▶ TMDB: Resolving the canonical film, release year, poster, and credits...`);

            try {
                const apiPromise = fetch('/api/razinflix/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(film)
                });

                await delay(600);
                addLog(`▶ MATCHING: Comparing alternate titles and rejecting ambiguous releases...`);
                await delay(700);
                addLog(`▶ TRAILER: Checking TMDB's linked YouTube trailers first...`);
                await delay(700);
                addLog(`▶ FALLBACK: Ranking playable trailer candidates when required...`);
                await delay(700);
                addLog(`▶ QUALITY GATE: Requiring both verified artwork and a playable trailer...`);

                const response = await apiPromise;
                const data = await response.json() as AddFilmApiResponse;

                if (response.ok) {
                    const match = data._match;
                    addLog(`▶ MATCH: "${match?.canonicalTitle || data.title}" resolved at ${match?.confidence ?? 'high'}% confidence.`);

                    await delay(200);
                    addLog(`  ↳ Poster: Verified TMDB artwork selected.`);

                    await delay(300);
                    addLog(`  ↳ Trailer: "${match?.trailerTitle || 'Verified trailer'}" selected via ${match?.trailerSource || 'TMDB'}.`);

                    await delay(200);
                    addLog(`  ↳ Metadata: ${data.director || 'Director unavailable'} · ${data.rating || 'Unrated'} · ${data.categories?.[0] || 'Uncategorised'}.`);

                    await delay(400);
                    addLog(`▶ SUPABASE: ${data._operation === 'updated' ? 'Repairing the existing film record' : 'Saving the canonical film record'}...`);
                    await delay(300);
                    addLog(`▶ SUCCESS: "${data.title}" is complete and live on RazinFlix!`);
                    addedCount++;

                    const cleanData = { ...data };
                    delete cleanData._posterVerified;
                    delete cleanData._operation;
                    delete cleanData._match;

                    onFilmAdded(cleanData as Film);
                } else {
                    failedCount++;
                    addLog(`▶ ERROR: Could not add film. ${data.error || 'Validation failed.'}`);
                    if (Array.isArray(data.candidates) && data.candidates.length > 0) {
                        const candidateText = data.candidates
                            .slice(0, 3)
                            .map(candidate => `${candidate.title}${candidate.year ? ` (${candidate.year})` : ''}`)
                            .join(', ');
                        addLog(`  ↳ Possible matches: ${candidateText}`);
                    }
                    if (data.suggestion) addLog(`  ↳ ${data.suggestion}`);
                }
            } catch (err: unknown) {
                failedCount++;
                const message = err instanceof Error ? err.message : 'Unexpected request failure.';
                addLog(`▶ CRITICAL FAILURE: ${message}`);
            }

            await delay(1200);
        }

        addLog(`========================================`);
        addLog(`▶ OPERATION COMPLETE: ${addedCount} complete, ${failedCount} rejected.`);
        setIsFinished(true);
        if (failedCount === 0) {
            await delay(1500);
            onClose();
        }
    };

    const handleCancel = useCallback(() => {
        if (inputText.trim() && !hasAttemptedCancel) {
            setHasAttemptedCancel(true);
        } else {
            onClose();
        }
    }, [hasAttemptedCancel, inputText, onClose]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        const previousOverscroll = document.body.style.overscrollBehavior;
        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        document.body.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'none';

        const focusFrame = window.requestAnimationFrame(() => {
            (textareaRef.current || closeButtonRef.current || dialogRef.current)?.focus();
        });

        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.body.style.overflow = previousOverflow;
            document.body.style.overscrollBehavior = previousOverscroll;
            previouslyFocused?.focus({ preventScroll: true });
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape' && !isProcessing) {
                event.preventDefault();
                handleCancel();
                return;
            }

            if (event.key !== 'Tab' || !dialogRef.current) return;

            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
            ).filter(element => !element.hasAttribute('disabled') && element.offsetParent !== null);

            if (focusable.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleCancel, isProcessing]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            className={styles.overlay}
            data-razinflix-add-film-overlay="native"
            style={{ zIndex: 2147483000 }}
        >
            <div
                aria-hidden="true"
                className={styles.backdrop}
                onPointerDown={() => {
                    if (!isProcessing) handleCancel();
                }}
            />
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="razinflix-add-film-title"
                className={styles.dialog}
                data-razinflix-add-film-surface="opaque-native"
                tabIndex={-1}
            >
                <header className={styles.header}>
                    <h2 id="razinflix-add-film-title" className={styles.title}>
                        <Plus aria-hidden="true" />
                        <span>Add Film to Database</span>
                    </h2>
                    {!isProcessing && (
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={handleCancel}
                            aria-label="Close add film dialog"
                            className={styles.iconButton}
                        >
                            <X aria-hidden="true" size={22} />
                        </button>
                    )}
                </header>

                <div className={styles.content}>
                    {!isProcessing ? (
                        <>
                            <div className={styles.fieldGroup}>
                                <label htmlFor="razinflix-film-input" className={styles.label}>
                                    Film Intel Input
                                </label>
                                <textarea
                                    ref={textareaRef}
                                    id="razinflix-film-input"
                                    value={inputText}
                                    onChange={(event) => {
                                        setInputText(event.target.value);
                                        setHasAttemptedCancel(false);
                                    }}
                                    placeholder={'e.g. The Matrix (1999)\nAvatar\nInception (2010)'}
                                    className={styles.textarea}
                                    aria-describedby="razinflix-film-input-description"
                                />
                                <p id="razinflix-film-input-description" className={styles.description}>
                                    Enter one film per line. Add the release year in parentheses when a title has remakes or multiple versions.
                                </p>
                            </div>

                            {hasAttemptedCancel && (
                                <div role="alert" className={styles.warningPanel}>
                                    Warning: You have unsubmitted text. Tap Cancel again to discard and close.
                                </div>
                            )}

                            <div className={styles.primaryActionRow}>
                                <button
                                    type="button"
                                    onClick={handleAdd}
                                    disabled={!inputText.trim()}
                                    className={styles.primaryButton}
                                >
                                    <Plus aria-hidden="true" size={20} />
                                    Add Film
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className={styles.statusPanel}>
                            <div className={`${styles.statusBadge} ${isFinished ? '' : styles.statusActive}`}>
                                <Terminal aria-hidden="true" size={12} />
                                {isFinished ? 'COMPLETE' : 'ACTIVE'}
                            </div>
                            <div className={styles.logs} aria-live="polite">
                                {logs.map((log, index) => (
                                    <div key={index}>{log}</div>
                                ))}
                                <div ref={bottomRef} />
                            </div>
                            {!isFinished ? (
                                <div className={styles.progressTrack}>
                                    <div className={styles.progressBar} />
                                </div>
                            ) : (
                                <div className={styles.statusActions}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsProcessing(false);
                                            setIsFinished(false);
                                        }}
                                        className={styles.secondaryButton}
                                    >
                                        Edit Input
                                    </button>
                                    <button type="button" onClick={onClose} className={styles.primaryButton}>
                                        Close
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>
        </div>,
        document.body,
    );
}
