import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Camera, HardDrive, ShieldAlert, Film, Image, CalendarClock, Cpu, MemoryStick, Settings, GripVertical, GripHorizontal, Network, Database } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const StatCard = ({ title, value, subtext, icon: Icon, trend }) => (
    <div className="p-6 rounded-xl bg-card border border-border hover:shadow-lg transition-shadow duration-300 group h-full relative">
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

// Draggable Wrapper
const SortableWidget = ({ id, span, children }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`${span} relative group/widget`}
        >
            {/* Drag Handle - Only visible on hover (or always visible if preferred) */}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-2 right-2 p-1.5 rounded cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground hover:bg-muted z-20 opacity-0 group-hover/widget:opacity-100 transition-opacity"
            >
                <GripHorizontal className="w-4 h-4" />
            </div>

            <div className="h-full shadow-sm hover:shadow-md transition-shadow">
                {children}
            </div>
        </div>
    );
};

export const Dashboard = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [stats, setStats] = useState({
        active_cameras: 0,
        total_events: 0,
        video_count: 0,
        picture_count: 0,
        storage: {
            total_gb: 0, used_gb: 0, free_gb: 0, percent: 0,
            estimated_retention_days: null, daily_rate_gb: null,
            total_quota_gb: 0, quota_percent: 0
        },
        network: { recv_mbps: 0, sent_mbps: 0 },
        database: { size_mb: 0, event_count: 0 },
        system_status: 'Unknown',
        uptime: '0m'
    });
    const [recentEvents, setRecentEvents] = useState([]);
    const [cameraMap, setCameraMap] = useState({});
    const [graphData, setGraphData] = useState([]);
    const [resourceHistory, setResourceHistory] = useState([]);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Widget Visibility State
    const [visibleWidgets, setVisibleWidgets] = useState(() => {
        const saved = localStorage.getItem('dashboardWidgets');
        return saved ? JSON.parse(saved) : {
            videos: true,
            pictures: true,
            storage: true,
            system: true,
            activityGraph: true,
            resourceGraph: true,
            networkGraph: true,
            recentEvents: true,
            cameras: true
        };
    });

    // Widget Order State
    const DEFAULT_ORDER = [
        'storage_movies', 'storage_pictures', 'storage_retention',
        'active_cameras', 'total_events', 'network_stats', 'db_stats',
        'storage_used', 'cpu_usage', 'memory_usage', 'system_status',
        'resource_graph', 'network_graph', 'activity_graph', 'media_graph', 'recent_events'
    ];

    const [widgetOrder, setWidgetOrder] = useState(() => {
        const saved = localStorage.getItem('dashboardOrder_v2');
        if (saved) {
            let parsed = JSON.parse(saved);

            // 1. Identify missing widgets
            const missing = DEFAULT_ORDER.filter(id => !parsed.includes(id));

            if (missing.length > 0) {
                // Special handling: smart insert for network_graph
                if (missing.includes('network_graph') && parsed.includes('resource_graph')) {
                    const idx = parsed.indexOf('resource_graph');
                    // Insert network_graph right after resource_graph
                    parsed = [
                        ...parsed.slice(0, idx + 1),
                        'network_graph',
                        ...parsed.slice(idx + 1)
                    ];
                    // Remove network_graph from missing list to avoid double add
                    const netIndex = missing.indexOf('network_graph');
                    if (netIndex > -1) missing.splice(netIndex, 1);
                }

                // Append remaining missing widgets
                return [...parsed, ...missing];
            }
            return parsed;
        }
        return DEFAULT_ORDER;
    });

    const [showWidgetModal, setShowWidgetModal] = useState(false);

    useEffect(() => {
        localStorage.setItem('dashboardWidgets', JSON.stringify(visibleWidgets));
    }, [visibleWidgets]);

    useEffect(() => {
        localStorage.setItem('dashboardOrder_v2', JSON.stringify(widgetOrder));
    }, [widgetOrder]);

    // DnD Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setWidgetOrder((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    // Data Fetching
    useEffect(() => {
        if (!token) return;

        const fetchAll = async () => {
            try {
                // Parallel fetch
                const [statsRes, eventsRes, camsRes, graphRes, resRes] = await Promise.all([
                    fetch('/api/stats', { headers: { Authorization: `Bearer ${token}` } }).catch(e => ({ ok: false })),
                    fetch('/api/events?limit=50', { headers: { Authorization: `Bearer ${token}` } }).catch(e => ({ ok: false })),
                    fetch('/api/cameras', { headers: { Authorization: `Bearer ${token}` } }).catch(e => ({ ok: false })),
                    fetch('/api/stats/history', { headers: { Authorization: `Bearer ${token}` } }).catch(e => ({ ok: false })),
                    fetch('/api/stats/resources-history', { headers: { Authorization: `Bearer ${token}` } }).catch(e => ({ ok: false }))
                ]);

                if (statsRes.ok) setStats(await statsRes.json());
                if (eventsRes.ok) setRecentEvents(await eventsRes.json());
                if (camsRes.ok) {
                    const data = await camsRes.json();
                    setCameraMap(data.reduce((acc, cam) => ({ ...acc, [cam.id]: cam.name }), {}));
                }
                if (graphRes.ok) setGraphData(await graphRes.json());
                if (resRes.ok) {
                    const data = await resRes.json();
                    setResourceHistory(data.map(item => ({
                        time: new Date(item.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
                        cpu: item.cpu_percent,
                        memory: Math.round(item.memory_mb / 1024 * 10) / 10,
                        network_in: item.network_recv_mbps || 0,
                        network_out: item.network_sent_mbps || 0
                    })));
                }
            } catch (err) {
                console.error("Dashboard data fetch error", err);
            }
        };

        fetchAll();
        const interval = setInterval(fetchAll, 30000);
        return () => clearInterval(interval);
    }, [token]);

    const getCameraName = (id) => cameraMap[id] || `Camera ${id}`;

    // Widget Definition Registry
    // Maps Widget ID -> { Component, Span, Group (for visibility) }
    // Using 12-column grid for flexibility:
    // Span 4 = 1/3 (3 per row)
    // Span 3 = 1/4 (4 per row)
    // Span 6 = 1/2 (2 per row)
    // Span 12 = Full width
    const WIDGET_REGISTRY = {
        storage_movies: {
            span: 'col-span-12 md:col-span-6 lg:col-span-4',
            group: 'storage',
            render: () => (
                <div className="bg-card border border-border rounded-xl p-6 h-full">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                            <Film className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-lg">Movies</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground">Total Files</p>
                            <p className="text-xl font-bold">{stats.details?.global.movies.count || 0}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground">Disk Usage</p>
                            <p className="text-xl font-bold">{stats.details?.global.movies.size_gb || 0} GB</p>
                        </div>
                    </div>
                </div>
            )
        },
        storage_pictures: {
            span: 'col-span-12 md:col-span-6 lg:col-span-4',
            group: 'storage',
            render: () => (
                <div className="bg-card border border-border rounded-xl p-6 h-full">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="p-2 bg-green-500/10 rounded-lg text-green-500">
                            <Image className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-lg">Snapshots</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground">Total Files</p>
                            <p className="text-xl font-bold">{stats.details?.global.images.count || 0}</p>
                        </div>
                        <div className="p-3 rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground">Disk Usage</p>
                            <p className="text-xl font-bold">{stats.details?.global.images.size_gb || 0} GB</p>
                        </div>
                    </div>
                </div>
            )
        },
        storage_retention: {
            span: 'col-span-12 md:col-span-6 lg:col-span-4',
            group: 'storage',
            render: () => (
                <div className="bg-card border border-border rounded-xl p-6 h-full">
                    <div className="flex items-center space-x-3 mb-6">
                        <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500">
                            <CalendarClock className="w-5 h-5" />
                        </div>
                        <h3 className="font-semibold text-lg">Retention</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <p className="text-3xl font-bold">
                                {stats.storage.estimated_retention_days !== null
                                    ? `~${stats.storage.estimated_retention_days} Days`
                                    : '...'}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">Capacity at current daily rate</p>
                        </div>
                        <div className="p-2 rounded-lg bg-muted/30 flex justify-between items-center">
                            <p className="text-xs text-muted-foreground">Burn Rate</p>
                            <p className="text-sm font-bold">{stats.storage.daily_rate_gb || 0} GB/d</p>
                        </div>
                        {stats.storage.required_storage_gb && (
                            <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 flex justify-between items-center">
                                <p className="text-xs text-muted-foreground">
                                    Req. for {stats.storage.configured_retention_days} days
                                </p>
                                <p className="text-sm font-bold text-purple-500">
                                    {stats.storage.required_storage_gb} GB
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )
        },
        active_cameras: { group: 'cameras', span: 'col-span-6 md:col-span-3 lg:col-span-3', render: () => <StatCard title="Active Cameras" value={stats.active_cameras} subtext="Operational" icon={Camera} trend="positive" /> },
        total_events: { group: 'videos', span: 'col-span-6 md:col-span-3 lg:col-span-3', render: () => <StatCard title="Last 24h" value={stats.events_24h || 0} subtext="Events Recorded" icon={Activity} /> },
        network_stats: { group: 'system', span: 'col-span-6 md:col-span-3 lg:col-span-3', render: () => <StatCard title="Network I/O" value={`${stats.network?.recv_mbps || 0} MB/s`} subtext={`Out: ${stats.network?.sent_mbps || 0} MB/s`} icon={Network} /> },
        db_stats: { group: 'system', span: 'col-span-6 md:col-span-3 lg:col-span-3', render: () => <StatCard title="Database" value={`${stats.database?.size_mb || 0} MB`} subtext={`${stats.database?.event_count || 0} Events`} icon={Database} /> },
        storage_used: {
            group: 'storage',
            span: 'col-span-6 md:col-span-3 lg:col-span-3',
            render: () => (
                <div className="p-6 rounded-xl bg-card border border-border hover:shadow-lg transition-shadow duration-300 group h-full relative flex flex-col justify-between">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground">Storage Used</h3>
                        <div className="rounded-full bg-primary/10 p-2 text-primary group-hover:scale-110 transition-transform">
                            <HardDrive className="w-5 h-5" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Physical Disk */}
                        <div>
                            <div className="flex justify-between items-end mb-1">
                                <span className="text-xs font-semibold text-muted-foreground">Physical Disk</span>
                                <span className="text-sm font-bold">{stats.storage.percent}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all" style={{ width: `${Math.min(100, stats.storage.percent)}%` }} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{stats.storage.used_gb}GB / {stats.storage.total_gb}GB</p>
                        </div>

                        {/* App Quota (if set) */}
                        {stats.storage.total_quota_gb > 0 && (
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">App Quota</span>
                                    <span className={`text-sm font-bold ${stats.storage.quota_percent > 90 ? 'text-red-500' : 'text-blue-500'}`}>
                                        {stats.storage.quota_percent}%
                                    </span>
                                </div>
                                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all ${stats.storage.quota_percent > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                                        style={{ width: `${Math.min(100, stats.storage.quota_percent)}%` }}
                                    />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 text-right">{stats.storage.used_gb}GB / {stats.storage.total_quota_gb}GB</p>
                            </div>
                        )}

                        {/* Fallback if no quota set, just to fill space or keep consistent layout? 
                            Maybe show 'Unlimited' text. */}
                        {(!stats.storage.total_quota_gb || stats.storage.total_quota_gb === 0) && (
                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <span className="text-xs font-semibold text-muted-foreground">App Quota</span>
                                    <span className="text-xs text-muted-foreground">Unlimited</span>
                                </div>
                                <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden opacity-20">
                                    <div className="h-full bg-muted" style={{ width: '100%' }} />
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )
        },
        cpu_usage: { group: 'system', span: 'col-span-6 md:col-span-3 lg:col-span-3', render: () => <StatCard title="CPU Usage" value={`${stats.resources?.cpu_percent || 0}%`} subtext={`Engine: ${stats.resources?.engine_cpu || 0}%`} icon={Cpu} /> },
        memory_usage: { group: 'system', span: 'col-span-6 md:col-span-3 lg:col-span-3', render: () => <StatCard title="Memory" value={`${Math.round(stats.resources?.memory_mb || 0)} MB`} subtext={`Engine: ${Math.round(stats.resources?.engine_mem_mb || 0)} MB`} icon={MemoryStick} /> },
        system_status: {
            group: 'system',
            span: 'col-span-6 md:col-span-3 lg:col-span-3',
            render: () => (
                <div className="p-6 rounded-xl bg-card border border-border hover:shadow-lg transition-shadow duration-300 group h-full relative">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-muted-foreground">System Status</h3>
                        <div className="rounded-full bg-primary/10 p-2 text-primary group-hover:scale-110 transition-transform">
                            <ShieldAlert className="w-5 h-5" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold">{stats.system_status}</p>
                    <div className="flex flex-col gap-1 mt-1">
                        <p className="text-xs text-green-500">Uptime: {stats.uptime}</p>
                        {stats.hw_accel && (
                            <div className="flex items-center gap-2 mt-2">
                                <span className={`text-[10px] px-2 py-0.5 rounded font-medium border ${stats.hw_accel.status === 'disabled'
                                        ? 'bg-muted text-muted-foreground border-border'
                                        : stats.hw_accel.status === 'active'
                                            ? 'bg-green-500/10 text-green-500 border-green-500/20'
                                            : stats.hw_accel.status === 'ready'
                                                ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                                                : 'bg-red-500/10 text-red-500 border-red-500/20'
                                    }`}>
                                    HW Accel: {
                                        stats.hw_accel.status === 'disabled'
                                            ? 'OFF'
                                            : `${stats.hw_accel.type.toUpperCase()} ${stats.hw_accel.status === 'active' ? '✓' :
                                                stats.hw_accel.status === 'ready' ? 'READY' :
                                                    'ERROR'
                                            }`
                                    }
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            )
        },

        resource_graph: {
            group: 'resourceGraph',
            span: 'col-span-12 h-64',
            render: () => (
                <div className="bg-card rounded-xl border border-border p-6 h-full">
                    <h3 className="text-lg font-semibold mb-4">Resource Usage (Last Hour)</h3>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={resourceHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                                <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis yAxisId="cpu" stroke="#3b82f6" fontSize={11} tickLine={false} axisLine={false} tickFormatter={value => `${value}%`} />
                                <YAxis yAxisId="mem" orientation="right" stroke="#10b981" fontSize={11} tickLine={false} axisLine={false} tickFormatter={value => `${value}G`} hide={isMobile} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--card-foreground))' }}
                                    itemStyle={{ color: 'hsl(var(--card-foreground))' }}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                                <Line yAxisId="cpu" name="CPU Usage %" type="monotone" dataKey="cpu" stroke="#3b82f6" strokeWidth={2} dot={false} />
                                <Line yAxisId="mem" name="Memory (MB)" type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )
        },

        network_graph: {
            group: 'networkGraph',
            span: 'col-span-12 h-64',
            render: () => (
                <div className="bg-card rounded-xl border border-border p-6 h-full">
                    <h3 className="text-lg font-semibold mb-4">Network Traffic(Last Hour)</h3>
                    <div className="h-[200px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={resourceHistory} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                                <XAxis dataKey="time" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis yAxisId="net" stroke="#ef4444" fontSize={11} tickLine={false} axisLine={false} tickFormatter={value => `${value}M`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--card-foreground))' }}
                                    itemStyle={{ color: 'hsl(var(--card-foreground))' }}
                                    formatter={(value, name) => [`${value} MB/s`, name]}
                                />
                                <Legend verticalAlign="bottom" height={36} />
                                <Line yAxisId="net" name="Network In" type="monotone" dataKey="network_in" stroke="#6366f1" strokeWidth={2} dot={false} />
                                <Line yAxisId="net" name="Network Out" type="monotone" dataKey="network_out" stroke="#ec4899" strokeWidth={2} dot={false} strokeDasharray="3 3" />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div >
            )
        },

        activity_graph: {
            group: 'activityGraph',
            span: 'col-span-12 lg:col-span-6 h-96',
            render: () => (
                <div className="bg-card rounded-xl border border-border p-6 h-full">
                    <h3 className="text-lg font-semibold mb-6">Activity (24h)</h3>
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
                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))' }} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                                <Area type="monotone" dataKey="events" stroke="#3b82f6" fillOpacity={1} fill="url(#colorEvents)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )
        },

        media_graph: {
            group: 'activityGraph',
            span: 'col-span-12 lg:col-span-6 h-96',
            render: () => (
                <div className="bg-card rounded-xl border border-border p-6 h-full">
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
                                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: 'hsl(var(--card))' }} />
                                <Bar dataKey="images" name="Images" fill="#10b981" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="videos" name="Videos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )
        },

        recent_events: {
            group: 'recentEvents',
            span: 'col-span-12 h-96',
            render: () => (
                <div className="bg-card rounded-xl border border-border p-6 h-full flex flex-col">
                    <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
                    <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                        {recentEvents.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">No recent events</p>
                        ) : (
                            recentEvents.map((evt) => (
                                <div
                                    key={evt.id}
                                    onClick={() => {
                                        const eventDate = new Date(evt.timestamp_start).toLocaleDateString('en-CA');
                                        navigate(`/timeline?event_id=${evt.id}&date=${eventDate}`);
                                    }}
                                    className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group"
                                >
                                    <div className={`w-2 h-2 rounded-full ${evt.type === 'video' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                    <div className="overflow-hidden flex-1">
                                        <div className="flex justify-between">
                                            <p className="text-sm font-semibold truncate">{getCameraName(evt.camera_id)}</p>
                                            <span className="text-xs text-muted-foreground">{new Date(evt.timestamp_start).toLocaleTimeString()}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground capitalize">{evt.type} Event</p>
                                    </div>
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${evt.type === 'video' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
                                        {evt.type === 'video' ? 'VID' : 'IMG'}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                    <p className="text-muted-foreground mt-2">Drag widgets to reorder. Configure visibility in settings.</p>
                </div>
                <button
                    onClick={() => setShowWidgetModal(true)}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                >
                    <Settings className="w-5 h-5 text-muted-foreground" />
                </button>
            </div>

            {/* Widgets Config Modal - Simplified to toggle Groups */}
            {showWidgetModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold mb-4">Dashboard Widgets</h3>
                        <div className="space-y-3 mb-6">
                            {Object.entries({
                                videos: 'Event Stats',
                                storage: 'Storage Stats',
                                system: 'System Stats',
                                activityGraph: 'Activity Graphs',
                                resourceGraph: 'Resource Graph',
                                networkGraph: 'Network Graph',
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

            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
            >
                <SortableContext
                    items={widgetOrder}
                    strategy={rectSortingStrategy}
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
                        {widgetOrder.filter(id => {
                            const conf = WIDGET_REGISTRY[id];
                            return conf && visibleWidgets[conf.group] !== false;
                        }).map(id => (
                            <SortableWidget
                                key={id}
                                id={id}
                                span={WIDGET_REGISTRY[id].span}
                            >
                                {WIDGET_REGISTRY[id].render()}
                            </SortableWidget>
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </div>
    );
};
