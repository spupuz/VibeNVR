import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, X } from 'lucide-react';

export const Layout = ({ children, activeTab, onTabChange, theme, toggleTheme }) => {
    const location = useLocation();
    const isLivePage = activeTab === 'live' || location.pathname.startsWith('/live');
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-background text-foreground flex">
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

                <main className={`flex-1 overflow-y-auto ${isLivePage ? 'p-0 w-full' : 'p-4 lg:p-8'}`}>
                    <div className={isLivePage ? "w-full min-h-full flex flex-col" : "max-w-7xl mx-auto"}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
