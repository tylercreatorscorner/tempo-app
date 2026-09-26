import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type NavigationLinkProps = ComponentProps<typeof Link> & {
  direction?: "forward" | "back" | "down";
  description?: ReactNode;
};

/** Shared navigation affordance: aligned SVG icons, never text arrow glyphs. */
export function NavigationLink({
  children,
  className,
  direction = "forward",
  description,
  ...props
}: NavigationLinkProps) {
  const Icon = direction === "back" ? ChevronLeft : direction === "down" ? ChevronDown : ChevronRight;
  const icon = <Icon aria-hidden="true" size={16} strokeWidth={1.75} className="pointer-events-none shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />;

  return (
    <Link
      {...props}
      className={cn(
        "group rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        description
          ? "flex items-center gap-4 px-3 py-3 text-foreground hover:bg-muted/60"
          : "inline-flex min-h-8 items-center gap-1.5 text-primary hover:text-foreground",
        className,
      )}
    >
      {direction === "back" && icon}
      <span className={cn("min-w-0", description && "flex-1")}>
        <span>{children}</span>
        {description && <span className="mt-0.5 block text-sm font-normal leading-relaxed text-muted-foreground">{description}</span>}
      </span>
      {direction !== "back" && icon}
    </Link>
  );
}
