import React from 'react';
import { Sidebar } from './Sidebar';

export const Layout = ({ children, activeTab, onTabChange, theme, toggleTheme }) => {
    return (
        <div className="min-h-screen bg-background text-foreground flex">
            <Sidebar
                activeTab={activeTab}
                onTabChange={onTabChange}
                theme={theme}
                toggleTheme={toggleTheme}
            />
            <main className="flex-1 ml-64 p-8 overflow-y-auto h-screen">
                <div className="max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
};

