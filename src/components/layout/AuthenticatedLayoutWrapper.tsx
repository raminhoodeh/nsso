'use client';

import { useUser } from '@/components/providers/UserProvider';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';

export default function AuthenticatedLayoutWrapper({
    children
}: {
    children: React.ReactNode;
}) {
    const { user } = useUser();
    const pathname = usePathname();

    // Determine if we should apply the authenticated layout spacing
    // Generally, if the user is logged in, we want to show the nav, so we need spacing.
    // However, we might want to opt-out on specific pages (like landing page if they go back?)
    // For now, based on "persistent navigation", we apply it globally if logged in.

    // Check if user is logged in
    const isLoggedIn = !!user;

    return (
        <div className={cn(
            "relative w-full transition-all duration-300",
            isLoggedIn ? "lg:pl-[280px] pb-[100px] lg:pb-0" : ""
        )}>
            {children}
        </div>
    );
}
