import React, { useMemo } from 'react';

const getColorFromString = (str) => {
    if (!str) return 'bg-gray-500';

    const colors = [
        'bg-red-500', 'bg-orange-500', 'bg-amber-500',
        'bg-yellow-500', 'bg-lime-500', 'bg-green-500',
        'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
        'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
        'bg-violet-500', 'bg-purple-500', 'bg-fuchsia-500',
        'bg-pink-500', 'bg-rose-500'
    ];

    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
};

export const Avatar = ({ user, className = "", size = "md", onClick }) => {
    const [hasError, setHasError] = React.useState(false);
    
    const handleKeyDown = (e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick(e);
        }
    };

    // Sizes: sm, md, lg, xl, 2xl
    const sizeClasses = {
        xs: "w-6 h-6 text-xs",
        sm: "w-8 h-8 text-xs",
        md: "w-10 h-10 text-sm",
        lg: "w-16 h-16 text-lg",
        xl: "w-24 h-24 text-2xl",
        "2xl": "w-32 h-32 text-4xl"
    };

    const bgColor = useMemo(() => getColorFromString(user?.username), [user?.username]);
    const initial = user?.username ? user.username[0].toUpperCase() : '?';

    const avatarUrl = !hasError && user?.avatar_path
        ? `/api/media/${user.avatar_path}?v=${encodeURIComponent(user.avatar_path)}`
        : null;

    return (
        <div 
            className={`relative inline-block ${sizeClasses[size] || sizeClasses.md} border border-border rounded-full overflow-hidden ${className} ${onClick ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2' : ''}`}
            onClick={onClick}
            onKeyDown={onClick ? handleKeyDown : undefined}
            role={onClick ? "button" : undefined}
            tabIndex={onClick ? 0 : undefined}
            aria-label={onClick ? (user?.username ? `Avatar for ${user.username}` : 'User avatar') : undefined}
        >
            {avatarUrl ? (
                <img
                    src={avatarUrl}
                    alt={user?.username}
                    className="w-full h-full object-cover"
                    onError={() => setHasError(true)}
                />
            ) : (
                <div className={`w-full h-full ${bgColor} text-white flex items-center justify-center font-bold shadow-sm`}>
                    {initial}
                </div>
            )}
        </div>
    );
};
