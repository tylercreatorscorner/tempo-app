"use client";
import { DayPicker, type DayPickerProps } from "@daypicker/react";
import "@daypicker/react/style.css";
import styles from "./calendar.module.css";
import { cn } from "@/lib/utils";
export function Calendar(props: DayPickerProps) {
  return (
    <DayPicker
      showOutsideDays
      fixedWeeks
      {...props}
      className={cn(styles.calendar, props.className)}
    />
  );
}
