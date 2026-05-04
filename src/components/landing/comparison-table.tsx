'use client';

import { Check, X, Minus } from 'lucide-react';
import { ScrollReveal } from './scroll-reveal';
import { LANDING_CONTENT, type ComparisonValue } from '@/lib/landing-content';

const C = LANDING_CONTENT.comparison;

function Cell({ value, highlight }: { value: ComparisonValue; highlight?: boolean }) {
  if (value === true) {
    return (
      <div className="flex justify-center">
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={
            highlight
              ? { background: 'linear-gradient(135deg, #FF4D8D, #7C5CFC)' }
              : { backgroundColor: '#10B981' }
          }
        >
          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
        </div>
      </div>
    );
  }
  if (value === false) {
    return (
      <div className="flex justify-center">
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#F3F4F6]">
          <X className="w-3.5 h-3.5 text-[#9CA3AF]" strokeWidth={2.5} />
        </div>
      </div>
    );
  }
  if (value === 'partial') {
    return (
      <div className="flex justify-center">
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-[#FEF3C7]">
          <Minus className="w-3.5 h-3.5 text-[#D97706]" strokeWidth={3} />
        </div>
      </div>
    );
  }
  return (
    <div className={`text-center text-xs font-medium ${highlight ? 'text-[#FF4D8D]' : 'text-[#6B7280]'}`}>
      {value}
    </div>
  );
}

export function ComparisonTable() {
  return (
    <section id="compare" className="py-20 sm:py-24 md:py-32 px-4 sm:px-6 bg-white scroll-mt-20">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal className="text-center mb-12 md:mb-16">
          <p className="text-sm font-semibold text-[#FF4D8D] uppercase tracking-wider mb-3">{C.label}</p>
          <h2 className="text-2xl md:text-5xl font-extrabold text-[#1A1B3A] tracking-tight">
            {C.title}
          </h2>
          <p className="text-[#6B7280] mt-4 text-lg max-w-2xl mx-auto">{C.subtitle}</p>
        </ScrollReveal>

        <ScrollReveal delay={150}>
          <div className="rounded-3xl border border-[#E5E7EB] bg-white shadow-sm overflow-hidden">
            {/* Header row */}
            <div className="grid grid-cols-[1.4fr_repeat(4,1fr)] sm:grid-cols-[1.6fr_repeat(4,1fr)] border-b border-[#E5E7EB] bg-[#FAFBFC]">
              <div className="px-3 sm:px-6 py-4 text-xs sm:text-sm font-semibold text-[#9CA3AF] uppercase tracking-wider">
                Feature
              </div>
              {C.columns.map((col) => (
                <div
                  key={col.name}
                  className={`px-2 sm:px-4 py-4 text-center text-xs sm:text-sm font-bold ${
                    col.highlight ? 'text-[#FF4D8D]' : 'text-[#1A1B3A]'
                  }`}
                >
                  {col.highlight ? (
                    <span className="bg-gradient-to-r from-[#FF4D8D] to-[#7C5CFC] bg-clip-text text-transparent">
                      {col.name}
                    </span>
                  ) : (
                    col.name
                  )}
                </div>
              ))}
            </div>

            {/* Capability rows (binary) */}
            {C.rows.map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-[1.4fr_repeat(4,1fr)] sm:grid-cols-[1.6fr_repeat(4,1fr)] items-center ${
                  i !== C.rows.length - 1 ? 'border-b border-[#F3F4F6]' : ''
                }`}
              >
                <div className="px-3 sm:px-6 py-4 text-xs sm:text-sm font-medium text-[#1A1B3A]">
                  {row.label}
                </div>
                {row.values.map((val, j) => (
                  <div
                    key={j}
                    className={`px-2 sm:px-4 py-4 ${C.columns[j].highlight ? 'bg-gradient-to-b from-[#FF4D8D]/[0.03] to-[#7C5CFC]/[0.03]' : ''}`}
                  >
                    <Cell value={val} highlight={C.columns[j].highlight} />
                  </div>
                ))}
              </div>
            ))}

            {/* Summary rows (text values, visually separated) */}
            {C.summaryRows && C.summaryRows.length > 0 && (
              <>
                <div className="border-t-2 border-[#E5E7EB] bg-[#FAFBFC]" />
                {C.summaryRows.map((row, i) => (
                  <div
                    key={row.label}
                    className={`grid grid-cols-[1.4fr_repeat(4,1fr)] sm:grid-cols-[1.6fr_repeat(4,1fr)] items-center bg-[#FAFBFC] ${
                      C.summaryRows && i !== C.summaryRows.length - 1 ? 'border-b border-[#F3F4F6]' : ''
                    }`}
                  >
                    <div className="px-3 sm:px-6 py-4 text-xs sm:text-sm font-semibold text-[#6B7280] uppercase tracking-wide">
                      {row.label}
                    </div>
                    {row.values.map((val, j) => (
                      <div
                        key={j}
                        className={`px-2 sm:px-4 py-4 text-center text-xs sm:text-sm font-semibold ${
                          C.columns[j].highlight ? 'text-[#FF4D8D] bg-gradient-to-b from-[#FF4D8D]/[0.03] to-[#7C5CFC]/[0.03]' : 'text-[#4B5563]'
                        }`}
                      >
                        {val}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
