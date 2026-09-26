"use client";
import { useState, useRef } from "react";
import { Dialog } from "radix-ui";
import { format, parseISO, isValid, subDays, startOfDay } from "date-fns";
import { X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import type { DateRange } from "@daypicker/react";
import styles from "./custom-range-popover.module.css";
interface Props {
  initialStart?: string | null;
  initialEnd?: string | null;
  onApply: (start: string, end: string) => void;
  onClose: () => void;
  maxDate?: Date;
}
const parse = (value?: string | null) =>
  value && isValid(parseISO(value)) ? parseISO(value) : undefined;
export function CustomRangePopover({
  initialStart,
  initialEnd,
  onApply,
  onClose,
  maxDate,
}: Props) {
  const returnFocus = useRef(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );
  const max = startOfDay(maxDate ?? subDays(new Date(), 1));
  const [range, setRange] = useState<DateRange | undefined>({
    from: parse(initialStart),
    to: parse(initialEnd),
  });
  const complete =
    !!range?.from && !!range?.to && range.from <= range.to && range.to <= max;
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocus.current?.focus();
          }}
          className={styles.popover}
          data-lenis-prevent
        >
          <header className={styles.header}>
            <div>
              <Dialog.Title className="text-sm font-semibold">
                Custom reporting period
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                Choose a start and end date.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close calendar"
                className={styles.close}
              >
                <X size={16} />
              </button>
            </Dialog.Close>
          </header>
          <div className={styles.selection} aria-live="polite">
            <div>
              <span>Start date</span>
              <strong>
                {range?.from
                  ? format(range.from, "MMM d, yyyy")
                  : "Select date"}
              </strong>
            </div>
            <div>
              <span>End date</span>
              <strong>
                {range?.to ? format(range.to, "MMM d, yyyy") : "Select date"}
              </strong>
            </div>
          </div>
          <Calendar
            mode="range"
            selected={range}
            onSelect={(_, day) =>
              setRange(
                !range?.from || range.to
                  ? { from: day, to: undefined }
                  : day < range.from
                    ? { from: day, to: range.from }
                    : { from: range.from, to: day },
              )
            }
            defaultMonth={range?.from ?? max}
            disabled={{ after: max }}
            numberOfMonths={1}
            autoFocus
          />
          <footer className={styles.footer}>
            <button
              type="button"
              onClick={() => setRange(undefined)}
              className="rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-muted"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={!complete}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              onClick={() => {
                if (complete && range?.from && range.to)
                  onApply(
                    format(range.from, "yyyy-MM-dd"),
                    format(range.to, "yyyy-MM-dd"),
                  );
              }}
            >
              Apply period
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
