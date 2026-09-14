'use client';

import { useState, type ReactNode } from 'react';
import styles from './profile-workspace.module.css';

export function ProfileSections({ sections }: { sections: { id: string; label: string; content: ReactNode }[] }) {
  const [active, setActive] = useState(sections[0].id);
  return <>
    <nav className={styles.tabs} aria-label="Creator profile sections">
      {sections.map(section => <button type="button" key={section.id} aria-pressed={active === section.id} onClick={() => setActive(section.id)}>{section.label}</button>)}
    </nav>
    {sections.map(section => <div key={section.id} hidden={active !== section.id}>{section.content}</div>)}
  </>;
}
