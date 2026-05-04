'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';
import { LANDING_CONTENT } from '@/lib/landing-content';

const faqs = LANDING_CONTENT.faqs;

function AccordionItem({
  q,
  a,
  isOpen,
  onToggle,
}: {
  q: string;
  a: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white overflow-hidden transition-all duration-200 ${
        isOpen ? 'border-tempo-pink/25 shadow-sm shadow-tempo-pink/8' : 'border-tempo-line'
      }`}
    >
      <button
        className="w-full flex items-start justify-between px-6 py-5 text-left gap-4"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span
          className={`text-sm font-semibold leading-relaxed transition-colors duration-200 ${
            isOpen ? 'text-[#FF4D8D]' : 'text-[#1A1B3A]'
          }`}
        >
          {q}
        </span>
        <span
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all duration-300 ${
            isOpen
              ? 'border-[#FF4D8D] bg-[#FF4D8D] rotate-45'
              : 'border-[#E5E7EB] bg-white'
          }`}
        >
          <Plus className={`w-3 h-3 transition-colors ${isOpen ? 'text-white' : 'text-[#9CA3AF]'}`} />
        </span>
      </button>

      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-6 pb-5">
            <div className="border-t border-[#F3F4F6] pt-4">
              <p className="text-sm text-[#6B7280] leading-relaxed">{a}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FaqAccordion() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => (
        <ScrollReveal key={i} delay={i * 60}>
          <AccordionItem
            q={faq.q}
            a={faq.a}
            isOpen={open === i}
            onToggle={() => setOpen(open === i ? null : i)}
          />
        </ScrollReveal>
      ))}
    </div>
  );
}
