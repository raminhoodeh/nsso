
"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import AgentChatInterface from "@/components/agent/AgentChatInterface";
import { TahoeGlassSurface } from "@/components/ui/tahoe-glass";

export default function AgentPage() {
    const router = useRouter();

    const handleClose = () => {
        // Check if opened in new tab/window or navigated to directly
        if (typeof window !== 'undefined' && window.opener) {
            // Opened via window.open() - close the tab
            window.close();
        } else {
            // Navigated directly - go back to homepage
            router.push('/');
        }
    };

    return (
        <main className="relative flex h-dvh w-full flex-col items-center justify-center overflow-hidden">
            <Header />

            <div className="relative z-10 h-full w-full px-3 pb-3 pt-[100px]">
                <TahoeGlassSurface
                    as="section"
                    variant="panel"
                    tone="light"
                    semanticTint="dark"
                    semanticTintOpacity={0.045}
                    aria-label="Deity chat"
                    className="h-full w-full overflow-hidden border border-white/10"
                    contentClassName="h-full w-full overflow-hidden [&>div]:!h-full [&>div]:!bg-transparent [&>div]:!backdrop-blur-none"
                >
                    <AgentChatInterface isFullScreen={true} onClose={handleClose} />
                </TahoeGlassSurface>
            </div>
        </main>
    );
}
