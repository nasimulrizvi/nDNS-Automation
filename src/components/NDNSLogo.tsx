import React from 'react';

interface NDNSLogoProps {
  size?: number;
  className?: string;
  showContainer?: boolean;
}

export function NDNSLogo({ size = 22, className = '', showContainer = false }: NDNSLogoProps) {
  const logoImg = (
    <img
      src="/favicon.svg"
      alt="nDNS Automations Logo"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      id="ndns-brand-logo-img"
    />
  );

  if (showContainer) {
    return (
      <div className="p-1.5 bg-[#080c14] border border-slate-800 rounded-xl flex items-center justify-center shadow-sm">
        {logoImg}
      </div>
    );
  }

  return logoImg;
}

export default NDNSLogo;
