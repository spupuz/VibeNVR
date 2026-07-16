import React, { useState, useRef, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, Eye, EyeOff } from 'lucide-react';

// Portal Tooltip Component (Immune to overflow clipping)
export const Tooltip = ({ text, children }) => {
    const [show, setShow] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0, transform: '-translate-x-1/2 -translate-y-full' });
    const triggerRef = useRef(null);

    const updateCoords = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            let left = rect.left + rect.width / 2;
            let transform = '-translate-x-1/2 -translate-y-full';

            // Smart positioning to prevent screen edge clipping on mobile
            if (window.innerWidth - rect.right < 140) {
                left = rect.right; // Anchor to right edge of icon
                transform = '-translate-x-full -translate-y-full';
            } else if (rect.left < 140) {
                left = rect.left; // Anchor to left edge of icon
                transform = '-translate-y-full';
            }

            setCoords({
                left,
                top: rect.top - 8,
                transform
            });
        }
    };

    return (
        <div className="relative inline-flex items-center">
            {children}
            <button
                ref={triggerRef}
                type="button"
                aria-label="Show help"
                aria-expanded={show}
                onMouseEnter={() => { updateCoords(); setShow(true); }}
                onMouseLeave={() => setShow(false)}
                onClick={() => { updateCoords(); setShow(!show); }}
                className="ml-2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
            >
                <HelpCircle className="w-4 h-4" />
            </button>
            {show && createPortal(
                <div 
                    className={`fixed z-[9999] px-3 py-2 text-xs bg-popover text-popover-foreground border border-border rounded-lg shadow-lg w-max max-w-[250px] whitespace-normal break-words pointer-events-none ${coords.transform}`}
                    style={{ left: coords.left, top: coords.top }}
                >
                    {text}
                </div>,
                document.body
            )}
        </div>
    );
};

// Label with Tooltip
const LabelWithHelp = ({ label, help, htmlFor }) => {
    const LabelComponent = htmlFor ? 'label' : 'span';
    const props = htmlFor ? { htmlFor, className: "text-sm font-medium cursor-pointer" } : { className: "text-sm font-medium" };

    return help ? (
        <Tooltip text={help}>
            <LabelComponent {...props}>{label}</LabelComponent>
        </Tooltip>
    ) : (
        <LabelComponent {...props}>{label}</LabelComponent>
    );
};

// Toggle Switch Component (like motionEye)
export const Toggle = ({ checked, onChange, label, disabled = false, help = '', id: externalId }) => {
    const generatedId = useId();
    const id = externalId || generatedId;
    return (
        <div className="flex items-center justify-between gap-3">
            <LabelWithHelp label={label} help={help} htmlFor={id} />
            <button
                id={id}
                type="button"
                role="switch"
                aria-checked={checked}
                aria-label={label || 'Toggle'}
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
};

// Slider Component (like motionEye)
export const Slider = ({ value, onChange, min = 0, max = 100, step = 1, label, unit = '', showValue = true, marks = [], help = '', id: externalId }) => {
    const generatedId = useId();
    const id = externalId || generatedId;
    const percentage = ((value - min) / (max - min)) * 100;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <LabelWithHelp label={label} help={help} htmlFor={id} />
                {showValue && (
                    <span className="text-sm text-muted-foreground">
                        {value}{unit}
                    </span>
                )}
            </div>
            <div className="relative">
                <input
                    id={id}
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
export const InputField = ({ value, onChange, label, type = 'text', placeholder = '', unit = '', className = '', help = '', showPasswordToggle = false, icon: Icon = null, id: externalId }) => {
    const generatedId = useId();
    const id = externalId || generatedId;
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === 'password';
    const actualType = isPassword && showPassword ? 'text' : type;

    return (
        <div className={className}>
            <div className="block mb-1">
                <LabelWithHelp label={label} help={help} htmlFor={id} />
            </div>
            <div className="relative">
                {Icon && (
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-primary">
                        <Icon className="w-4 h-4" />
                    </div>
                )}
                <input
                    id={id}
                    type={actualType}
                    value={value || ''}
                    onChange={(e) => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                    placeholder={placeholder}
                    className={`w-full bg-background border border-input rounded-lg ${Icon ? 'pl-10' : 'px-3'} py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all`}
                />
                {unit && !isPassword && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {unit}
                    </span>
                )}
                {isPassword && showPasswordToggle && (
                    <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors focus:outline-none"
                    >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                )}
            </div>
        </div>
    );
};

// Select Field Component
export const SelectField = ({ value, onChange, label, options = [], className = '', help = '', id: externalId }) => {
    const generatedId = useId();
    const id = externalId || generatedId;
    return (
        <div className={className}>
            <div className="block mb-1">
                <LabelWithHelp label={label} help={help} htmlFor={id} />
            </div>
            <select
                id={id}
                value={value || ''}
                onChange={(e) => onChange(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-primary focus:border-transparent transition-all cursor-pointer"
            >
                {options.map((opt, i) => (
                    <option
                        key={i}
                        value={typeof opt === 'string' ? opt : opt.value}
                        disabled={typeof opt === 'object' && opt.disabled}
                    >
                        {typeof opt === 'string' ? opt : opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
};

// Section Header Component
export const SectionHeader = ({ title, description }) => (
    <div className="border-b border-border pb-3 mb-4">
        <h4 className="text-sm font-semibold text-primary">{title}</h4>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
    </div>
);
