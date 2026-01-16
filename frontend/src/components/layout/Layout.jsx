import React from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export const Layout = ({ children, activeTab, onTabChange, theme, toggleTheme }) => {
    const location = useLocation();
    const isLivePage = activeTab === 'live' || location.pathname.startsWith('/live');

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            <Sidebar
                activeTab={activeTab}
                onTabChange={onTabChange}
                theme={theme}
                toggleTheme={toggleTheme}
            />
            <main className={`flex-1 ml-64 overflow-y-auto h-screen ${isLivePage ? 'p-0 w-full' : 'p-8'}`}>
                <div className={isLivePage ? "w-full min-h-full flex flex-col" : "max-w-7xl mx-auto"}>
                    {children}
                </div>
            </main>
        </div>
    );
};

