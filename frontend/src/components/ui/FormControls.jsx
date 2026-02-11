import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

// Tooltip Component
export const Tooltip = ({ text, children }) => {
    const [show, setShow] = useState(false);

    return (
        <div className="relative inline-flex items-center">
            {children}
            <button
                type="button"
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
                onClick={() => setShow(!show)}
                className="ml-2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
            >
                <HelpCircle className="w-4 h-4" />
            </button>
            {show && (
                <div className="absolute left-full ml-2 z-[160] px-3 py-2 text-xs bg-popover text-popover-foreground border border-border rounded-lg shadow-lg max-w-xs whitespace-normal">
                    {text}
                </div>
            )}
        </div>
    );
};

// Label with Tooltip
const LabelWithHelp = ({ label, help }) => (
    help ? (
        <Tooltip text={help}>
            <span className="text-sm font-medium">{label}</span>
        </Tooltip>
    ) : (
        <span className="text-sm font-medium">{label}</span>
    )
);

// Toggle Switch Component (like motionEye)
export const Toggle = ({ checked, onChange, label, disabled = false, help = '' }) => (
    <div className="flex items-center justify-between gap-3">
        <LabelWithHelp label={label} help={help} />
        <button
            type="button"
            onClick={() => !disabled && onChange(!checked)}
            disabled={disabled}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                } ${checked ? 'bg-primary' : 'bg-muted'}`}
        >
            <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'
                    }`}
            />
        </button>
    </div>
);

// Slider Component (like motionEye)
export const Slider = ({ value, onChange, min = 0, max = 100, step = 1, label, unit = '', showValue = true, marks = [], help = '' }) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <LabelWithHelp label={label} help={help} />
                {showValue && (
                    <span className="text-sm text-muted-foreground">
                        {value}{unit}
                    </span>
                )}
            </div>
            <div className="relative">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => onChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer slider-thumb"
                    style={{
                        background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${percentage}%, hsl(var(--muted)) ${percentage}%, hsl(var(--muted)) 100%)`
                    }}
                />
                {marks.length > 0 && (
                    <div className="flex justify-between mt-1">
                        {marks.map((mark, i) => (
                            <span key={i} className="text-xs text-muted-foreground">{mark}</span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// Input Field Component
export const InputField = ({ value, onChange, label, type = 'text', placeholder = '', unit = '', className = '', help = '' }) => (
    <div className={className}>
        <div className="block mb-1">
            <LabelWithHelp label={label} help={help} />
        </div>
        <div className="relative">
            <input
                type={type}
                value={value || ''}
                onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                placeholder={placeholder}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
            {unit && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {unit}
                </span>
            )}
        </div>
    </div>
);

// Select Field Component
export const SelectField = ({ value, onChange, label, options = [], className = '', help = '' }) => (
    <div className={className}>
        <div className="block mb-1">
            <LabelWithHelp label={label} help={help} />
        </div>
        <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all cursor-pointer"
        >
            {options.map((opt, i) => (
                <option key={i} value={typeof opt === 'string' ? opt : opt.value}>
                    {typeof opt === 'string' ? opt : opt.label}
                </option>
            ))}
        </select>
    </div>
);

// Section Header Component
export const SectionHeader = ({ title, description }) => (
    <div className="border-b border-border pb-3 mb-4">
        <h4 className="text-sm font-semibold text-primary">{title}</h4>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
);
