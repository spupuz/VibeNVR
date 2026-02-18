import React from 'react';

export const Button = ({ children, className = '', variant = 'primary', size = 'default', ...props }) => {
    const baseStyles = "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

    const variants = {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline"
    };

    const sizes = {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
    };

    // Fallback to primary/default if invalid prop is passed (though usually handled by default params)
    const variantStyle = variants[variant] || variants.primary;
    const sizeStyle = sizes[size] || sizes.default;

    return (
        <button
            className={`${baseStyles} ${variantStyle} ${sizeStyle} ${className}`}
            {...props}
        >
            {children}
        </button>
    );
};
