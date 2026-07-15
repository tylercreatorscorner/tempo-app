import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Pulse Button. `primary` carries the signature accent gradient; the rest are
 * flat surfaces. Exported `buttonVariants` lets non-<button> elements (e.g.
 * next/link <Link>) take the same styling: <Link className={buttonVariants()}>.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold ' +
    'transition-[filter,background-color,border-color,color,box-shadow] duration-150 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background ' +
    'disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none ' +
    '[&_svg]:shrink-0 [&_svg]:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-pulse-grad text-white shadow-pulse-primary hover:brightness-[1.07]',
        secondary: 'bg-secondary text-foreground border border-border hover:border-primary hover:text-primary',
        outline: 'bg-card text-foreground border border-border hover:bg-muted',
        ghost: 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground',
        danger: 'bg-destructive text-white hover:brightness-[1.07]',
      },
      size: {
        sm: 'text-xs px-3 py-1.5 [&_svg]:size-3.5',
        md: 'text-[13.5px] px-4 py-[9px] [&_svg]:size-4',
        lg: 'text-sm px-5 py-2.5 [&_svg]:size-4',
        icon: 'p-2 [&_svg]:size-[18px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = 'Button';
