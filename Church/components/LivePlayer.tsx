import React from 'react';

/**
 * 主日直播 player。先用纯 iframe（保证 /live 不会因 hook 问题白屏）。
 * 後续如果要加 mute-recovery overlay 等高级功能，会在新组件中分开做。
 */

interface LivePlayerProps {
  videoId: string;
}

const LivePlayer: React.FC<LivePlayerProps> = ({ videoId }) => {
  if (!videoId) return null;
  return (
    <iframe
      title="Live Stream"
      src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0`}
      className="h-full w-full"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
};

export default LivePlayer;
