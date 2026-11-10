'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { RosterTagsProvider, RosterRowTags, RosterTagEditor } from '@/components/roster/studio-tag-controls';
import { VideoThumbnail } from '@/components/dashboard/video-thumbnail';
import { useVideoPanel, type VideoData } from '@/components/video/video-panel-context';
import { canonicalVideoUrl } from '@/lib/utils/format';
import { useNavigationPending } from '@/components/layout/navigation-pending';
import styles from './studio-profile.module.css';

export function ProfileCreatorTags({ brand, managedId, tags }: { brand: string; managedId: number; tags: string[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return <RosterTagsProvider brand={brand}>
    <RosterRowTags id={String(managedId)} brand={brand} tags={tags} onEditRequest={() => setOpen(true)} />
    <RosterTagEditor ids={[String(managedId)]} open={open} onOpenChange={setOpen} onChanged={() => router.refresh()} onSaved={() => setOpen(false)} />
  </RosterTagsProvider>;
}

export function StudioVideoCover({ video }: { video: VideoData }) {
  const { openVideo } = useVideoPanel();
  const url = canonicalVideoUrl(video.creator_name, video.video_id);
  return <button type="button" className={styles.videoCoverButton} aria-label={`Review video: ${video.video_title || 'Untitled'}`} onClick={() => openVideo(video)}>
    <VideoThumbnail url={url ?? ''} className={styles.coverImage} />
  </button>;
}

export function ProfileRefreshButton() {
  const router = useRouter();
  const { isPending, startNav } = useNavigationPending();
  return <button type="button" aria-label="Refresh creator profile" title="Refresh creator profile" disabled={isPending} onClick={() => startNav(() => router.refresh())}>
    <RefreshCw size={14} className={isPending ? 'animate-spin' : undefined} aria-hidden="true" />
  </button>;
}
