import React from 'react';

export interface SkeletonProps {
  variant?: 'card' | 'stat' | 'table-row' | 'list-item' | 'profile-card' | 'chart';
  count?: number;
  className?: string;
}

export function SkeletonCircle({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={`rounded-full bg-slate-800/80 animate-pulse shrink-0 ${className}`}
    />
  );
}

export function SkeletonBar({ width = 'w-full', height = 'h-3.5', className = '' }: { width?: string; height?: string; className?: string }) {
  return (
    <div
      className={`${height} ${width} rounded-md bg-slate-800/80 animate-pulse ${className}`}
    />
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 space-y-4 ${className}`}>
      <div className="flex items-center gap-3">
        <SkeletonCircle size={40} />
        <div className="space-y-2 flex-1">
          <SkeletonBar width="w-2/3" height="h-4" />
          <SkeletonBar width="w-1/3" height="h-3" />
        </div>
      </div>
      <div className="space-y-2 pt-2">
        <SkeletonBar width="w-full" height="h-3" />
        <SkeletonBar width="w-4/5" height="h-3" />
      </div>
      <div className="flex justify-between items-center pt-2">
        <SkeletonBar width="w-20" height="h-3" />
        <SkeletonBar width="w-16" height="h-6" className="rounded-full" />
      </div>
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 space-y-3">
      <div className="flex justify-between items-start">
        <div className="space-y-2 flex-1">
          <SkeletonBar width="w-24" height="h-3" />
          <SkeletonBar width="w-16" height="h-7" />
        </div>
        <SkeletonCircle size={32} />
      </div>
      <SkeletonBar width="w-32" height="h-3" />
    </div>
  );
}

export function SkeletonTableRow() {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-900/40 border-b border-slate-800/60 gap-4">
      <div className="flex items-center gap-3 min-w-[200px] flex-1">
        <SkeletonCircle size={32} />
        <div className="space-y-1.5 flex-1">
          <SkeletonBar width="w-2/3" height="h-3.5" />
          <SkeletonBar width="w-1/3" height="h-2.5" />
        </div>
      </div>
      <SkeletonBar width="w-20" height="h-3" className="hidden sm:block" />
      <SkeletonBar width="w-24" height="h-3" className="hidden md:block" />
      <SkeletonBar width="w-16" height="h-5" className="rounded-full" />
    </div>
  );
}

export function SkeletonListItem() {
  return (
    <div className="flex items-center justify-between p-3.5 bg-slate-900/40 border border-slate-800/70 rounded-xl gap-3">
      <div className="flex items-center gap-3 flex-1">
        <SkeletonCircle size={32} />
        <div className="space-y-1.5 flex-1">
          <SkeletonBar width="w-1/2" height="h-3.5" />
          <SkeletonBar width="w-1/4" height="h-2.5" />
        </div>
      </div>
      <SkeletonBar width="w-12" height="h-6" className="rounded-full" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-5 space-y-4">
      <div className="flex justify-between items-center">
        <SkeletonBar width="w-40" height="h-4" />
        <SkeletonBar width="w-20" height="h-3" />
      </div>
      <div className="h-64 flex items-end gap-3 pt-6 pb-2">
        <SkeletonBar width="w-full" height="h-1/3" />
        <SkeletonBar width="w-full" height="h-2/3" />
        <SkeletonBar width="w-full" height="h-1/2" />
        <SkeletonBar width="w-full" height="h-3/4" />
        <SkeletonBar width="w-full" height="h-2/5" />
        <SkeletonBar width="w-full" height="h-4/5" />
      </div>
    </div>
  );
}

export default function Skeleton({ variant = 'card', count = 1, className = '' }: SkeletonProps) {
  const items = Array.from({ length: count });

  return (
    <div className={className}>
      {variant === 'card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((_, i) => (
            <div key={i}>
              <SkeletonCard />
            </div>
          ))}
        </div>
      )}

      {variant === 'stat' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {items.map((_, i) => (
            <SkeletonStatCard key={i} />
          ))}
        </div>
      )}

      {variant === 'table-row' && (
        <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800/80 bg-slate-900/40 overflow-hidden">
          {items.map((_, i) => (
            <SkeletonTableRow key={i} />
          ))}
        </div>
      )}

      {variant === 'list-item' && (
        <div className="space-y-3">
          {items.map((_, i) => (
            <SkeletonListItem key={i} />
          ))}
        </div>
      )}

      {variant === 'profile-card' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((_, i) => (
            <div key={i}>
              <SkeletonCard />
            </div>
          ))}
        </div>
      )}

      {variant === 'chart' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((_, i) => (
            <SkeletonChart key={i} />
          ))}
        </div>
      )}
    </div>
  );
}
