import React, { useState, useEffect } from 'react';
import { Activity, Camera, HardDrive, ShieldAlert, Film, Image } from 'lucide-react';

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
    const [stats, setStats] = useState({
        active_cameras: 0,
        total_events: 0,
        video_count: 0,
        picture_count: 0,
        storage: { total_gb: 0, used_gb: 0, free_gb: 0, percent: 0 },
        system_status: 'Unknown',
        uptime: '0m'
    });
    const [recentEvents, setRecentEvents] = useState([]);
    const [cameraMap, setCameraMap] = useState({});

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch('http://localhost:5000/stats/');
                if (res.ok) setStats(await res.json());
            } catch (err) {
                console.error("Failed to fetch stats", err);
            }
        };

        const fetchEvents = async () => {
            try {
                const res = await fetch('http://localhost:5000/events/?limit=5');
                if (res.ok) setRecentEvents(await res.json());
            } catch (err) {
                console.error("Failed to fetch events", err);
            }
        };

        const fetchCameras = async () => {
            try {
                const res = await fetch('http://localhost:5000/cameras/');
                if (res.ok) {
                    const data = await res.json();
                    const map = data.reduce((acc, cam) => ({ ...acc, [cam.id]: cam.name }), {});
                    setCameraMap(map);
                }
            } catch (err) {
                console.error("Failed to fetch cameras", err);
            }
        };

        fetchStats();
        fetchEvents();
        fetchCameras();
        const interval = setInterval(() => {
            fetchStats();
            fetchEvents();
        }, 30000); // Refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const getCameraName = (id) => cameraMap[id] || `Camera ${id}`;

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
                <p className="text-muted-foreground mt-2">System overview and status.</p>
            </div>

            {stats.details && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                <StatCard
                    title="Active Cameras"
                    value={stats.active_cameras}
                    subtext="All systems operational"
                    icon={Camera}
                    trend="positive"
                />
                <StatCard
                    title="Motion Events"
                    value={stats.total_events}
                    subtext="Total events recorded"
                    icon={Activity}
                />
                <StatCard
                    title="Videos"
                    value={stats.video_count}
                    subtext="Recorded clips"
                    icon={Film}
                />
                <StatCard
                    title="Pictures"
                    value={stats.picture_count}
                    subtext="Captured snapshots"
                    icon={Image}
                />
                <StatCard
                    title="Storage Used"
                    value={`${stats.storage.percent}%`}
                    subtext={`${stats.storage.used_gb}GB / ${stats.storage.total_gb}GB`}
                    icon={HardDrive}
                />
                <StatCard
                    title="System Status"
                    value={stats.system_status}
                    subtext={`Uptime: ${stats.uptime}`}
                    icon={ShieldAlert}
                    trend="positive"
                />
            </div>

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
        </div>
    );
};
