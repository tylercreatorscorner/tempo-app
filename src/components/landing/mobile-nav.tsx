'use client';

import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { TempoLogo } from '@/components/ui/tempo-logo';

const links = [
  { label: 'Features', href: '#features' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'About', href: '#how-it-works' },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button onClick={() => setOpen(true)} aria-label="Open menu">
        <Menu className="w-6 h-6 text-[#1A1B3A]" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-white shadow-2xl animate-slide-in-right">
            <div className="flex items-center justify-between p-6 border-b border-[#E5E7EB]">
              <TempoLogo size="sm" animated={false} />
              <button onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="w-5 h-5 text-[#1A1B3A]" />
              </button>
            </div>
            <nav className="p-6 flex flex-col gap-4">
              {links.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="text-[#1A1B3A] font-medium text-lg hover:text-[#FF4D8D] transition-colors"
                >
                  {l.label}
                </a>
              ))}
              <a
                href="#cta"
                onClick={() => setOpen(false)}
                className="mt-4 inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] hover:shadow-lg hover:shadow-[#FF4D8D]/25 transition-all"
              >
                Get Started
              </a>
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
