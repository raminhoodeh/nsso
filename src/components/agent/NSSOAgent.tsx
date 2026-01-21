
"use client";

import { useState } from 'react';
import { Bot } from 'lucide-react';
import AgentChatInterface from './AgentChatInterface';

export default function NSSOAgent() {
    const [isOpen, setIsOpen] = useState(false);

    // Pop-up mode logic. Full screen opens new tab.
    const handleExpand = () => {
        window.open('/agent', '_blank');
    };

    return (
        <>
            {/* Persistent Entry Point (Pill) */}
            {!isOpen && (
                <button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 z-[6000] group hover:scale-105 transition-all duration-500"
                >
                    {/* Outer Glow/Blur Layer */}
                    <div className="absolute -inset-1 bg-white/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                    {/* Main Container - Notification Style */}
                    <div className="relative flex items-center h-[56px] pl-2 pr-6 bg-black/40 backdrop-blur-[34px] border border-white/20 rounded-full shadow-[0_4px_24px_rgba(0,0,0,0.2)] overflow-hidden">
                        {/* Inner Gradient Overlays for "Liquid" feel */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-50 pointer-events-none" />

                        {/* Avatar Image */}
                        <div className="relative w-[42px] h-[42px] rounded-full flex items-center justify-center bg-transparent mr-3 shadow-inner border border-white/50 overflow-hidden">
                            <img
                                src="/nsso-agent-avatar.png"
                                alt="Agent Avatar"
                                className="w-full h-full object-cover"
                            />
                        </div>

                        {/* Text Section */}
                        <div className="flex flex-col items-start justify-center">
                            <div className="flex items-center gap-1.5">
                                <img
                                    src="/deity logo white.png"
                                    alt="Deity"
                                    className="h-7 w-auto object-contain"
                                />

                            </div>
                        </div>
                    </div>
                </button>
            )}

            {/* Pop-up Mode - ALWAYS RENDERED but HIDDEN when closed to persist state */}
            <>
                {/* Dimming Overlay */}
                <div
                    className={`fixed inset-0 bg-black/60 backdrop-blur-[2px] z-40 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                        }`}
                    onClick={() => setIsOpen(false)}
                />

                {/* Chat Window */}
                <div className={`fixed inset-0 z-[6000] w-full h-full md:bottom-6 md:right-6 md:w-[676px] md:h-[92vh] md:max-h-[980px] md:inset-auto transition-all duration-300 transform ${isOpen ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto' : 'opacity-0 translate-y-10 scale-95 pointer-events-none absolute' // absolute helps remove it from flow layout if needed, though fixed handles it
                    }`}>
                    {/* Glow Effect */}
                    <div className="hidden md:block absolute -inset-1 bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 rounded-[44px] blur-xl -z-10"></div>

                    <AgentChatInterface
                        isFullScreen={false}
                        onClose={() => setIsOpen(false)}
                        onMaximize={handleExpand}
                    />
                </div>
            </>
        </>
    );
}
