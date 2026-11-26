import './tripMapFrame.css';

/** Shared visual rules for the trip workspace, aligned with Airbnb-inspired /home, /explore & /saved. */
export const plannerStyles = {
  title: 'font-sans text-2xl leading-8 tracking-tight font-bold text-neutral-950',
  sectionTitle: 'font-sans text-lg leading-6 font-bold tracking-tight text-neutral-950',
  modalTitle: 'font-sans text-xl leading-7 tracking-tight font-bold text-neutral-950',
  itemTitle: 'font-sans text-[15px] leading-5 font-semibold text-neutral-950',
  dayTitle: 'font-sans text-[15px] leading-[22px] font-bold text-neutral-950',
  tripTitle: 'font-sans text-[15px] sm:text-base leading-snug font-bold tracking-tight text-neutral-950',
  controlText: 'font-sans text-xs sm:text-[13px] leading-5 font-semibold',
  meta: 'text-xs sm:text-[13px] leading-[18px] font-medium text-neutral-600',
  pill: 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border border-neutral-300 bg-white px-3.5 text-xs sm:text-[13px] leading-5 font-semibold text-neutral-900 hover:bg-neutral-50 hover:border-neutral-950 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1',
  icon: 'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 hover:text-neutral-950 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-1',
  column: 'w-full lg:w-[54%] lg:max-w-[720px] min-w-0 lg:min-w-[460px] shrink-0',
  map: 'hidden lg:block flex-1 h-full min-w-0 p-0 relative bg-white overflow-hidden',
  mapSurface: 'trip-map-surface relative w-full h-full overflow-hidden rounded-l-[22px] rounded-r-none [transform:translateZ(0)]',
} as const;
