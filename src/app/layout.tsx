import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { UIProvider } from "@/components/providers/UIProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import { ProfileProvider } from "@/components/providers/ProfileProvider";
import NSSOTahoeGlassEnvironment from "@/components/providers/NSSOTahoeGlassEnvironment";
import Web3Provider from "@/components/providers/Web3Provider";

import ReferralTracker from "@/components/ReferralTracker";
export const metadata: Metadata = {
  title: "nsso - Future-Proof Yourself",
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

import AuthenticatedLayoutWrapper from "@/components/layout/AuthenticatedLayoutWrapper";
import GlobalTahoeSurfaceBoundary from "@/components/layout/GlobalTahoeSurfaceBoundary";

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
              <ProfileProvider>
                <NSSOTahoeGlassEnvironment>
                  <ReferralTracker />

                  {/* Toast Notifications Provider */}
                  <ToastProvider>
                    <GlobalTahoeSurfaceBoundary>
                      <AuthenticatedLayoutWrapper>
                        {children}
                      </AuthenticatedLayoutWrapper>
                    </GlobalTahoeSurfaceBoundary>
                  </ToastProvider>
                </NSSOTahoeGlassEnvironment>
              </ProfileProvider>
            </UserProvider>
          </Web3Provider>
        </UIProvider>
      </body>
    </html>
  );
}
