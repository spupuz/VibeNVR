import React from 'react';
import { LayoutDashboard, Camera, Film, History, Users, Settings, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group
      ${active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            }`}
    >
        <Icon className={`w-5 h-5 transition-transform group-hover:scale-110 ${active ? 'stroke-[2.5px]' : ''}`} />
        <span className="font-medium text-sm">{label}</span>
    </button>
);

export const Sidebar = ({ activeTab, onTabChange, theme, toggleTheme }) => {
    const { logout } = useAuth();
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'cameras', label: 'Cameras', icon: Camera },
        { id: 'live', label: 'Live View', icon: Film },
        { id: 'timeline', label: 'Timeline', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
    ];

    return (
        <aside className="w-64 h-screen bg-card border-r border-border flex flex-col fixed left-0 top-0 z-30">
            <div className="p-6">
                <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                        <Camera className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
                        VibeNVR
                    </h1>
                </div>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                {menuItems.map((item) => (
                    <SidebarItem
                        key={item.id}
                        icon={item.icon}
                        label={item.label}
                        active={activeTab === item.id}
                        onClick={() => onTabChange(item.id)}
                    />
                ))}
            </nav>

            <div className="p-4 border-t border-border space-y-2">
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200 group"
                >
                    {theme === 'dark' ? (
                        <Sun className="w-5 h-5 group-hover:text-yellow-500 transition-colors" />
                    ) : (
                        <Moon className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                    )}
                    <span className="font-medium text-sm">
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </span>
                </button>
                <SidebarItem icon={LogOut} label="Logout" onClick={logout} />
            </div>
        </aside>
    );
};
