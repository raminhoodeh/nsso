'use client';

import { useUser } from '@/components/providers/UserProvider';
import DashboardSidebar from '@/components/layout/DashboardSidebar';
import DashboardBottomNav from '@/components/layout/DashboardBottomNav';
import { Suspense } from 'react';

function GlobalNavigationContent() {
    const { user, loading } = useUser();

    // Don't show anything while loading to prevent flicker
    if (loading) return null;

    // If not logged in, don't show navigation
    if (!user) return null;

    return (
        <>
            <DashboardSidebar />
            <DashboardBottomNav />
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
