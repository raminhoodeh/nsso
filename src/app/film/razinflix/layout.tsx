import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'RazinFlix — Films worth watching | nsso',
    description: 'Discover a curated collection of films, browse by category, and explore film details and trailers on RazinFlix.',
    alternates: { canonical: '/film/razinflix' },
};

export default function RazinFlixLayout({ children }: { children: React.ReactNode }) {
    return children;
}
