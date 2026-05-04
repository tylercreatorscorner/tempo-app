'use client';

import ReactCountUp from 'react-countup';
import { useInView } from 'framer-motion';
import { useRef } from 'react';

interface CountUpProps {
  end: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

export function CountUp({
  end,
  prefix = '',
  suffix = '',
  duration = 2000,
  className = '',
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <span ref={ref} className={className}>
      {inView ? (
        <ReactCountUp
          end={end}
          prefix={prefix}
          suffix={suffix}
          duration={duration / 1000}
          separator=","
          easingFn={(t, b, c, d) => {
            const x = t / d;
            return c * (1 - Math.pow(1 - x, 3)) + b;
          }}
        />
      ) : (
        <>
          {prefix}0{suffix}
        </>
      )}
    </span>
  );
}
