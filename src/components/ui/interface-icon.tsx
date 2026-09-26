import {
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  TriangleAlert,
  Users,
  MessageSquare,
  ChartNoAxesCombined,
  Video,
  Rocket,
  CircleCheck,
  Clock,
  Building2,
  Lock,
  Mail,
  Star,
  Megaphone,
  Sparkles,
  Music2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
const icons = {
  forward: ChevronRight,
  back: ChevronLeft,
  up: ChevronUp,
  down: ChevronDown,
  external: ArrowUpRight,
  increase: ArrowUp,
  decrease: ArrowDown,
  success: Check,
  error: X,
  warning: TriangleAlert,
  people: Users,
  message: MessageSquare,
  chart: ChartNoAxesCombined,
  video: Video,
  launch: Rocket,
  complete: CircleCheck,
  clock: Clock,
  brand: Building2,
  lock: Lock,
  mail: Mail,
  star: Star,
  announcement: Megaphone,
  sparkle: Sparkles,
  music: Music2,
} satisfies Record<string, LucideIcon>;
/** Decorative only. Keep an accessible text label on the surrounding control. */
export function InterfaceIcon({
  name,
  className,
}: {
  name: keyof typeof icons;
  className?: string;
}) {
  const Icon = icons[name];
  return (
    <Icon
      aria-hidden="true"
      focusable="false"
      strokeWidth={1.75}
      className={cn(
        "inline-block size-4 shrink-0 align-[-0.15em] pointer-events-none",
        className,
      )}
    />
  );
}
