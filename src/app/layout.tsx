import type { Metadata, Viewport } from "next";
import "./globals.css";
import VantaBackground from "@/components/VantaBackground";
import GlassFilter from "@/components/GlassFilter";
import { ToastProvider } from "@/components/ui/Toast";
import { UIProvider } from "@/components/providers/UIProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import Web3Provider from "@/components/providers/Web3Provider";

// ... existing imports ...

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
          <Web3Provider>
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
          </Web3Provider>
        </UIProvider>
      </body>
    </html>
  );
}
