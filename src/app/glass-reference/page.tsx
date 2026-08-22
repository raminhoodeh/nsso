import type { Metadata } from "next";
import { notFound } from "next/navigation";

import GlassReferenceDemo from "./GlassReferenceDemo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tahoe Glass Reference | NSSO",
  description: "Visual reference fixture for NSSO's supplied Tahoe liquid-glass implementation.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function GlassReferencePage() {
  const deploymentEnvironment = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  const explicitlyEnabled = process.env.ENABLE_GLASS_REFERENCE === "true";

  if (deploymentEnvironment === "production" && !explicitlyEnabled) {
    notFound();
  }

  return <GlassReferenceDemo />;
}
