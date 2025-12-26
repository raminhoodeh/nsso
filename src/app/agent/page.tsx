
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
        <div className="w-full h-screen relative flex flex-col items-center justify-center">
            {/* Header / Navbar */}
            <div className="absolute top-0 left-0 w-full z-20">
                <Header />
            </div>

            {/* Dimming Overlay for the Vanta Background */}
            <div className="absolute inset-0 z-0 bg-black/60 pointer-events-none"></div>

            <div className="w-full max-w-6xl h-[90vh] relative z-10 p-4 mt-16">
                <div className="absolute -inset-1 top-4 bg-gradient-to-tr from-cyan-500/20 to-purple-500/20 rounded-[40px] blur-2xl"></div>
                <AgentChatInterface isFullScreen={true} onClose={handleClose} />
            </div>
        </div>
    );
}
