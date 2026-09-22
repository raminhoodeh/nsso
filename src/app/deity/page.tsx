
"use client";

import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import AgentChatInterface from "@/components/agent/AgentChatInterface";

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
                <section
                    aria-label="Deity chat"
                    className="h-full w-full overflow-hidden rounded-[28px] border border-white/10 bg-[#11161d]"
                >
                    <AgentChatInterface isFullScreen={true} onClose={handleClose} />
                </section>
            </div>
        </main>
    );
}
