import React from 'react';

const Skeleton = ({ className = '', variant = 'text', width, height }) => {
  const baseClasses = 'animate-pulse bg-slate-200 rounded';
  
  const variantClasses = {
    text: 'h-4 w-full',
    title: 'h-8 w-3/4',
    circle: 'rounded-full',
    rectangular: 'rounded-lg',
    card: 'h-24 w-full rounded-lg'
  };

  const style = {};
  if (width) style.width = width;
  if (height) style.height = height;

  return (
    <div 
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
      style={style}
    />
  );
};

export const SkeletonText = ({ lines = 1, className = '' }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton 
        key={i} 
        variant="text" 
        className={i === lines - 1 ? 'w-2/3' : ''} 
      />
    ))}
  </div>
);

export const SkeletonCard = ({ className = '' }) => (
  <div className={`bg-white p-6 rounded-lg shadow-sm border border-slate-200 ${className}`}>
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <Skeleton variant="text" className="w-24 h-3 mb-2" />
        <Skeleton variant="title" className="w-16 mb-1" />
        <Skeleton variant="text" className="w-32 h-3" />
      </div>
      <Skeleton variant="circle" width="48px" height="48px" />
    </div>
  </div>
);

export default Skeleton;
