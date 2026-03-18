import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, X, ShieldAlert, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export const Layout = ({ children, activeTab, onTabChange, theme, toggleTheme }) => {
    const location = useLocation();
    const { healthDetails, user } = useAuth();
    const isLivePage = activeTab === 'live' || location.pathname.startsWith('/live');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const isWeakKey = healthDetails?.is_weak_key && user?.role === 'admin';

    return (
        <div className="min-h-screen bg-background text-foreground flex overflow-x-hidden relative">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-45 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <Sidebar
                activeTab={activeTab}
                onTabChange={(tab) => {
                    onTabChange(tab);
                    setSidebarOpen(false);
                }}
                theme={theme}
                toggleTheme={toggleTheme}
                isOpen={sidebarOpen}
                onClose={() => setSidebarOpen(false)}
            />

            {/* Main content */}
            <div className="flex-1 lg:ml-64 flex flex-col h-screen">
                {/* Security Warning Banner */}
                {isWeakKey && (
                    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                            <ShieldAlert className="w-5 h-5 text-amber-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-amber-200">
                                Insecure Configuration Detected
                            </p>
                            <p className="text-xs text-amber-400/80 truncate">
                                Using a default or weak SECRET_KEY. Update your .env for production safety.
                            </p>
                        </div>
                        <div className="hidden sm:block">
                            <button 
                                onClick={() => onTabChange('settings')}
                                className="text-xs font-semibold px-3 py-1 rounded bg-amber-500 text-black hover:bg-amber-400 transition-colors"
                            >
                                Fix in Settings
                            </button>
                        </div>
                    </div>
                )}

                {/* Mobile header - fixed at top */}
                <div className="lg:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border p-3 flex items-center justify-between">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg hover:bg-accent"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                        VibeNVR
                    </h1>
                    <div className="w-10" /> {/* Spacer for centering */}
                </div>

                <main className={`flex-1 overflow-y-auto overflow-x-hidden ${isLivePage ? 'p-0 w-full' : 'px-5 py-4 lg:p-8'}`}>
                    <div className={isLivePage ? "w-full min-h-full flex flex-col" : "w-full max-w-7xl mx-auto"}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
