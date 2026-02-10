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

    // Construct media URL with token if needed (handled by backend auth usually, but for images we might need a token param if using img tag directly on protected endpoint)
    // However, the Context in App.jsx usually handles Auth header for fetch.
    // For <img> tags, we need to append the token to the URL if the endpoint is protected.
    // Looking at main.py, /media/ endpoints need ?token=XYZ

    const token = localStorage.getItem('vibe_token');
    const avatarUrl = user?.avatar_path
        ? `/api/media/${user.avatar_path}?token=${token}`
        : null;

    if (avatarUrl) {
        return (
            <img
                src={avatarUrl}
                alt={user?.username}
                className={`${sizeClasses[size] || sizeClasses.md} rounded-full object-cover border border-border ${className} cursor-pointer`}
                onClick={onClick}
                onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
            />
        );
    }

    return (
        <div
            className={`${sizeClasses[size] || sizeClasses.md} rounded-full ${bgColor} text-white flex items-center justify-center font-bold border border-white/10 shadow-sm ${className} cursor-pointer`}
            onClick={onClick}
        >
            {initial}
        </div>
    );
};
