import { cn } from '@/lib/utils';
import styles from './loading-status.module.css';

/** Theme-aware placeholder with a quiet shimmer and reduced-motion support. */
export function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn(styles.skeleton, 'rounded', className)}
      {...props}
    />
  );
}
