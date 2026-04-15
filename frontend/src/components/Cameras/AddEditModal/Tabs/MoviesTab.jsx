import React from 'react';
import { Film, Trash2 } from 'lucide-react';
import { Toggle, SelectField, Slider, InputField, SectionHeader } from '../../../ui/FormControls';
import { Button } from '../../../ui/Button';

export const MoviesTab = ({ editingId, newCamera, setNewCamera, stats, handleCleanup }) => {
    const hasPrivacyMasks = (() => {
        try {
            const masks = typeof newCamera.privacy_masks === 'string'
                ? JSON.parse(newCamera.privacy_masks)
                : newCamera.privacy_masks;
            return Array.isArray(masks) && masks.length > 0;
        } catch (e) {
            return false;
        }
    })();

    return (
        <div className="space-y-6">
            <SectionHeader title="Recording Settings" description="Configure video recording options" />
            <SelectField
                label="Recording Mode"
                value={newCamera.recording_mode}
                onChange={(val) => setNewCamera({ ...newCamera, recording_mode: val })}
                options={[
                    { value: 'Motion Triggered', label: 'Motion Triggered' },
                    { value: 'Continuous', label: 'Continuous' },
                    { value: 'Off', label: 'Off' }
                ]}
            />
            <div className={`p-3 rounded-lg text-xs mb-4 transition-all duration-300 ${
                hasPrivacyMasks 
                    ? 'bg-muted/50 border border-border opacity-80' 
                    : 'bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/50'
            }`}>
                <Toggle
                    label="Passthrough Recording (CPU Saver)"
                    checked={hasPrivacyMasks ? false : !!newCamera.movie_passthrough}
                    onChange={(val) => setNewCamera({ ...newCamera, movie_passthrough: val })}
                    disabled={hasPrivacyMasks}
                />
                <p className="mt-1 text-muted-foreground ml-1">
                    {hasPrivacyMasks ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5 mt-2">
                             Privacy Masks Active: The NVR must re-encode the video to permanently burn the masks into recordings. Passthrough is disabled.
                        </span>
                    ) : (
                        <>
                            Directly saves the video stream without re-encoding. <br />
                            <span className="font-semibold text-green-600 dark:text-green-400">Pros:</span> Near-zero CPU usage, original quality. <br />
                            <span className="font-semibold text-red-600 dark:text-red-400">Cons:</span> No Text Overylays, potential start delay, MP4 container only.
                        </>
                    )}
                </p>
            </div>
            <Slider
                label="Movie Quality"
                value={newCamera.movie_quality}
                onChange={(val) => setNewCamera({ ...newCamera, movie_quality: val })}
                min={10}
                max={100}
                step={5}
                unit="%"
                marks={['10%', '25%', '50%', '75%', '100%']}
            />
            <Slider
                label="Maximum Movie Length"
                value={newCamera.max_movie_length || 120}
                onChange={(val) => setNewCamera({ ...newCamera, max_movie_length: val })}
                min={60}
                max={300}
                step={30}
                unit=" sec"
                marks={['1m', '2m', '3m', '4m', '5m']}
                help="Recording segments will be split at this length"
            />
            <SectionHeader title="File Naming" />
            <InputField
                label="Movie File Name"
                value={newCamera.movie_file_name}
                onChange={(val) => setNewCamera({ ...newCamera, movie_file_name: val })}
                placeholder="%Y-%m-%d/%H-%M-%S"
            />
            <SelectField
                label="Preserve Movies"
                value={newCamera.preserve_movies}
                onChange={(val) => setNewCamera({ ...newCamera, preserve_movies: val })}
                options={[
                    { value: 'Forever', label: 'Forever' },
                    { value: 'For One Month', label: 'For One Month' },
                    { value: 'For One Week', label: 'For One Week' },
                    { value: 'For One Day', label: 'For One Day' }
                ]}
            />
            <SectionHeader title="Storage Limit" description="Auto-delete old files when limit is reached" />
            {stats?.details?.cameras?.[editingId] && (
                <div className="mb-6 p-4 bg-muted/30 rounded-lg border border-border">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                            <div className="p-1.5 bg-blue-500/10 rounded text-blue-500">
                                <Film className="w-4 h-4" />
                            </div>
                            <span className="font-semibold text-sm">Movies Storage</span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleCleanup(editingId, 'video')}
                            className="h-7 text-[10px] px-2 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-900/50"
                        >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Clean Up
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                            <p className="text-xs text-muted-foreground">Disk Usage</p>
                            <p className="text-lg font-bold">{stats.details.cameras[editingId].movies.size_gb} GB</p>
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Total Files</p>
                            <p className="text-lg font-bold">{stats.details.cameras[editingId].movies.count}</p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                                {newCamera.max_storage_gb > 0
                                    ? `${Math.round((stats.details.cameras[editingId].movies.size_gb / newCamera.max_storage_gb) * 100)}% Used`
                                    : 'Unlimited Storage'}
                            </span>
                            <span className="text-muted-foreground">
                                Limit: {newCamera.max_storage_gb > 0 ? `${newCamera.max_storage_gb} GB` : 'None'}
                            </span>
                        </div>
                        <div className="h-2 w-full bg-secondary/50 rounded-full overflow-hidden">
                            <div
                                className={`h-full ${newCamera.max_storage_gb > 0 && stats.details.cameras[editingId].movies.size_gb > newCamera.max_storage_gb ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{
                                    width: newCamera.max_storage_gb > 0
                                        ? `${Math.min((stats.details.cameras[editingId].movies.size_gb / newCamera.max_storage_gb) * 100, 100)}%`
                                        : '0%'
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}
            <InputField
                label="Maximum Storage (GB)"
                type="number"
                value={newCamera.max_storage_gb || 0}
                onChange={(val) => setNewCamera({ ...newCamera, max_storage_gb: val })}
                unit="GB"
                placeholder="0 = unlimited"
            />
            <p className="text-xs text-muted-foreground">Set to 0 for unlimited storage. When exceeded, oldest files are deleted.</p>
        </div>
    );
};
