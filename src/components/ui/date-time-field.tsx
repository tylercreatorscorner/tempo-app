"use client";
import { useState } from "react";
import { DateField } from "./date-field";
/** Local wall-clock value, matching datetime-local. No timezone conversion. */
export function DateTimeField({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (value !== previous) {
    setPrevious(value);
    setDraft(value);
  }
  const [day = "", time = ""] = draft.split("T");
  function update(nextDay: string, nextTime: string) {
    const next = `${nextDay}T${nextTime}`;
    setDraft(next);
    if (nextDay && nextTime) onValueChange(next);
    else onValueChange("");
  }
  return (
    <span className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
      <DateField
        aria-label="Scheduled date"
        value={day}
        onValueChange={(next) => update(next, time)}
        className={className}
      />
      <input
        aria-label="Scheduled time"
        type="time"
        value={time}
        onChange={(e) => update(day, e.target.value)}
        className={className}
      />
      {(day || time) && (
        <button
          type="button"
          className="col-span-2 justify-self-end text-xs text-muted-foreground"
          onClick={() => {
            setDraft("");
            onValueChange("");
          }}
        >
          Clear date and time
        </button>
      )}
    </span>
  );
}
