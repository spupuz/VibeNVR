import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Dashboard } from './pages/Dashboard';
import { Cameras } from './pages/Cameras';
import { LiveView } from './pages/LiveView';
import { Timeline } from './pages/Timeline';
import { Settings } from './pages/Settings';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAuth();
    if (loading) return <div className="flex items-center justify-center h-screen bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
    return isAuthenticated ? children : <Navigate to="/login" />;
};

function AppContent() {
    const location = useLocation();
    const navigate = useNavigate();
    const { isAuthenticated, loading } = useAuth();

    // Theme logic
    const [theme, setTheme] = useState(() => {
        if (typeof window !== 'undefined') return localStorage.getItem('theme') || 'light';
        return 'light';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

    // Tab mapping
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

    if (loading) return <div className="flex items-center justify-center h-screen bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />

            <Route path="/*" element={
                <ProtectedRoute>
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
                </ProtectedRoute>
            } />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    );
}

export default App;
