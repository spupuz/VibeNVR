import React, { useMemo } from 'react';

/**
 * Vertical Hour Timeline Component with motion indicators
 * @param {Object} props
 * @param {Array} props.events - List of events to display
 * @param {Function} props.onHourClick - Handler for clicking an hour
 * @param {Number} props.selectedHour - Currently selected hour
 */
export const HourTimeline = ({ events, onHourClick, selectedHour }) => {
    const hours = Array.from({ length: 24 }, (_, i) => 23 - i); // Newest at top

    // Count events per hour
    const eventsByHour = useMemo(() => {
        const counts = {};
        events.forEach(event => {
            const hour = new Date(event.timestamp_start).getHours();
            counts[hour] = (counts[hour] || 0) + 1;
        });
        return counts;
    }, [events]);

    const maxEvents = Math.max(...Object.values(eventsByHour), 1);
    const currentHour = new Date().getHours();

    return (
        <div className="w-16 flex-shrink-0 flex flex-col sticky top-0 z-20 h-[calc(100dvh-53px)] lg:h-dvh">
            <div className="text-[9px] text-muted-foreground mb-1 font-medium text-center">24h</div>
            <div className="flex-1 flex flex-col gap-px">
                {hours.map(hour => {
                    const count = eventsByHour[hour] || 0;
                    const width = count > 0 ? Math.max((count / maxEvents) * 100, 20) : 0;
                    const isSelected = selectedHour === hour;
                    const isCurrent = hour === currentHour;

                    return (
                        <div
                            key={hour}
                            className={`flex items-center cursor-pointer group flex-1 min-h-0 ${isCurrent ? 'bg-primary/5' : ''}`}
                            onClick={() => onHourClick(hour)}
                        >
                            <span className={`text-[8px] w-5 text-right mr-1 ${isCurrent ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                                {hour.toString().padStart(2, '0')}
                            </span>
                            <div className="flex-1 h-2 bg-muted/20 rounded-r relative">
                                {count > 0 && (
                                    <div
                                        className={`absolute left-0 top-0 h-full rounded-r transition-all ${isSelected ? 'bg-red-500' : 'bg-red-400/70 group-hover:bg-red-500'
                                            }`}
                                        style={{ width: `${width}%` }}
                                    />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
