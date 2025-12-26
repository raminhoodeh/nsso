import type { Metadata, Viewport } from "next";
import "./globals.css";
import VantaBackground from "@/components/VantaBackground";
import GlassFilter from "@/components/GlassFilter";
import { ToastProvider } from "@/components/ui/Toast";
import { UIProvider } from "@/components/providers/UIProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import DimmingOverlay from "@/components/ui/DimmingOverlay";
import ReferralTracker from "@/components/ReferralTracker";
import ConditionalNSSOAgent from "@/components/agent/ConditionalNSSOAgent";

export const metadata: Metadata = {
  title: "nsso - Future Proof Yourself",
  description: "The most beautiful way to present yourself online. Unify your personal and professional identity.",
  keywords: ["personal website", "portfolio", "link in bio", "personal branding", "digital identity"],
  authors: [{ name: "nsso" }],
  openGraph: {
    title: "nsso - Future Proof Yourself",
    description: "The most beautiful way to present yourself online.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        {/* UI State Provider */}
        <UIProvider>
          <UserProvider>
            {/* SVG Filter for Glass Effects */}
            <GlassFilter />
            <ReferralTracker />

            {/* Animated Cloud Background */}
            <VantaBackground />
            <DimmingOverlay />

            {/* Toast Notifications Provider */}
            <ToastProvider>
              {children}
              <ConditionalNSSOAgent />
            </ToastProvider>
          </UserProvider>
        </UIProvider>
      </body>
    </html>
  );
}
