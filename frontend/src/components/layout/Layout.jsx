import React, { useState } from 'react';
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
        <div className="min-h-screen bg-background text-foreground flex overflow-x-hidden relative w-full max-w-full">
            {/* Global Security Warning (High Visibility) */}
            {isWeakKey && (
                <div className="fixed inset-x-0 top-0 z-[100] p-4 flex justify-center pointer-events-none">
                    <div className="pointer-events-auto w-full max-w-3xl bg-red-600 text-white shadow-[0_0_50px_rgba(220,38,38,0.5)] rounded-2xl border-2 border-red-400 overflow-hidden animate-in fade-in slide-in-from-top duration-500">
                        <div className="p-5 flex flex-col md:flex-row items-center gap-6">
                            <div className="bg-white/20 p-4 rounded-full">
                                <ShieldAlert className="w-10 h-10 text-white animate-pulse" />
                            </div>
                            <div className="flex-1 text-center md:text-left">
                                <h2 className="text-xl font-extrabold tracking-tight mb-1">
                                    CRITICAL SECURITY WARNING
                                </h2>
                                <p className="text-sm text-red-100 mb-6 font-medium">
                                    Your NVR is vulnerable. You are using a default or weak <code>SECRET_KEY</code>.
                                </p>
                                
                                <div className="bg-black/20 p-5 rounded-xl text-left border border-white/10">
                                    <p className="text-xs font-bold text-red-200 uppercase mb-3 px-1">How to fix this:</p>
                                    <div className="space-y-4 text-xs font-mono text-red-50">
                                        <div className="bg-black/30 p-3 rounded-lg border border-white/5 relative group">
                                            <p className="text-[10px] text-red-300/60 uppercase mb-1.5 font-sans">1. Generate Secure Key</p>
                                            <code className="text-white block select-all break-all overflow-x-auto">
                                                openssl rand -hex 32
                                            </code>
                                        </div>
                                        <div className="px-1">
                                            <p className="text-[10px] text-red-300/60 uppercase mb-1.5 font-sans">2. Update .env</p>
                                            <p className="font-sans leading-relaxed text-red-100">
                                                Paste the generated key into your <code className="bg-white/10 px-1 rounded">.env</code> file as <code className="bg-white/10 px-1 rounded text-white">SECRET_KEY=...</code>
                                            </p>
                                        </div>
                                        <div className="bg-black/30 p-3 rounded-lg border border-white/5">
                                            <p className="text-[10px] text-red-300/60 uppercase mb-1.5 font-sans">3. Rebuild & Apply</p>
                                            <code className="text-white block">
                                                docker compose down && docker compose up -d --build
                                            </code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

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
            <div className="flex-1 lg:ml-64 flex flex-col h-screen min-w-0 max-w-full overflow-hidden">
                {/* Mobile header - fixed at top */}
                <div className="lg:hidden sticky top-0 z-40 bg-background/95 backdrop-blur-sm border-b border-border p-3 flex items-center justify-between w-full max-w-full overflow-hidden">
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="p-2 rounded-lg hover:bg-accent shrink-0"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent truncate px-2 flex-1 text-center">
                        VibeNVR
                    </h1>
                    <div className="w-10 shrink-0" /> {/* Spacer for centering */}
                </div>

                <main className={`flex-1 overflow-y-auto overflow-x-hidden relative ${isLivePage ? 'p-0 w-full' : 'px-4 sm:px-5 py-4 lg:p-8'}`}>
                    <div className={isLivePage ? "w-full min-h-full flex flex-col" : "w-full max-w-7xl mx-auto min-w-0 overflow-hidden"}>
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};
