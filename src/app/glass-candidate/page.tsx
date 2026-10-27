import type { Metadata } from "next";
import { notFound } from "next/navigation";
import GlassCandidateDemo from "./GlassCandidateDemo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Supplied Glass Comparison | NSSO",
  robots: { index: false, follow: false },
};

export default function GlassCandidatePage() {
  // Evaluation only: no opt-in flag can accidentally expose it on production.
  if (process.env.NODE_ENV === "production") notFound();
  return <GlassCandidateDemo />;
}
