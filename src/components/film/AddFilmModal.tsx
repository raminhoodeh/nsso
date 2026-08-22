import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Terminal } from 'lucide-react';
import type { Film } from './MovieCard';
import {
    TahoeGlassButton,
    TahoeGlassDialog,
    TahoeGlassField,
    TahoeGlassSurface,
} from '@/components/ui/tahoe-glass';

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

export default function AddFilmModal({ onClose, onFilmAdded }: AddFilmModalProps) {
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isFinished, setIsFinished] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [hasAttemptedCancel, setHasAttemptedCancel] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Prevent body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = 'auto'; };
    }, []);

    // Auto-scroll logs
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
                    
                    // Remove the backend-only flags before pushing to state
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

    const handleCancel = () => {
        if (inputText.trim() && !hasAttemptedCancel) {
            setHasAttemptedCancel(true);
        } else {
            onClose();
        }
    };

    return (
        <TahoeGlassDialog
            open
            onOpenChange={(open) => {
                if (!open && !isProcessing) handleCancel();
            }}
            closeOnEscape={!isProcessing}
            closeOnPointerDownOutside={!isProcessing}
            aria-label="Add film to database"
            tone="light"
            semanticTint="dark"
            semanticTintOpacity={0.045}
            radius={32}
            className="h-[calc(100dvh-2rem)] max-w-2xl overflow-hidden p-0 md:h-auto"
            contentClassName="flex h-full flex-col"
            overlayClassName="z-[200]"
        >
                
                {/* Header */}
                <TahoeGlassSurface
                    as="header"
                    variant="menu"
                    radius="32px 32px 0 0"
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.035}
                    className="flex-none px-6 py-5"
                    contentClassName="flex items-center justify-between"
                >
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Plus className="text-[#007AFF]" /> Add Film to Database
                    </h2>
                    {!isProcessing && (
                        <TahoeGlassButton
                            onClick={handleCancel}
                            aria-label="Close add film dialog"
                            tone="light"
                            className="p-2 text-white/65 hover:text-white"
                            contentClassName="text-white"
                        >
                            <X size={20} />
                        </TahoeGlassButton>
                    )}
                </TahoeGlassSurface>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 relative">
                    {!isProcessing ? (
                        <>
                            <TahoeGlassField
                                label="Film Intel Input"
                                labelClassName="pl-1 text-sm font-semibold uppercase tracking-widest text-gray-300"
                                description="Enter one film per line. Add the release year in parentheses when a title has remakes or multiple versions."
                                tone="light"
                                semanticTint="dark"
                                semanticTintOpacity={0.03}
                                surfaceClassName="p-0"
                                controlClassName="h-48 resize-none p-4 font-medium leading-relaxed text-white"
                            >
                                <textarea
                                    value={inputText}
                                    onChange={(e) => {
                                        setInputText(e.target.value);
                                        setHasAttemptedCancel(false);
                                    }}
                                    placeholder={'e.g. The Matrix (1999)\nAvatar\nInception (2010)'}
                                />
                            </TahoeGlassField>

                            {hasAttemptedCancel && (
                                <TahoeGlassSurface
                                    variant="panel"
                                    radius={12}
                                    tone="light"
                                    semanticTint="dark"
                                    semanticTintOpacity={0.04}
                                    className="p-4 text-sm font-medium text-red-300 animate-pulse"
                                >
                                    Warning: You have unsubmitted text. Tap Cancel again to discard and close.
                                </TahoeGlassSurface>
                            )}

                            <div className="mt-auto md:mt-4">
                                <TahoeGlassButton
                                    onClick={handleAdd}
                                    disabled={!inputText.trim()}
                                    tone="dark"
                                    semanticTint="light"
                                    semanticTintOpacity={0.08}
                                    className="w-full py-4"
                                    contentClassName="flex items-center justify-center gap-2 text-lg font-bold text-black/90"
                                >
                                    <Plus size={20} /> Add Film
                                </TahoeGlassButton>
                            </div>
                        </>
                    ) : (
                        <TahoeGlassSurface
                            variant="recessed"
                            radius={12}
                            tone="light"
                            semanticTint="dark"
                            semanticTintOpacity={0.055}
                            className="flex-1 h-64 md:h-80 p-4 overflow-hidden"
                            contentClassName="relative flex h-full flex-col font-mono text-xs text-green-300 md:text-sm"
                        >
                            <div className={`absolute top-2 right-4 flex items-center gap-2 text-[#007AFF] text-xs font-bold opacity-70 ${isFinished ? '' : 'animate-pulse'}`}>
                                <Terminal size={12} /> {isFinished ? 'COMPLETE' : 'ACTIVE'}
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1 pb-4 custom-scrollbar">
                                {logs.map((log, i) => (
                                    <div key={i} className="break-words leading-relaxed opacity-90">{log}</div>
                                ))}
                                <div ref={bottomRef} />
                            </div>
                            {!isFinished ? (
                                <div className="h-1 w-full bg-[#007AFF]/20 mt-2 rounded overflow-hidden">
                                    <div className="h-full bg-[#007AFF] animate-[indeterminate_1.5s_infinite_ease-in-out] w-1/3" />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-white/10 font-sans">
                                    <TahoeGlassButton
                                        onClick={() => {
                                            setIsProcessing(false);
                                            setIsFinished(false);
                                        }}
                                        tone="light"
                                        className="py-2.5 px-4"
                                        contentClassName="font-semibold text-white"
                                    >
                                        Edit Input
                                    </TahoeGlassButton>
                                    <TahoeGlassButton
                                        onClick={onClose}
                                        tone="dark"
                                        semanticTint="light"
                                        semanticTintOpacity={0.08}
                                        className="py-2.5 px-4"
                                        contentClassName="font-semibold text-black/90"
                                    >
                                        Close
                                    </TahoeGlassButton>
                                </div>
                            )}
                        </TahoeGlassSurface>
                    )}
                </div>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes indeterminate {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(300%); }
                }
            `}} />
        </TahoeGlassDialog>
    );
}
