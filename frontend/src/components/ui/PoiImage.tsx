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

export interface PoiImageProps {
  src?: string | null;
  alt: string;
  poiId?: string;
  poiName?: string;
  category?: PoiCategory;
  city?: PoiCity;
  fallbackSeed?: string;
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
    normalizedSrc ? 0 : 1
  );

  useEffect(() => {
    setErrorTier(normalizedSrc ? 0 : 1);
  }, [normalizedSrc]);

  const activeSrc =
    errorTier === 0
      ? normalizedSrc
      : errorTier === 1
        ? deterministicFallback
        : INLINE_FALLBACK_SVG;

  const handleError = () => {
    setErrorTier((prev) => {
      if (prev === 0) {
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
