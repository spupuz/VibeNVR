import React from 'react';
import { LayoutDashboard, Camera, Film, History, Settings, LogOut, Moon, Sun, X, Info, FileText } from 'lucide-react';
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

export const Sidebar = ({ activeTab, onTabChange, theme, toggleTheme, isOpen, onClose }) => {
    const { user, logout } = useAuth();

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'cameras', label: 'Cameras', icon: Camera },
        { id: 'live', label: 'Live View', icon: Film },
        { id: 'timeline', label: 'Timeline', icon: History },
        { id: 'settings', label: 'Settings', icon: Settings },
        ...(user?.role === 'admin' ? [{ id: 'logs', label: 'System Logs', icon: FileText }] : []),
        { id: 'about', label: 'About', icon: Info },
    ];

    return (
        <aside className={`
            w-64 h-screen bg-card border-r border-border flex flex-col fixed left-0 top-0 z-50
            transition-transform duration-300 ease-in-out
            ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            lg:translate-x-0
        `}>
            <div className="p-6 flex flex-col items-center">
                <img
                    src={theme === 'dark' ? "/vibe_logo_dark.png" : "/vibe_logo_variant_2.png"}
                    alt="VibeNVR"
                    className="h-20 lg:h-24 w-auto"
                />
                {/* Close button for mobile - absolute positioned */}
                <button
                    onClick={onClose}
                    className="lg:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-accent"
                >
                    <X className="w-5 h-5" />
                </button>
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
