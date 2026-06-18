import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal } from 'lucide-react';
import { CameraCard } from './CameraCard';
import { useTranslation } from 'react-i18next';

// ⚡ Bolt Optimization:
// Wrapped in React.memo alongside CameraCard to ensure the Sortable wrapper
// also avoids redundant renders when unrelated items in the grid are reordered.
// Impact: Prevents O(n) component updates when a single item is dragged.
export const SortableCameraCard = memo(function SortableCameraCard(props) {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: props.camera.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative'
    };

    return (
        <div ref={setNodeRef} style={style} className={`relative ${isDragging ? 'ring-2 ring-primary rounded-xl' : ''}`}>
            {/* Drag Handle Overlay */}
            {props.isSortable && (
                <div 
                    {...attributes} 
                    {...listeners} 
                    className="absolute top-1 left-1/2 -translate-x-1/2 z-20 p-0.5 px-3 bg-background/40 hover:bg-background/80 rounded-full text-muted-foreground/70 hover:text-foreground cursor-grab active:cursor-grabbing backdrop-blur-md transition-colors border border-border/50 shadow-sm opacity-50 hover:opacity-100"
                    title={t('dragToReorder', 'Drag to reorder')}
                >
                    <GripHorizontal className="w-4 h-4" />
                </div>
            )}
            
            <div className={props.isSortable ? 'pt-3' : ''}>
                <CameraCard {...props} />
            </div>
        </div>
    );
});
