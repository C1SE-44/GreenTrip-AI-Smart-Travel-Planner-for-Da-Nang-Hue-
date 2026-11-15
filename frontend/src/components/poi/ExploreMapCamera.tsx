import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Poi, PoiCity } from '@/data/pois';

export const EXPLORE_NEARBY_METERS = 5000;
const LOCAL_AUTO_MAX_ZOOM = 13;
const PADDING: [number, number] = [48, 80];

// Same urban extents used by the existing fitter, independent of result pages/GPS.
const CITY_BOUNDS: Record<PoiCity, [L.LatLngTuple, L.LatLngTuple]> = {
  'Đà Nẵng': [[16.02, 108.18], [16.12, 108.27]],
  'Huế': [[16.42, 107.54], [16.50, 107.62]],
};

export interface ExploreCameraContext {
  region: 'all' | PoiCity;
  contextPois: Poi[];
}

type Focus = { id: string; point: L.LatLng };
type CameraState =
  | { kind: 'overview' }
  | { kind: 'local'; anchor: L.LatLng }
  | { kind: 'bridge'; from: L.LatLng; target: Focus };

function stopCamera(map: L.Map) {
  // stop() can queue an animated zoom while rounding a fractional flyTo zoom.
  map.setView(map.getCenter(), map.getZoom(), { animate: false });
}

