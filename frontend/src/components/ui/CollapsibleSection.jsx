import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const CollapsibleSection = ({ title, description, icon, isOpen, onToggle, children, id }) => {
    return (
        <div className="bg-card border border-border rounded-xl overflow-hidden transition-all duration-300 shadow-sm hover:shadow-md">
            <button
                onClick={() => onToggle(id)}
                className={`w-full flex items-center justify-between p-4 sm:p-6 text-left transition-colors duration-200 ${isOpen ? 'bg-muted/30' : 'hover:bg-muted/10'}`}
            >
                <div className="flex items-center space-x-4 min-w-0 flex-1 mr-2">
                    {icon && (
                        <div className={`p-2.5 rounded-xl shrink-0 ${isOpen ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {React.cloneElement(icon, { size: 24 })}
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-base sm:text-lg leading-tight whitespace-normal">{title}</h3>
                        {description && <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-3 sm:line-clamp-1 opacity-80">{description}</p>}
                    </div>
                </div>
                <div className="p-2.5 rounded-full hover:bg-muted/50 transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center">
                    {isOpen ? <ChevronUp className="w-6 h-6 text-muted-foreground" /> : <ChevronDown className="w-6 h-6 text-muted-foreground" />}
                </div>
            </button>

            <div
                className={`transition-all duration-300 ease-in-out origin-top overflow-hidden ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
                <div className="p-4 sm:p-8 border-t border-border/40">
                    {children}
                </div>
            </div>
        </div>
    );
};
