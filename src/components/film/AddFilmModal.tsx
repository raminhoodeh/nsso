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
    const processingRef = useRef(false);
    const controllerRef = useRef<AbortController | null>(null);
    const stopRequestedRef = useRef(false);
    const mountedRef = useRef(true);
    const batchSize = inputText.split(/\n+/).filter(title => title.trim()).length;

    useEffect(() => {
        if (bottomRef.current) {
            bottomRef.current.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        }
    }, [logs]);

    const addLog = (msg: string) => {
        if (mountedRef.current) setLogs(prev => [...prev, msg]);
    };

    const parseInput = (text: string) => {
        // Preserve punctuation and numeric words in titles; the server evaluates year hypotheses.
        return text
            .split(/\n+/)
            .map(title => ({ title: title.trim(), year: '' }))
            .filter(film => Boolean(film.title));
    };

    const handleAdd = async () => {
        if (!inputText.trim() || processingRef.current || batchSize > 20) return;
        processingRef.current = true;
        stopRequestedRef.current = false;

        setIsProcessing(true);
        setIsFinished(false);
        setLogs([]);
        setHasAttemptedCancel(false);

        const films = parseInput(inputText);
        let addedCount = 0;
        let failedCount = 0;
        let unknownCount = 0;

        addLog(`Checking ${films.length} film${films.length === 1 ? '' : 's'}, one at a time.`);

        for (const film of films) {
            if (stopRequestedRef.current || !mountedRef.current) break;
            addLog(`Checking “${film.title}”: title, year, artwork and trailer…`);
            const controller = new AbortController();
            controllerRef.current = controller;
            let timedOut = false;
            const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, 65_000);

            try {
                const response = await fetch('/api/razinflix/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(film),
                    signal: controller.signal,
                });
                const data = await response.json() as AddFilmApiResponse;

                if (response.ok) {
                    addLog(`Saved “${data.title}” (${data.year}) — ${data.director || 'Director unavailable'}. ${data._operation === 'updated' ? 'Existing record updated.' : 'Added to the library.'}`);
                    addedCount++;

                    const cleanData = { ...data };
                    delete cleanData._posterVerified;
                    delete cleanData._operation;
                    delete cleanData._match;

                    if (mountedRef.current) onFilmAdded(cleanData as Film);
                } else {
                    failedCount++;
                    addLog(`Could not add “${film.title}”: ${data.error || 'Validation failed.'}`);
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
                unknownCount++;
                if (stopRequestedRef.current) break;
                const message = err instanceof Error ? err.message : 'Unexpected request failure.';
                addLog(timedOut ? `“${film.title}” took too long. Refresh the library before retrying; its save status is unknown.` : `No confirmation for “${film.title}”: ${message} Refresh the library before retrying; its save status is unknown.`);
            } finally { window.clearTimeout(timeout); controllerRef.current = null; }
        }

        addLog(`${stopRequestedRef.current ? 'Stopped' : 'Complete'}: ${addedCount} confirmed saved, ${failedCount} unsuccessful, ${unknownCount} unconfirmed.${unknownCount ? ' The interrupted film’s save status is unknown. Any saved films remain in the library; refresh before retrying it.' : ''}`);
        processingRef.current = false;
        if (mountedRef.current) setIsFinished(true);
    };

    const stopProcessing = useCallback(() => {
        stopRequestedRef.current = true;
        controllerRef.current?.abort();
    }, []);

    const handleCancel = useCallback(() => {
        if (processingRef.current) { stopProcessing(); return; }
        if (isFinished) { onClose(); return; }
        if (inputText.trim() && !hasAttemptedCancel) {
            setHasAttemptedCancel(true);
        } else {
            onClose();
        }
    }, [hasAttemptedCancel, inputText, isFinished, onClose, stopProcessing]);

    useEffect(() => {
        mountedRef.current = true;
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
            mountedRef.current = false;
            stopRequestedRef.current = true;
            controllerRef.current?.abort();
            window.cancelAnimationFrame(focusFrame);
            document.body.style.overflow = previousOverflow;
            document.body.style.overscrollBehavior = previousOverscroll;
            previouslyFocused?.focus({ preventScroll: true });
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
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
                        <button
                            ref={closeButtonRef}
                            type="button"
                            onClick={handleCancel}
                            aria-label={isProcessing && !isFinished ? 'Stop adding films' : 'Close add film dialog'}
                            className={styles.iconButton}
                        >
                            <X aria-hidden="true" size={22} />
                        </button>
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
                                    maxLength={8_000}
                                    aria-describedby="razinflix-film-input-description"
                                />
                                <p id="razinflix-film-input-description" className={styles.description}>
                                    Enter up to 20 films, one per line. Include the release year for remakes or similar titles.
                                </p>
                                {batchSize > 20 && <p role="alert" className={styles.warningPanel}>Add no more than 20 films at a time.</p>}
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
                                    disabled={!inputText.trim() || batchSize > 20}
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
                                <>
                                <div className={styles.progressTrack}>
                                    <div className={styles.progressBar} />
                                </div>
                                <button type="button" onClick={stopProcessing} className={styles.secondaryButton}>Stop adding films</button>
                                </>
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
