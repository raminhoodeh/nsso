import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import { UIProvider } from "@/components/providers/UIProvider";
import { UserProvider } from "@/components/providers/UserProvider";
import { ProfileProvider } from "@/components/providers/ProfileProvider";
import NSSOTahoeGlassEnvironment from "@/components/providers/NSSOTahoeGlassEnvironment";
import {
  TahoeV4RolloutGate,
  type TahoeV4RolloutMode,
} from "@/components/providers/TahoeV4RolloutGate";
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
  const tahoeV4Mode: TahoeV4RolloutMode =
    process.env.NEXT_PUBLIC_TAHOE_GLASS_V4 === "material-only"
      ? "material-only"
      : process.env.NEXT_PUBLIC_TAHOE_GLASS_V4 === "true" ||
          process.env.NEXT_PUBLIC_TAHOE_GLASS_V4 === "1" ||
          process.env.NEXT_PUBLIC_TAHOE_GLASS_V4 === "on"
        ? "on"
        : "off";
  const tahoeV4Routes = (
    process.env.NEXT_PUBLIC_TAHOE_GLASS_V4_ROUTES || "/"
  )
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean);
  const allowTahoeV4ClientOverride =
    process.env.NEXT_PUBLIC_TAHOE_GLASS_V4_ALLOW_OVERRIDE === "true" ||
    process.env.NODE_ENV !== "production" ||
    process.env.VERCEL_ENV === "preview";

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased min-h-screen" suppressHydrationWarning>
        {/* UI State Provider */}
        <UIProvider>
          <Web3Provider>
            <UserProvider>
              <ProfileProvider>
                <TahoeV4RolloutGate
                  initialMode={tahoeV4Mode}
                  routes={tahoeV4Routes}
                  allowClientOverride={allowTahoeV4ClientOverride}
                >
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
                </TahoeV4RolloutGate>
              </ProfileProvider>
            </UserProvider>
          </Web3Provider>
        </UIProvider>
      </body>
    </html>
  );
}
