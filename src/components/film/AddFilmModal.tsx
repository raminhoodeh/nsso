import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Terminal } from 'lucide-react';
import type { Film } from './MovieCard';

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
        <div className="fixed inset-0 z-[200] flex flex-col md:items-center md:justify-center bg-black/60 backdrop-blur-2xl">
            <div className="flex flex-col w-full h-full md:h-auto md:max-w-2xl bg-[#1c1c1e]/58 md:rounded-[32px] overflow-hidden shadow-2xl border border-white/10 md:border-white/20 relative" data-glass-auto="true" data-glass-variant="panel" data-glass-radius="32" data-glass-distortion="14">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#2c2c2e]/35" data-glass-auto="true" data-glass-variant="nav" data-glass-radius="0">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Plus className="text-[#007AFF]" /> Add Film to Database
                    </h2>
                    {!isProcessing && (
                        <button onClick={handleCancel} className="p-2 text-white/50 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 relative">
                    {!isProcessing ? (
                        <>
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-semibold text-gray-400 uppercase tracking-widest pl-1">
                                    Film Intel Input
                                </label>
                                <textarea
                                    value={inputText}
                                    onChange={(e) => {
                                        setInputText(e.target.value);
                                        setHasAttemptedCancel(false);
                                    }}
                                    placeholder={'e.g. The Matrix (1999)\nAvatar\nInception (2010)'}
                                    className="w-full h-48 bg-[#0c0c0e] text-white border border-white/10 rounded-2xl p-4 resize-none focus:outline-none focus:border-[#007AFF] transition-colors leading-relaxed font-medium"
                                />
                                <p className="text-sm md:text-base text-gray-200 mt-3 px-2 leading-relaxed">
                                    Enter one film per line. Add the release year in parentheses when a title has remakes or multiple versions.
                                </p>
                            </div>

                            {hasAttemptedCancel && (
                                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium animate-pulse">
                                    Warning: You have unsubmitted text. Tap Cancel again to discard and close.
                                </div>
                            )}

                            <div className="mt-auto md:mt-4">
                                <button
                                    onClick={handleAdd}
                                    disabled={!inputText.trim()}
                                    className="w-full py-4 bg-[#007AFF] hover:bg-[#0066d6] active:bg-[#005bb5] disabled:bg-[#007AFF]/30 disabled:text-white/30 text-white font-bold rounded-2xl transition-all shadow-lg shadow-[#007AFF]/20 text-lg flex items-center justify-center gap-2"
                                >
                                    <Plus size={20} /> Add Film
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col h-64 md:h-80 bg-black rounded-xl p-4 border border-[#007AFF]/30 font-mono text-xs md:text-sm text-green-400 overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] relative">
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
                                    <button
                                        onClick={() => {
                                            setIsProcessing(false);
                                            setIsFinished(false);
                                        }}
                                        className="py-2.5 px-4 rounded-lg border border-white/20 text-white hover:bg-white/10 transition-colors font-semibold"
                                    >
                                        Edit Input
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="py-2.5 px-4 rounded-lg bg-[#007AFF] text-white hover:bg-[#0066d6] transition-colors font-semibold"
                                    >
                                        Close
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

            </div>
            <style dangerouslySetInnerHTML={{__html: `
                @keyframes indeterminate {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(300%); }
                }
            `}} />
        </div>
    );
}
