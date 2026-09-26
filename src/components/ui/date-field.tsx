"use client";
import { useState, type InputHTMLAttributes } from "react";
import { Popover } from "radix-ui";
import { CalendarDays } from "lucide-react";
import { format, parseISO, isValid, differenceInCalendarDays } from "date-fns";
import { Calendar } from "./calendar";
import { cn } from "@/lib/utils";
import styles from "./calendar.module.css";
type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "onChange"
> & { value: string; onValueChange: (value: string) => void };
function date(value: unknown) {
  if (typeof value !== "string" || !value) return undefined;
  const d = parseISO(value);
  return isValid(d) ? d : undefined;
}
export function DateField({
  value,
  onValueChange,
  className,
  min,
  max,
  step,
  disabled,
  readOnly,
  ...props
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = date(value),
    first = date(min),
    last = date(max);
  const blocked = (day: Date) =>
    !!(
      (first && day < first) ||
      (last && day > last) ||
      (step &&
        step !== "any" &&
        Number(step) > 1 &&
        differenceInCalendarDays(day, first ?? new Date(1970, 0, 1)) %
          Number(step) !==
          0)
    );
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <span className={cn(styles.field, "w-full")}>
          <input
            {...props}
            type="date"
            value={value}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            readOnly={readOnly}
            onChange={(e) => onValueChange(e.target.value)}
            className={cn(
              "rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:opacity-50",
              className,
            )}
          />
          <Popover.Trigger asChild>
            <button
              type="button"
              disabled={disabled || readOnly}
              aria-label={
                props["aria-label"]
                  ? `Choose ${props["aria-label"].toLowerCase()}`
                  : "Open calendar"
              }
              className={styles.open}
            >
              <CalendarDays size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </Popover.Trigger>
        </span>
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className={styles.panel}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          aria-label="Choose date"
          data-lenis-prevent
        >
          <Calendar
            mode="single"
            required
            selected={selected}
            defaultMonth={selected ?? last ?? new Date()}
            disabled={blocked}
            autoFocus
            onSelect={(day) => {
              if (day) {
                onValueChange(format(day, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
          />
          <div className={styles.footer}>
            <span>
              {selected ? format(selected, "MMM d, yyyy") : "Select a date"}
            </span>
            {!props.required && (
              <button
                type="button"
                className="rounded px-2 py-1 hover:bg-muted focus-visible:outline-primary"
                onClick={() => {
                  onValueChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
