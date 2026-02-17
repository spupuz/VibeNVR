import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const CollapsibleSection = ({ title, description, icon, isOpen, onToggle, children, id }) => {
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md">
            <button
                onClick={() => onToggle(id)}
                className={`w-full flex items-center justify-between p-3 sm:p-6 text-left transition-colors duration-200 ${isOpen ? 'bg-muted/30' : 'hover:bg-muted/10'}`}
            >
                <div className="flex items-center space-x-3 min-w-0 flex-1 mr-2">
                    {icon && (
                        <div className={`p-2 rounded-lg shrink-0 ${isOpen ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {icon}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-base sm:text-lg leading-tight whitespace-normal">{title}</h3>
                        {description && <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-3 sm:line-clamp-1">{description}</p>}
                    </div>
                </div>
                <div className="p-1 rounded-full hover:bg-muted/50 transition-colors shrink-0">
                    {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
            </button>

            <div
                className={`transition-all duration-300 ease-in-out origin-top overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="p-3 sm:p-6 border-t border-border/50">
                    {children}
                </div>
            </div>
        </div>
    );
};
