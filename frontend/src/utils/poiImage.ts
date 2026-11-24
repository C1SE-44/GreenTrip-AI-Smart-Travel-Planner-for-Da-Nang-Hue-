/** Resize only recognized public image URLs; leave other/signed URLs intact. */
export function poiImageUrl(source: string, width = 640): string {
  try {
    const url = new URL(source);
    if (/^lh\d+\.googleusercontent\.com$/.test(url.hostname)) {
      // Preserve Google's flags while bounding both decoded dimensions.
      url.pathname = url.pathname.replace(/=w\d+-h\d+([^/]*)$/, `=w${width}-h${Math.round(width * 0.95)}$1`);
      return url.href;
    }
    if (url.hostname === 'images.unsplash.com') {
      url.searchParams.set('w', String(width));
      url.searchParams.set('q', '75');
      url.searchParams.set('auto', 'format');
      url.searchParams.set('fit', 'max');
      return url.href;
    }
  } catch { /* Relative/local assets and malformed URLs retain existing behavior. */ }
  return source;
}
