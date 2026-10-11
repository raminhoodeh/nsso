'use client';

import { useUser } from '@/components/providers/UserProvider';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import {
    routeSuppressesAuthenticatedNavigation,
    routeUsesDashboardSidebar,
} from '@/lib/tahoe-glass/route-boundaries';

export default function AuthenticatedLayoutWrapper({
    children
}: {
    children: React.ReactNode;
}) {
    const { user } = useUser();
    const pathname = usePathname();

    const isLoggedIn = !!user;
    const navigationSuppressed = routeSuppressesAuthenticatedNavigation(pathname);
    const usesDashboardSidebar = routeUsesDashboardSidebar(pathname);

    return (
        <div className={cn(
            "relative w-full transition-all duration-300",
            isLoggedIn && !navigationSuppressed ? "pb-[calc(var(--mobile-bottom-nav-height)+16px)] lg:pb-0" : "",
            isLoggedIn && usesDashboardSidebar ? "lg:pl-[280px]" : ""
        )}>
            {children}
        </div>
    );
}
