
import React from 'react'

export default function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={`animate-pulse rounded-md bg-white/5 ${className}`}
            {...props}
        />
    )
}
