
"use client";

import { useState, useEffect, useRef } from 'react';
import { Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

import { useUI } from '@/components/providers/UIProvider';
import { TahoeGlassSurface } from '@/components/ui/tahoe-glass';

// Lazy load the heavy chat interface
const AgentChatInterface = dynamic(
    () => import('./AgentChatInterface'),
    {
        loading: () => (
            <div className="h-full w-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-white/40 animate-spin" />
            </div>
        ),
        ssr: false
    }
);

export default function NSSOAgent() {
    const [isOpen, setIsOpen] = useState(false);
    const [hasOpened, setHasOpened] = useState(false);
    const [initialMessage, setInitialMessage] = useState<string | undefined>(undefined);
    const { isBackgroundDimmed } = useUI();
    const launcherRef = useRef<HTMLElement>(null);
    const chatWindowRef = useRef<HTMLDivElement>(null);
    const restoreLauncherFocusRef = useRef(false);

    // Listen for custom event to open chat
    useEffect(() => {
        const handleOpenChat = (event: CustomEvent) => {
            if (event.detail?.initialMessage) {
                setInitialMessage(event.detail.initialMessage);
            }
            setIsOpen(true);
            setHasOpened(true);
        };

        window.addEventListener('open-deity-chat', handleOpenChat as EventListener);
        return () => {
            window.removeEventListener('open-deity-chat', handleOpenChat as EventListener);
        };
    }, []);

    const handleOpen = () => {
        restoreLauncherFocusRef.current = true;
        setIsOpen(true);
        setHasOpened(true);
    }

    const handleClose = () => {
        setIsOpen(false);
    }

    useEffect(() => {
        if (!isOpen) {
            if (restoreLauncherFocusRef.current) {
                const frame = window.requestAnimationFrame(() => launcherRef.current?.focus());
                restoreLauncherFocusRef.current = false;
                return () => window.cancelAnimationFrame(frame);
            }
            return;
        }

        const frame = window.requestAnimationFrame(() => chatWindowRef.current?.focus({ preventScroll: true }));
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setIsOpen(false);
                return;
            }
            if (event.key !== 'Tab' || !chatWindowRef.current) return;

            const focusable = [...chatWindowRef.current.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )].filter((element) => element.getClientRects().length > 0);
            if (focusable.length === 0) {
                event.preventDefault();
                chatWindowRef.current.focus({ preventScroll: true });
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === chatWindowRef.current)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(frame);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <>
            {/* Persistent Entry Point (Pill) */}
            {!isOpen && (
                <TahoeGlassSurface
                    ref={launcherRef}
                    as="button"
                    variant="pill"
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.04}
                    onClick={handleOpen}
                    aria-label="Open Deity assistant"
                    aria-haspopup="dialog"
                    className="group fixed bottom-6 right-6 z-[6000] hidden h-[56px] border border-white/20 pl-2 pr-6 transition-all duration-500 hover:scale-105 md:inline-flex"
                    contentClassName="flex items-center"
                >
                    <span className="mr-3 flex h-[42px] w-[42px] items-center justify-center overflow-hidden rounded-full border border-white/50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/nsso-agent-avatar.png"
                            alt=""
                            className="h-full w-full object-cover"
                        />
                    </span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/deity logo white.png"
                        alt="Deity"
                        className="h-7 w-auto translate-y-[2px] object-contain"
                    />
                </TahoeGlassSurface>
            )}

            {/* Pop-up Mode - ALWAYS RENDERED but HIDDEN when closed to persist state */}
            <>
                {/* Dimming Overlay */}
                <div
                    className={`fixed inset-0 z-40 transition-all duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                        } ${isBackgroundDimmed ? 'bg-black/0' : 'bg-black/60'
                        }`}
                    aria-hidden="true"
                    onClick={handleClose}
                />

                {/* Chat Window */}
                <div
                    ref={chatWindowRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Deity assistant"
                    aria-hidden={!isOpen}
                    inert={!isOpen}
                    tabIndex={-1}
                    className={`fixed z-[6000] w-full h-full transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
                        /* Mobile Styles (Default) */
                        inset-0 
                        ${isOpen
                            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
                            : 'opacity-0 translate-y-10 scale-95 pointer-events-none'
                        }
                        
                        /* Desktop Styles (Sidebar) */
                        md:inset-auto md:top-0 md:right-0 md:h-screen md:w-[42vw] md:min-w-[500px] md:max-w-[720px]
                        ${isOpen
                            ? 'md:translate-x-0 md:opacity-100 md:scale-100'
                            : 'md:translate-x-full md:opacity-100 md:scale-100 md:translate-y-0'
                        }
                    `}
                >
                    {hasOpened && (
                        <AgentChatInterface
                            isFullScreen={false}
                            onClose={handleClose}
                            onMaximize={undefined} // Disable maximize on desktop as it's already full height
                            initialMessage={initialMessage}
                        />
                    )}
                </div>
            </>
        </>
    );
}
