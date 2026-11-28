import { useEffect, useMemo, useState } from 'react';
import {
  getDeterministicImage,
  type PoiCategory,
  type PoiCity,
} from '@/data/pois';

const INLINE_FALLBACK_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0%" stop-color="#e7f3ec"/><stop offset="100%" stop-color="#d5eadc"/>' +
      '</linearGradient></defs>' +
      '<rect width="800" height="600" fill="url(#g)"/>' +
      '<path d="M0 440 Q220 350 420 420 T800 390 L800 600 L0 600 Z" fill="#a7d3b6"/>' +
      '<path d="M0 490 Q280 420 520 480 T800 460 L800 600 L0 600 Z" fill="#6fb388"/>' +
      '<circle cx="610" cy="170" r="48" fill="#f7e3a1"/>' +
      '</svg>'
  );

const NEUTRAL_FALLBACK_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">' +
      '<rect width="800" height="600" fill="#f3f4f6"/>' +
      '<path d="M400 160c-77 0-140 62-140 139 0 102 140 230 140 230s140-128 140-230c0-77-63-139-140-139zm0 193a54 54 0 1 1 0-108 54 54 0 0 1 0 108z" fill="#9ca3af"/>' +
    '</svg>'
  );

export interface PoiImageProps {
  src?: string | null;
  alt: string;
  poiId?: string;
  poiName?: string;
  category?: PoiCategory;
  city?: PoiCity;
  fallbackSeed?: string;
  fallbackMode?: 'category' | 'neutral';
  className?: string;
  priority?: boolean;
}

export default function PoiImage({
  src,
  alt,
  poiId,
  poiName,
  category = 'canh-quan',
  city = 'Đà Nẵng',
  fallbackSeed,
  fallbackMode = 'category',
  className = '',
  priority = false,
}: PoiImageProps) {
  const deterministicFallback = useMemo(
    () =>
      getDeterministicImage(
        poiName || alt,
        fallbackSeed || poiId || alt,
        category,
        city
      ),
    [poiName, alt, fallbackSeed, poiId, category, city]
  );

  const normalizedSrc = src?.trim() || '';
  const [errorTier, setErrorTier] = useState<0 | 1 | 2>(() =>
    normalizedSrc ? 0 : fallbackMode === 'neutral' ? 2 : 1
  );

  useEffect(() => {
    setErrorTier(normalizedSrc ? 0 : fallbackMode === 'neutral' ? 2 : 1);
  }, [normalizedSrc, fallbackMode]);

  const activeSrc =
    errorTier === 0
      ? normalizedSrc
      : errorTier === 1
        ? deterministicFallback
        : fallbackMode === 'neutral' ? NEUTRAL_FALLBACK_SVG : INLINE_FALLBACK_SVG;

  const handleError = () => {
    setErrorTier((prev) => {
      if (prev === 0) {
        if (fallbackMode === 'neutral') return 2;
        return deterministicFallback && deterministicFallback !== normalizedSrc ? 1 : 2;
      }
      return 2;
    });
  };

  return (
    <img
      src={activeSrc}
      alt={alt}
      loading={priority ? 'eager' : 'lazy'}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleError}
      className={className}
    />
  );
}
