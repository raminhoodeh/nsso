'use client';

import { useUser } from '@/components/providers/UserProvider';
import DashboardSidebar from '@/components/layout/DashboardSidebar';
import Header from '@/components/layout/Header';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import {
    routeSuppressesAuthenticatedNavigation,
    routeUsesDashboardSidebar,
    routeNeedsGlobalAccountHeader,
} from '@/lib/tahoe-glass/route-boundaries';


function GlobalNavigationContent() {
    const { user, loading } = useUser();
    const pathname = usePathname();

    // Don't show anything while loading to prevent flicker
    if (loading) return null;

    // Route-owned experiences provide their own full-viewport navigation.
    if (routeSuppressesAuthenticatedNavigation(pathname)) return null;

    // If not logged in, don't show navigation
    if (!user) return null;

    const usesDashboardSidebar = routeUsesDashboardSidebar(pathname);

    return (
        <>
            {usesDashboardSidebar && <DashboardSidebar />}
            {routeNeedsGlobalAccountHeader(pathname) && <Header />}
        </>
    );
}

export default function GlobalNavigation() {
    return (
        <Suspense fallback={null}>
            <GlobalNavigationContent />
        </Suspense>
    );
}
