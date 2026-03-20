import { useEffect } from 'react';

// Reads ?room=XXXXXX from URL and triggers auto-join
export function useRoomFromUrl(onJoin) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomCode = params.get('room');
    if (roomCode && roomCode.length === 6) {
      // Clean URL immediately so it doesn't re-trigger on refresh
      window.history.replaceState({}, '', window.location.pathname);
      // Small delay to let socket connect first
      const t = setTimeout(() => onJoin(roomCode.toUpperCase()), 800);
      return () => clearTimeout(t);
    }
  }, []);
}