export default function ExploreMapCamera({ region, pois, hoveredPoiId, selectedPoiId, onContextAnchor }: {
  region: ExploreCameraContext['region'];
  pois: Poi[];
  hoveredPoiId: string | null;
  selectedPoiId: string | null;
  onContextAnchor: (point: L.LatLng | null, focusIds?: string[]) => void;
}) {
  const map = useMap();
  const camera = useRef<CameraState>({ kind: 'overview' });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ownAnimation = useRef(false);
  const manualMotion = useRef(false);
  const input = useRef<'pointer' | 'wheel' | 'key' | null>(null);
  const lastSelection = useRef<string | null>(null);
  const latest = useRef({ pois, hoveredPoiId });
  latest.current = { pois, hoveredPoiId };
  const dataKey = JSON.stringify(pois.map(p => [p.id, p.lat, p.lng]).sort());

  useEffect(() => {
    const cancel = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
    const pointer = () => { cancel(); if (ownAnimation.current) stopCamera(map); ownAnimation.current = false; input.current = 'pointer'; };
    const wheel = () => { cancel(); if (ownAnimation.current) stopCamera(map); ownAnimation.current = false; input.current = 'wheel'; };
    const key = () => { cancel(); if (ownAnimation.current) stopCamera(map); ownAnimation.current = false; input.current = 'key'; };
    const drag = () => { cancel(); manualMotion.current = true; ownAnimation.current = false; };
    const zoom = () => { cancel(); if (input.current && !ownAnimation.current) manualMotion.current = true; };
    const moving = () => { cancel(); if (input.current === 'key' && !ownAnimation.current) manualMotion.current = true; };
    const end = () => {
      if (manualMotion.current) camera.current = { kind: 'local', anchor: map.getCenter() };
      manualMotion.current = false;
      ownAnimation.current = false;
      input.current = null;
    };
    const container = map.getContainer();
    container.addEventListener('pointerdown', pointer);
    container.addEventListener('touchstart', pointer, { passive: true });
    container.addEventListener('wheel', wheel, { passive: true });
    container.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', cancel, true);
    document.addEventListener('click', cancel, true);
    map.on('dragstart', drag);
    map.on('zoomstart', zoom);
    map.on('movestart', moving);
    map.on('moveend', end);
    return () => {
      cancel();
      container.removeEventListener('pointerdown', pointer);
      container.removeEventListener('touchstart', pointer);
      container.removeEventListener('wheel', wheel);
      container.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', cancel, true);
      document.removeEventListener('click', cancel, true);
      map.off('dragstart', drag);
      map.off('zoomstart', zoom);
      map.off('movestart', moving);
      map.off('moveend', end);
    };
  }, [map]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    stopCamera(map);
    camera.current = { kind: 'overview' };
    lastSelection.current = null;
    onContextAnchor(null);
    const bounds = region === 'all'
      ? L.latLngBounds(CITY_BOUNDS['Đà Nẵng']).extend(L.latLngBounds(CITY_BOUNDS['Huế']))
      : L.latLngBounds(CITY_BOUNDS[region]);
    input.current = null;
    ownAnimation.current = true;
    map.invalidateSize({ pan: false });
    if (region === 'all') {
      map.fitBounds(bounds, { padding: PADDING, animate: false });
    } else if (region === 'Đà Nẵng') {
      map.setView([16.068, 108.22], 13, { animate: false });
    } else if (region === 'Huế') {
      map.setView([16.4637, 107.5909], 13, { animate: false });
    }
    ownAnimation.current = false;
  }, [region, map, onContextAnchor]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const safe = (point: L.LatLng) => {
      const pixel = map.latLngToContainerPoint(point);
      const size = map.getSize();
      return pixel.x >= 64 && pixel.x <= size.x - 64 && pixel.y >= 80 && pixel.y <= size.y - 80;
    };
    const fly = (bounds: L.LatLngBounds, maxZoom: number) => {
      stopCamera(map);
      input.current = null;
      ownAnimation.current = true;
      map.flyToBounds(bounds, { padding: PADDING, maxZoom, duration: 0.8 });
    };
    const focus = (target: Focus) => {
      const state = camera.current;
      // A visible C still closes the bridge around B–C; never keep A in this fit.
      if (state.kind === 'bridge' && target.id !== state.target.id && map.distance(state.target.point, target.point) <= EXPLORE_NEARBY_METERS) {
        const bounds = L.latLngBounds([state.target.point, target.point]);
        const anchor = bounds.getCenter();
        camera.current = { kind: 'local', anchor };
        onContextAnchor(anchor, [state.target.id, target.id]);
        fly(bounds, LOCAL_AUTO_MAX_ZOOM);
        return;
      }
      if (state.kind === 'bridge' && target.id === state.target.id) return;
      const from = state.kind === 'local' ? state.anchor : state.kind === 'bridge' ? state.target.point : map.getCenter();
      if (state.kind === 'local' && map.distance(from, target.point) <= EXPLORE_NEARBY_METERS) {
        if (!safe(target.point)) {
          stopCamera(map);
          ownAnimation.current = true;
          map.panInside(target.point, { paddingTopLeft: [64, 80], paddingBottomRight: [64, 80], animate: true, duration: 0.35 });
        }
        return;
      }
      if (state.kind === 'overview' && safe(target.point)) {
        camera.current = { kind: 'local', anchor: target.point };
        return;
      }
      camera.current = { kind: 'bridge', from, target };
      if (!safe(from) || !safe(target.point)) fly(L.latLngBounds([from, target.point]), map.getZoom());
    };
    const find = (id: string) => {
      const poi = latest.current.pois.find(p => p.id === id);
      return poi && Number.isFinite(poi.lat) && Number.isFinite(poi.lng) ? { id, point: L.latLng(poi.lat, poi.lng) } : null;
    };
    if (selectedPoiId) {
      if (lastSelection.current !== selectedPoiId) {
        const target = find(selectedPoiId);
        if (target && !map.getBounds().contains(target.point)) focus(target);
        lastSelection.current = selectedPoiId;
        return;
      }
      if (hoveredPoiId === selectedPoiId) return;
    } else {
      lastSelection.current = null;
    }
    if (!hoveredPoiId || manualMotion.current) return;
    const target = find(hoveredPoiId);
    if (!target) return;
    timer.current = setTimeout(() => {
      timer.current = null;
      if (latest.current.hoveredPoiId === hoveredPoiId && !manualMotion.current) focus(target);
    }, 300);
    return () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  }, [hoveredPoiId, selectedPoiId, region, dataKey, map, onContextAnchor]);

  return null;
}
