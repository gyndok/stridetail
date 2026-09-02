/**
 * Web video player for report clips (wish list #7, capped at 10 s at capture).
 * A plain DOM <video> — controls, no autoplay, poster-less; playsInline keeps
 * iOS Safari from hijacking into fullscreen.
 */
export function VideoPlayer({ uri }: { uri: string }) {
  return (
    <video
      src={uri}
      controls
      playsInline
      preload="metadata"
      style={{ width: '100%', borderRadius: 14, backgroundColor: '#000' }}
    />
  );
}
