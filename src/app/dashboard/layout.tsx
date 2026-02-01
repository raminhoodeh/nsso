import DashboardSidebar from '@/components/layout/DashboardSidebar';
import DashboardBottomNav from '@/components/layout/DashboardBottomNav';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-black text-white relative">
            {/* Background Gradient (Global for Dashboard) */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-purple-900/20 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-blue-900/10 rounded-full blur-[120px]" />
            </div>

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
