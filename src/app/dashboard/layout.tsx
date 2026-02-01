export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen relative text-white">
            {/* Main Content Area */}
            <main className="relative z-10 w-full transition-all duration-300">
                {children}
            </main>
        </div>
    );
}
