/**
 * Loading-placeholder primitives. `<Skeleton />` is the generic block;
 * `<StatCardSkeleton />`, `<RouteFallbackSkeleton />` etc. compose it into
 * matched shapes for specific surfaces (so the layout doesn't jump when
 * real content lands). Theme-aware via the `.ui-skeleton` utility.
 */
import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
}

const roundedClass = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  full: "rounded-full",
} as const;

export function Skeleton({
  className = "",
  width,
  height,
  rounded = "md",
}: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (width !== undefined)
    style.width = typeof width === "number" ? `${width}px` : width;
  if (height !== undefined)
    style.height = typeof height === "number" ? `${height}px` : height;
  return (
    <div
      className={`ui-skeleton ${roundedClass[rounded]} ${className}`}
      style={style}
      aria-hidden="true"
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="ui-card rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div className="space-y-3 flex-1">
          <Skeleton height={14} width="60%" />
          <Skeleton height={28} width="40%" />
        </div>
        <Skeleton width={48} height={48} rounded="full" />
      </div>
    </div>
  );
}

export function DashboardStatsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {Array.from({ length: cards }, (_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function RouteFallbackSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      className="space-y-6"
    >
      <div className="space-y-2">
        <Skeleton height={32} width="35%" />
        <Skeleton height={16} width="55%" />
      </div>
      <DashboardStatsSkeleton cards={4} />
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} height={56} />
        ))}
      </div>
    </div>
  );
}
