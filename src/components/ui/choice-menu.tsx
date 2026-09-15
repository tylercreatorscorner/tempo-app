'use client';

import { Select } from 'radix-ui';
import { Check, ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import styles from './choice-menu.module.css';

export interface ChoiceOption { value: string; label: string; description?: string; icon?: ReactNode; group?: string; }
export function ChoiceMenu({ label, value, options, onChange, disabled, placeholder = 'Choose an option' }: {
  label: string; value: string; options: ChoiceOption[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string;
}) {
  const selected = options.find(option => option.value === value);
  return <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
    <Select.Trigger className={styles.trigger} aria-label={label}>
      {selected?.icon}<Select.Value placeholder={placeholder} /><Select.Icon className={styles.chevron}><ChevronDown size={15} /></Select.Icon>
    </Select.Trigger>
    <Select.Portal><Select.Content className={styles.content} position="popper" sideOffset={8} collisionPadding={12} data-lenis-prevent>
      <Select.ScrollUpButton className={styles.scroll}>↑</Select.ScrollUpButton>
      <Select.Viewport className={styles.viewport}>
        <div className={styles.heading}>{label}</div>
        {options.map((option, index) => <Select.Group key={option.value}>
          {option.group && option.group !== options[index - 1]?.group && <Select.Label className={styles.heading}>{option.group}</Select.Label>}
          <Select.Item value={option.value} className={styles.item}>
            {option.icon}<span className={styles.copy}><Select.ItemText>{option.label}</Select.ItemText>{option.description && <span className={styles.description}>{option.description}</span>}</span>
            <Select.ItemIndicator className={styles.check}><Check size={16} /></Select.ItemIndicator>
          </Select.Item>
        </Select.Group>)}
      </Select.Viewport><Select.ScrollDownButton className={styles.scroll}>↓</Select.ScrollDownButton>
    </Select.Content></Select.Portal>
  </Select.Root>;
}
