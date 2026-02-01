'use client';

import { useUser } from '@/components/providers/UserProvider';
import DashboardSidebar from '@/components/layout/DashboardSidebar';
import DashboardBottomNav from '@/components/layout/DashboardBottomNav';
import { Suspense } from 'react';
import { usePathname } from 'next/navigation';

function GlobalNavigationContent() {
    const { user, loading } = useUser();
    const pathname = usePathname();

    // Don't show anything while loading to prevent flicker
    if (loading) return null;

    // If not logged in, don't show navigation
    if (!user) return null;

    // Define routes where Desktop Sidebar should be visible
    // Basically: Dashboard, Earnings, Deity, News, Admin.
    // Public profile / Preview pages (root or /[username]) should NOT have desktop sidebar.
    const showDesktopSidebar = pathname === '/' || // Homepage when logged in
        pathname?.startsWith('/dashboard') ||
        pathname?.startsWith('/earnings') ||
        pathname?.startsWith('/deity') ||
        pathname?.startsWith('/news') ||
        pathname?.startsWith('/admin') ||
        pathname === '/check-username'; // Edge case

    return (
        <>
            {showDesktopSidebar && <DashboardSidebar />}
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
