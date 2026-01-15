import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Cameras } from './pages/Cameras';
import { LiveView } from './pages/LiveView';
import { Timeline } from './pages/Timeline';
import { Settings } from './pages/Settings';

function App() {
    const location = useLocation();
    const navigate = useNavigate();
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('theme') || 'light';
        }
        return 'light';
    });

    // Map path to tab name for sidebar highlighting
    const pathToTab = {
        '/': 'dashboard',
        '/dashboard': 'dashboard',
        '/live': 'live',
        '/cameras': 'cameras',
        '/timeline': 'timeline',
        '/recordings': 'timeline',
        '/settings': 'settings'
    };

    const activeTab = pathToTab[location.pathname] || 'dashboard';

    const handleTabChange = (tab) => {
        const tabToPath = {
            'dashboard': '/',
            'live': '/live',
            'cameras': '/cameras',
            'timeline': '/timeline',
            'recordings': '/timeline',
            'settings': '/settings'
        };
        navigate(tabToPath[tab] || '/');
    };

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    return (
        <div className="min-h-screen bg-background text-foreground flex">
            <Layout
                activeTab={activeTab}
                onTabChange={handleTabChange}
                theme={theme}
                toggleTheme={toggleTheme}
            >
                <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/live" element={<LiveView />} />
                    <Route path="/cameras" element={<Cameras />} />
                    <Route path="/timeline" element={<Timeline />} />
                    <Route path="/recordings" element={<Timeline />} />
                    <Route path="/settings" element={<Settings />} />
                </Routes>
            </Layout>
        </div>
    );
}

export default App;
