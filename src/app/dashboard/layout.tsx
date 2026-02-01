import DashboardSidebar from '@/components/layout/DashboardSidebar';
import DashboardBottomNav from '@/components/layout/DashboardBottomNav';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen relative text-white">
            {/* Navigation */}
            <DashboardSidebar />
            <DashboardBottomNav />

            {/* Main Content Area */}
            <main className="relative z-10 w-full lg:pl-[280px] pb-[100px] lg:pb-0 transition-all duration-300">
                {children}
            </main>
        </div>
    );
}
