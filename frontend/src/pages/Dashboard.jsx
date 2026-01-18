import React, { useState, useEffect } from 'react';
import { Activity, Camera, HardDrive, ShieldAlert, Film, Image, CalendarClock, Cpu, MemoryStick, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const StatCard = ({ title, value, subtext, icon: Icon, trend }) => (
    <div className="p-6 rounded-xl bg-card border border-border hover:shadow-lg transition-shadow duration-300 group">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
            <div className="rounded-full bg-primary/10 p-2 text-primary group-hover:scale-110 transition-transform">
                <Icon className="w-5 h-5" />
            </div>
        </div>
        <p className="text-3xl font-bold">{value}</p>
        <p className={`text-xs mt-1 ${trend === 'positive' ? 'text-green-500' : 'text-muted-foreground'}`}>
            {subtext}
        </p>
    </div>
);

export const Dashboard = () => {
    const { token } = useAuth();
    const [stats, setStats] = useState({
        active_cameras: 0,
        total_events: 0,
        video_count: 0,
        picture_count: 0,
        storage: {
            total_gb: 0, used_gb: 0, free_gb: 0, percent: 0,
            estimated_retention_days: null, daily_rate_gb: null
        },
        system_status: 'Unknown',
        uptime: '0m'
    });
    const [recentEvents, setRecentEvents] = useState([]);
    const [cameraMap, setCameraMap] = useState({});
    const [graphData, setGraphData] = useState([]);
    const [resourceHistory, setResourceHistory] = useState([]);

    // Widget Visibility State (persisted in localStorage)
    const [visibleWidgets, setVisibleWidgets] = useState(() => {
        const saved = localStorage.getItem('dashboardWidgets');
        return saved ? JSON.parse(saved) : {
            videos: true,
            pictures: true,
            storage: true,
            system: true,
            activityGraph: true,
            resourceGraph: true,
            recentEvents: true,
            cameras: true
        };
    });
    const [showWidgetModal, setShowWidgetModal] = useState(false);

    useEffect(() => {
        localStorage.setItem('dashboardWidgets', JSON.stringify(visibleWidgets));
    }, [visibleWidgets]);

    useEffect(() => {
        if (!token) return;

        const fetchStats = async () => {
            try {
                const res = await fetch('/api/stats/', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) setStats(await res.json());
            } catch (err) {
                console.error("Failed to fetch stats", err);
            }
        };

        const fetchEvents = async () => {
            try {
                const res = await fetch('/api/events/?limit=50', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) setRecentEvents(await res.json());
            } catch (err) {
                console.error("Failed to fetch events", err);
            }
        };

        const fetchCameras = async () => {
            try {
                const res = await fetch('/api/cameras/', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    const map = data.reduce((acc, cam) => ({ ...acc, [cam.id]: cam.name }), {});
                    setCameraMap(map);
                }
            } catch (err) {
                console.error("Failed to fetch cameras", err);
            }
        };

        const fetchGraphData = async () => {
            try {
                const res = await fetch('/api/stats/history/', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    setGraphData(await res.json());
                } else {
                    console.warn("Failed to fetch graph data");
                }
            } catch (err) {
                console.error("Error fetching graph data", err);
            }
        };

        const fetchResourceHistory = async () => {
            try {
                const res = await fetch('/api/stats/resources-history/', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    // Format for chart
                    const formatted = data.map(item => ({
                        time: new Date(item.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                        cpu: item.cpu_percent,
                        memory: Math.round(item.memory_mb / 1024 * 10) / 10  // Convert to GB
                    }));
                    setResourceHistory(formatted);
                }
            } catch (err) {
                console.error("Error fetching resource history", err);
            }
        };

        fetchStats();
        fetchEvents();
        fetchCameras();
        fetchGraphData();
        fetchResourceHistory();

        const interval = setInterval(() => {
            fetchStats();
            fetchEvents();
            fetchResourceHistory();
        }, 30000);
        return () => clearInterval(interval);
    }, [token]);

    const getCameraName = (id) => cameraMap[id] || `Camera ${id}`;

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground mt-2">System overview and status.</p>
                </div>
                <button
                    onClick={() => setShowWidgetModal(true)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                    title="Customize Dashboard"
                >
                    <Settings className="w-5 h-5 text-muted-foreground" />
                </button>
            </div>

            {/* Widgets Configuration Modal */}
            {showWidgetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold mb-4">Dashboard Widgets</h3>
                        <div className="space-y-3 mb-6">
                            {Object.entries({
                                videos: 'Video Count',
                                pictures: 'Picture Count',
                                storage: 'Storage Usage',
                                system: 'System Status',
                                activityGraph: 'Activity Graph',
                                resourceGraph: 'Resource Usage',
                                recentEvents: 'Recent Events',
                                cameras: 'Active Cameras'
                            }).map(([key, label]) => (
                                <div key={key} className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-lg">
                                    <span className="text-sm font-medium">{label}</span>
                                    <button
                                        onClick={() => setVisibleWidgets(prev => ({ ...prev, [key]: !prev[key] }))}
                                        className={'relative inline-flex h-6 w-11 items-center rounded-full transition-colors ' +
                                            (visibleWidgets[key] ? 'bg-primary' : 'bg-muted')
                                        }
                                    >
                                        <span className={'inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ' +
                                            (visibleWidgets[key] ? 'translate-x-6' : 'translate-x-1')
                                        } />
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowWidgetModal(false)}
                                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {stats.details && visibleWidgets.storage && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                                <Film className="w-5 h-5" />
                            </div>
                            <h3 className="font-semibold text-lg">Movies Storage</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg bg-muted/30">
                                <p className="text-sm text-muted-foreground">Total Files</p>
                                <p className="text-2xl font-bold">{stats.details.global.movies.count}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/30">
                                <p className="text-sm text-muted-foreground">Disk Usage</p>
                                <p className="text-2xl font-bold">{stats.details.global.movies.size_gb} GB</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                                <Image className="w-5 h-5" />
                            </div>
                            <h3 className="font-semibold text-lg">Snapshots Storage</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg bg-muted/30">
                                <p className="text-sm text-muted-foreground">Total Files</p>
                                <p className="text-2xl font-bold">{stats.details.global.images.count}</p>
                            </div>
                            <div className="p-4 rounded-lg bg-muted/30">
                                <p className="text-sm text-muted-foreground">Disk Usage</p>
                                <p className="text-2xl font-bold">{stats.details.global.images.size_gb} GB</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-card border border-border rounded-xl p-6">
                        <div className="flex items-center space-x-3 mb-6">
                            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                                <CalendarClock className="w-5 h-5" />
                            </div>
                            <h3 className="font-semibold text-lg">Retention Est.</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <p className="text-3xl font-bold">
                                    {stats.storage.estimated_retention_days !== null
                                        ? `~${stats.storage.estimated_retention_days} Days`
                                        : 'Calculating...'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Capacity at current daily rate
                                </p>
                            </div>
                            <div className="p-2 rounded-lg bg-muted/30 flex justify-between items-center">
                                <p className="text-sm text-muted-foreground">Daily Burn Rate</p>
                                <p className="text-lg font-bold">
                                    {stats.storage.daily_rate_gb
                                        ? `${stats.storage.daily_rate_gb} GB/day`
                                        : 'N/A'}
                                </p>
                            </div>
                            {stats.storage.required_storage_gb && (
                                <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 flex justify-between items-center">
                                    <p className="text-sm text-muted-foreground">
                                        Required for {stats.storage.configured_retention_days} days
                                    </p>
                                    <p className="text-lg font-bold text-purple-500">
                                        {stats.storage.required_storage_gb} GB
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {visibleWidgets.cameras && <StatCard title="Active Cameras" value={stats.active_cameras} subtext="All systems operational" icon={Camera} trend="positive" />}
                {visibleWidgets.videos && <StatCard title="Motion Events" value={stats.total_events} subtext="Total events recorded" icon={Activity} />}
                {visibleWidgets.videos && <StatCard title="Videos" value={stats.video_count} subtext="Recorded clips" icon={Film} />}
                {visibleWidgets.pictures && <StatCard title="Pictures" value={stats.picture_count} subtext="Captured snapshots" icon={Image} />}
                {visibleWidgets.storage && <StatCard title="Storage Used" value={`${stats.storage.percent}%`} subtext={`${stats.storage.used_gb}GB / ${stats.storage.total_gb}GB`} icon={HardDrive} />}
                {visibleWidgets.system && <StatCard title="CPU Usage" value={`${stats.resources?.cpu_percent || 0}%`} subtext={`Engine: ${stats.resources?.engine_cpu || 0}% | API: ${stats.resources?.backend_cpu || 0}%`} icon={Cpu} />}
                {visibleWidgets.system && <StatCard title="Memory" value={`${Math.round(stats.resources?.memory_mb || 0)} MB`} subtext={`Engine: ${Math.round(stats.resources?.engine_mem_mb || 0)} | API: ${Math.round(stats.resources?.backend_mem_mb || 0)} MB`} icon={MemoryStick} />}
                {visibleWidgets.system && <StatCard title="System Status" value={stats.system_status} subtext={`Uptime: ${stats.uptime}`} icon={ShieldAlert} trend="positive" />}
            </div>

            {/* Resource Usage History Graph */}
            {/* Resource Usage History Graph */}
            {visibleWidgets.resourceGraph && (
                <div className="bg-card rounded-xl border border-border p-6">
                    <h3 className="text-lg font-semibold mb-4">Resource Usage (Last Hour)</h3>
                    <div className="h-[200px] w-full">
                        {resourceHistory.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={resourceHistory} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                                    <XAxis
                                        dataKey="time"
                                        stroke="#888888"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        yAxisId="cpu"
                                        stroke="#3b82f6"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={value => `${value}%`}
                                        domain={[0, 'auto']}
                                    />
                                    <YAxis
                                        yAxisId="mem"
                                        orientation="right"
                                        stroke="#10b981"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={value => `${value}GB`}
                                        domain={[0, 'auto']}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                        formatter={(value, name) => [
                                            name === 'CPU' ? `${value}%` : `${value} GB`,
                                            name
                                        ]}
                                    />
                                    <Legend />
                                    <Line
                                        yAxisId="cpu"
                                        type="monotone"
                                        dataKey="cpu"
                                        name="CPU"
                                        stroke="#3b82f6"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                    <Line
                                        yAxisId="mem"
                                        type="monotone"
                                        dataKey="memory"
                                        name="Memory"
                                        stroke="#10b981"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                                <p>Collecting data... (updates every minute)</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {visibleWidgets.activityGraph && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-card rounded-xl border border-border p-6 h-[400px]">
                        <h3 className="text-lg font-semibold mb-6">Activity Overview (24h)</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={graphData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="time" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={value => `${value}`} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                                    />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                                    <Area type="monotone" dataKey="events" stroke="#3b82f6" fillOpacity={1} fill="url(#colorEvents)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="bg-card rounded-xl border border-border p-6 h-[400px]">
                        <h3 className="text-lg font-semibold mb-6">Media per Camera</h3>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={Object.entries(stats.details?.cameras || {}).map(([id, data]) => ({
                                        name: getCameraName(parseInt(id)),
                                        images: data.images.count,
                                        videos: data.movies.count
                                    }))}
                                    margin={{ top: 10, right: 30, left: 0, bottom: 60 }}
                                >
                                    <XAxis dataKey="name" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} angle={-45} textAnchor="end" interval={0} height={70} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))' }}
                                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                                    />
                                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                                    <Bar dataKey="images" name="Images" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="videos" name="Videos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {visibleWidgets.recentEvents && (
                <div className="grid grid-cols-1 gap-8">
                    <div className="bg-card rounded-xl border border-border p-6 h-[400px]">
                        <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
                        <div className="space-y-4 overflow-y-auto max-h-[320px]">
                            {recentEvents.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-4">No recent events</p>
                            ) : (
                                recentEvents.map((evt) => (
                                    <div key={evt.id} className="flex items-center space-x-4 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                                        <div className={`w-2 h-2 rounded-full ${evt.type === 'video' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                        <div className="overflow-hidden flex-1">
                                            <p className="text-sm font-medium truncate">Motion - {getCameraName(evt.camera_id)}</p>
                                            <p className="text-xs text-muted-foreground">{new Date(evt.timestamp_start).toLocaleString()}</p>
                                        </div>
                                        <span className={`text-xs px-2 py-0.5 rounded ${evt.type === 'video' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                                            {evt.type === 'video' ? 'Video' : 'Image'}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
