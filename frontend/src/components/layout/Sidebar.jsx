import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Camera, Film, History, Settings, LogOut, Moon, Sun, X, Info, FileText, Github, Coffee } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../ui/Avatar';
import packageJson from '../../../package.json';
import { useTranslation } from 'react-i18next';
import { useFederation } from '../../contexts/FederationContext';
import { Network, Server } from 'lucide-react';

const SiteSelector = () => {
    const { t } = useTranslation();
    const { nodes, activeNode, setActiveNode } = useFederation();

    if (!nodes || nodes.length === 0) return null;

    return (
        <div className="mb-4 bg-muted/30 rounded-lg p-2 border border-border">
            <label className="text-xs text-muted-foreground font-semibold px-2 mb-1 flex items-center gap-1 uppercase tracking-wider">
                <Network className="w-3 h-3" /> {t('federation.site', 'Site')}
            </label>
            <select
                value={activeNode || 'local'}
                onChange={(e) => setActiveNode(e.target.value === 'local' ? null : e.target.value)}
                className="w-full bg-transparent text-sm font-medium p-1.5 focus:outline-none focus:ring-2 focus:ring-primary rounded cursor-pointer"
            >
                <option value="local" className="bg-card text-foreground">{t('federation.local_node', 'Local Master Node')}</option>
                {nodes.map(node => (
                    <option 
                        key={node.id} 
                        value={node.id} 
                        className="bg-card text-foreground"
                        disabled={node.status !== 'online'}
                    >
                        {node.name} {node.status !== 'online' ? '(Offline)' : ''}
                    </option>
                ))}
            </select>
        </div>
    );
};

const SidebarItem = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        title={label}
        aria-label={label}
        className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card
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
            .then(res => { if (!res.ok) throw new Error('Fetch failed'); return res.json(); })
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

    const { t } = useTranslation();

    const menuItems = [
        { id: 'dashboard', label: t('nav.dashboard', 'Dashboard'), icon: LayoutDashboard },
        { id: 'cameras', label: t('nav.cameras', 'Cameras'), icon: Camera },
        { id: 'live', label: t('nav.live', 'Live View'), icon: Film },
        { id: 'timeline', label: t('nav.timeline', 'Timeline'), icon: History },

        ...(user?.role !== 'viewer' ? [{ id: 'settings', label: t('nav.settings', 'Settings'), icon: Settings }] : []),
        ...(user?.role === 'admin' ? [{ id: 'logs', label: t('nav.logs', 'System Logs'), icon: FileText }] : []),
        { id: 'about', label: t('nav.about', 'About'), icon: Info },
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
                    className="lg:hidden absolute top-4 right-4 p-2 rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={t("nav.close_sidebar", "Close Sidebar")}
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            <div className="px-4 pb-2">
                <SiteSelector />
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
                    title={user?.username || 'Profile'}
                    aria-label={user?.username || 'Profile'}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card
                    ${activeTab === 'profile'
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                >
                    <Avatar user={user} size="sm" className="w-6 h-6 text-xs" />
                    <span className="font-medium text-sm truncate">{user?.username}</span>
                </button>

                <SidebarItem icon={LogOut} label={t('nav.logout', 'Logout')} onClick={logout} />

                <button
                    onClick={toggleTheme}
                    title={theme === 'dark' ? t('nav.light_mode', 'Light Mode') : t('nav.dark_mode', 'Dark Mode')}
                    aria-label={theme === 'dark' ? t('nav.light_mode', 'Light Mode') : t('nav.dark_mode', 'Dark Mode')}
                    className="w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-all duration-200 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                >
                    {theme === 'dark' ? (
                        <Sun className="w-5 h-5 group-hover:text-yellow-500 transition-colors" />
                    ) : (
                        <Moon className="w-5 h-5 group-hover:text-blue-500 transition-colors" />
                    )}
                    <span className="font-medium text-sm">
                        {theme === 'dark' ? t('nav.light_mode', 'Light Mode') : t('nav.dark_mode', 'Dark Mode')}
                    </span>
                </button>

                <div className="pt-3 pb-6 lg:pb-1 flex flex-col items-center justify-center space-y-1">
                    <div className="flex items-center space-x-3 text-muted-foreground mt-1">
                        <a
                            href="https://github.com/spupuz/VibeNVR"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                            title={t("nav.github_repo", "GitHub Repository")}
                            aria-label={t("nav.github_repo", "GitHub Repository")}
                        >
                            <Github className="w-4 h-4" />
                        </a>
                        <a
                            href={`https://github.com/spupuz/VibeNVR/releases/tag/v${packageJson.version}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs hover:text-foreground font-mono tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                            title={t('nav.view_release', 'View release on GitHub')}
                            aria-label={t('nav.view_release', 'View release on GitHub')}
                        >
                            v{packageJson.version}
                        </a>
                        <a
                            href="https://www.buymeacoffee.com/spupuz"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-yellow-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                            title={t("nav.buy_coffee", "Buy Me a Coffee")}
                            aria-label={t("nav.buy_coffee", "Buy Me a Coffee")}
                        >
                            <Coffee className="w-4 h-4" />
                        </a>
                    </div>
                    {latestVersion && (
                        <a
                            href="https://github.com/spupuz/VibeNVR/releases/latest"
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`New version ${latestVersion} is available`}
                            className="text-[10px] text-primary animate-pulse font-semibold hover:underline bg-primary/10 px-2 py-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                            New version available!
                        </a>
                    )}
                </div>
            </div>
        </aside>
    );
};
