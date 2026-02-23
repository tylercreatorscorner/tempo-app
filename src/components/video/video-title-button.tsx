'use client';

import { useVideoPanel, type VideoData } from './video-panel-context';

interface Props {
  videoData: VideoData;
  className?: string;
  children: React.ReactNode;
}

export function VideoTitleButton({ videoData, className, children }: Props) {
  const { openVideo } = useVideoPanel();

  return (
    <button
      onClick={() => openVideo(videoData)}
      className={className}
      type="button"
    >
      {children}
    </button>
  );
}
