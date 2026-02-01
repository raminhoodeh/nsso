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

    // Define routes where Desktop Sidebar should be visible
    // Update: User requested Sidebar to be visible on Preview Profile (/[username]) as well.
    // So we basically show it everywhere if logged in.
    // Mobile responsiveness of Sidebar (hidden on mobile) is handled within the component itself or CSS.

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
