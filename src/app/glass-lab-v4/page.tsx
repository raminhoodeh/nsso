import type { Metadata } from "next";
import { notFound } from "next/navigation";

import GlassLabV4 from "./GlassLabV4";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tahoe Glass V4 Visual Lab | NSSO",
  description:
    "Deterministic bare, material and refraction fixtures for visual acceptance of NSSO Tahoe glass.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function GlassLabV4Page() {
  const deploymentEnvironment = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  const explicitlyEnabled = process.env.ENABLE_GLASS_LAB_V4 === "true";

  if (deploymentEnvironment === "production" && !explicitlyEnabled) {
    notFound();
  }

  return <GlassLabV4 />;
}
