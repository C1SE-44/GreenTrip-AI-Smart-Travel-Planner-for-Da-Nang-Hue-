import { useSyncExternalStore } from 'react';

const desktopQuery = '(min-width: 1024px)';
function subscribe(onChange: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
function getSnapshot() { return window.matchMedia(desktopQuery).matches; }

/** Do not mount Leaflet inside a display:none panel: flyTo cannot fit a zero-sized viewport. */
export function usePlannerMapVisible() {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
