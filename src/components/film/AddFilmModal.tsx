import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Terminal } from 'lucide-react';

interface AddFilmModalProps {
    onClose: () => void;
    onFilmAdded: (newFilm: any) => void;
}

export default function AddFilmModal({ onClose, onFilmAdded }: AddFilmModalProps) {
    const [inputText, setInputText] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
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
        // Handle comma or newline
        const lines = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        return lines.map(line => {
            const match = line.match(/^(.+?)(?:\s*\(?(\d{4})\)?)?$/);
            if (match) {
                return { title: match[1].trim(), year: match[2] ? match[2].trim() : '' };
            }
            return { title: line, year: '' };
        });
    };

    const handleAdd = async () => {
        if (!inputText.trim()) return;
        
        setIsProcessing(true);
        setLogs([]);
        setHasAttemptedCancel(false);
        
        const films = parseInput(inputText);
        let addedCount = 0;

        await delay(300);
        addLog(`Initializing RazinFlix Intelligence Engine...`);
        await delay(500);

        for (const film of films) {
            addLog(`----------------------------------------`);
            addLog(`Target Acquired: ${film.title} ${film.year ? `(${film.year})` : ''}`);
            await delay(400);
            
            addLog(`Scanning TMDB database for metadata matches...`);
            
            try {
                // We don't await the full visual delay, we fire the API 
                const apiPromise = fetch('/api/razinflix/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(film)
                });

                await delay(600);
                addLog(`Utilising YouTube API v3 for trailer extraction...`);
                await delay(800);
                addLog(`Activated Google Vision API to verify movie poster...`);
                
                const response = await apiPromise;
                const data = await response.json();
                
                if (response.ok) {
                    addLog(`Success: Synthesized JSON packet.`);
                    await delay(300);
                    addLog(`Injected target into Supabase razinflix_films table.`);
                    addedCount++;
                    onFilmAdded(data);
                } else {
                    addLog(`ERROR: ${data.error || 'API validation failed.'}`);
                }
            } catch (err: any) {
                addLog(`CRITICAL FAILURE: ${err.message}`);
            }
            
            await delay(800);
        }

        addLog(`----------------------------------------`);
        addLog(`Operation Complete. Validated ${addedCount} asset(s).`);
        await delay(1500);
        onClose();
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
            <div className="flex flex-col w-full h-full md:h-auto md:max-w-2xl bg-[#1c1c1e] md:rounded-[32px] overflow-hidden shadow-2xl border border-white/10 md:border-white/20 relative">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-white/10 bg-[#2c2c2e]/50">
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
                                    placeholder="e.g. The Matrix 1999, Avatar, Inception (2010)"
                                    className="w-full h-48 bg-[#0c0c0e] text-white border border-white/10 rounded-2xl p-4 resize-none focus:outline-none focus:border-[#007AFF] transition-colors leading-relaxed font-medium"
                                />
                                <p className="text-xs text-gray-500 mt-2 px-2 leading-relaxed">
                                    Type the name of the film and RazinFlix will figure out the rest - enter the year of the film if there might be a duplicate, for adding multiple films at once, separate the names and years and year by either a comma or linebreak.
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
                                    <Plus size={20} /> Add Film +
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col h-64 md:h-80 bg-black rounded-xl p-4 border border-[#007AFF]/30 font-mono text-xs md:text-sm text-green-400 overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] relative">
                            <div className="absolute top-2 right-4 flex items-center gap-2 text-[#007AFF] text-xs font-bold animate-pulse opacity-70">
                                <Terminal size={12} /> ACTIVE
                            </div>
                            <div className="flex-1 overflow-y-auto space-y-1 pb-4 custom-scrollbar">
                                {logs.map((log, i) => (
                                    <div key={i} className="break-words leading-relaxed opacity-90">{log}</div>
                                ))}
                                <div ref={bottomRef} />
                            </div>
                            <div className="h-1 w-full bg-[#007AFF]/20 mt-2 rounded overflow-hidden">
                                <div className="h-full bg-[#007AFF] animate-[indeterminate_1.5s_infinite_ease-in-out] w-1/3" />
                            </div>
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
