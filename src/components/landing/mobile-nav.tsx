'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';

const links = [
  { label: 'Features', href: '/features' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Compare', href: '/#compare' },
  { label: 'Changelog', href: '/changelog' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#F3F4F6] transition-colors"
      >
        <Menu className="w-5 h-5 text-[#1A1B3A]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl animate-slide-in-right flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              {/* Inline logo mark */}
              <div className="flex items-center gap-1">
                <span
                  style={{
                    fontSize: 20,
                    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
                    fontWeight: 800,
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                    color: '#1A1B3A',
                  }}
                >
                  Temp
                </span>
                <svg viewBox="0 0 40 40" fill="none" width="16" height="16">
                  <circle cx="20" cy="20" r="20" fill="url(#mobileNavGrad)" />
                  <polygon points="16,12 16,28 28,20" fill="white" fillOpacity="0.95" />
                  <defs>
                    <linearGradient id="mobileNavGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FF4D8D" />
                      <stop offset="1" stopColor="#7C5CFC" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F3F4F6] transition-colors"
              >
                <X className="w-4 h-4 text-[#6B7280]" />
              </button>
            </div>

            <nav className="flex-1 flex flex-col px-4 pt-4 gap-1">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="px-3 py-3 rounded-xl text-[#1A1B3A] font-medium text-base hover:bg-[#F8F9FC] hover:text-[#FF4D8D] transition-colors"
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <div className="px-4 pb-8 pt-4 border-t border-[#E5E7EB] space-y-3">
              <a
                href="/login"
                onClick={() => setOpen(false)}
                className="block w-full text-center px-6 py-3 rounded-full text-sm font-semibold text-[#1A1B3A] border border-[#E5E7EB] hover:bg-[#F8F9FC] transition-colors"
              >
                Log in
              </a>
              <a
                href="https://cal.com/tyler3p/tempo-demo"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className="block w-full text-center px-6 py-3 rounded-full text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-[#FF4D8D]/25"
                style={{ background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)' }}
              >
                Book a Demo
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
