import React from 'react';
import { Loader2, ShieldCheck, RefreshCw, Database, Cpu, AlertCircle, CheckCircle2, RotateCcw, Server } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const SystemInitializing = () => {
    const { healthDetails, checkBackendHealth } = useAuth();
    const [retrying, setRetrying] = React.useState(false);

    const handleRetry = async () => {
        setRetrying(true);
        await checkBackendHealth();
        setTimeout(() => setRetrying(false), 500);
    };

    const components = healthDetails?.components || {
        backend: "checking...",
        database: "waiting...",
        engine: "waiting..."
    };

    const StatusItem = ({ name, status, icon: Icon }) => {
        const isOk = status === 'ok';
        const isError = status.includes('error') || status.includes('unreachable') || status.includes('lost');

        return (
            <div className="flex items-center justify-between p-3 bg-background/50 rounded-xl border border-border/50">
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isOk ? 'bg-green-500/10 text-green-500' : isError ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                        <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium capitalize">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                    {isOk ? (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : isError ? (
                        <AlertCircle className="w-4 h-4 text-destructive" />
                    ) : (
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                    <span className={`text-xs font-semibold ${isOk ? 'text-green-500' : isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {isOk ? 'READY' : isError ? 'ERROR' : 'PENDING'}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="max-w-md w-full text-center space-y-8 animate-in fade-in zoom-in-95">
                <div className="flex justify-center">
                    <div className="relative">
                        <div className="absolute inset-0 animate-ping bg-primary/20 rounded-full" />
                        <div className="relative bg-primary/10 p-4 rounded-full">
                            <ShieldCheck className="w-12 h-12 text-primary" />
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <h1 className="text-2xl font-bold tracking-tight">VibeNVR is starting up</h1>
                    <p className="text-muted-foreground leading-relaxed">
                        We are waiting for all system components to initialize. This usually takes less than a minute.
                    </p>
                </div>

                <div className="bg-muted/50 p-6 rounded-2xl space-y-4 shadow-inner">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-3 text-sm font-semibold">
                            <Loader2 className={`w-4 h-4 animate-spin ${retrying ? 'text-primary' : 'text-muted-foreground opacity-50'}`} />
                            <span>System Status</span>
                        </div>
                        {healthDetails?.status === 'error' && (
                            <span className="text-[10px] bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                Recovery in progress
                            </span>
                        )}
                    </div>

                    <div className="grid gap-2">
                        <StatusItem name="VibeAPI" status={components.backend || 'ok'} icon={Server} />
                        <StatusItem name="Database" status={components.database} icon={Database} />
                        <StatusItem name="Engine" status={components.engine} icon={Cpu} />
                    </div>

                    <div className="pt-2">
                        <button
                            onClick={handleRetry}
                            disabled={retrying}
                            className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 group"
                        >
                            <RotateCcw className={`w-4 h-4 ${retrying ? 'animate-spin' : 'group-hover:-rotate-180 transition-transform duration-500'}`} />
                            {retrying ? 'Retrying...' : 'Retry Now'}
                        </button>
                    </div>
                </div>

                <div className="pt-4 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                        <RefreshCw className="w-3 h-3" />
                        Auto-refresh active
                    </div>
                </div>
            </div>
        </div>
    );
};
