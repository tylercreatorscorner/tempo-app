'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';

export interface VideoData {
  video_id: string;
  video_title: string;
  creator_name: string;
  brand?: string;
  product_name?: string;
  gmv?: number;
  orders?: number;
  items_sold?: number;
  days_selling?: number;
  date_range?: string;
}

interface VideoPanelContextType {
  video: VideoData | null;
  isOpen: boolean;
  openVideo: (data: VideoData) => void;
  closeVideo: () => void;
}

const VideoPanelContext = createContext<VideoPanelContextType>({
  video: null,
  isOpen: false,
  openVideo: () => {},
  closeVideo: () => {},
});

export function useVideoPanel() {
  return useContext(VideoPanelContext);
}

export function VideoPanelProvider({ children }: { children: ReactNode }) {
  const [video, setVideo] = useState<VideoData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const openVideo = useCallback((data: VideoData) => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setVideo(data);
    setIsOpen(true);
  }, []);

  const closeVideo = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setIsOpen(false);
    closeTimer.current = setTimeout(() => { setVideo(null); closeTimer.current = null; }, 300);
  }, []);

  return (
    <VideoPanelContext.Provider value={{ video, isOpen, openVideo, closeVideo }}>
      {children}
    </VideoPanelContext.Provider>
  );
}
