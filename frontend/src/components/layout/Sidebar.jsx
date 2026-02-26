import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Camera, Film, History, Settings, LogOut, Moon, Sun, X, Info, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../ui/Avatar';
import packageJson from '../../../package.json';

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
    const [latestVersion, setLatestVersion] = useState(null);

    useEffect(() => {
        fetch('https://api.github.com/repos/spupuz/VibeNVR/releases/latest')
            .then(res => res.json())
            .then(data => {
                if (data.tag_name) {
                    const tag = data.tag_name.replace('v', '');
                    if (tag.localeCompare(packageJson.version, undefined, { numeric: true, sensitivity: 'base' }) > 0) {
                        setLatestVersion(tag);
                    }
                }
            })
            .catch(err => console.error("Failed to fetch latest release", err));
    }, []);

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'cameras', label: 'Cameras', icon: Camera },
        { id: 'live', label: 'Live View', icon: Film },
        { id: 'timeline', label: 'Timeline', icon: History },

        ...(user?.role !== 'viewer' ? [{ id: 'settings', label: 'Settings', icon: Settings }] : []),
        ...(user?.role === 'admin' ? [{ id: 'logs', label: 'System Logs', icon: FileText }] : []),
        { id: 'about', label: 'About', icon: Info },
    ];

    return (
        <aside className={`
            w-64 h-[100dvh] max-h-[100dvh] overflow-hidden bg-card border-r border-border flex flex-col fixed left-0 top-0 z-50
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

            <nav className="flex-1 overflow-y-auto min-h-0 px-4 space-y-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
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
                    onClick={() => onTabChange('profile')}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group
                    ${activeTab === 'profile'
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                >
                    <Avatar user={user} size="sm" className="w-6 h-6 text-xs" />
                    <span className="font-medium text-sm truncate">{user?.username}</span>
                </button>

                <SidebarItem icon={LogOut} label="Logout" onClick={logout} />

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

                <div className="pt-3 pb-6 lg:pb-1 flex flex-col items-center justify-center space-y-1">
                    <a
                        href={`https://github.com/spupuz/VibeNVR/releases/tag/v${packageJson.version}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground font-mono tracking-wider transition-colors"
                        title="View release on GitHub"
                    >
                        v{packageJson.version}
                    </a>
                    {latestVersion && (
                        <a
                            href="https://github.com/spupuz/VibeNVR/releases/latest"
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`New version ${latestVersion} is available`}
                            className="text-[10px] text-primary animate-pulse font-semibold hover:underline bg-primary/10 px-2 py-0.5 rounded-full"
                        >
                            New version available!
                        </a>
                    )}
                </div>
            </div>
        </aside>
    );
};
