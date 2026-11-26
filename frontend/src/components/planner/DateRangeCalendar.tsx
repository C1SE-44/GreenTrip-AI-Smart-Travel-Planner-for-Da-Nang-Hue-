import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './DateRangeCalendar.css';

const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'] as const;

export interface DateRangeCalendarProps {
  rangeStart: Date | null;
  rangeEnd: Date | null;
  onSelectRange: (start: Date | null, end: Date | null) => void;
  onClear?: () => void;
  onApply?: () => void;
  applyLabel?: string;
}

function toKey(d: Date): number {
  return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();
}

function formatViShort(d: Date): string {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export default function DateRangeCalendar({
  rangeStart,
  rangeEnd,
  onSelectRange,
  onClear,
  onApply,
  applyLabel = 'Cập nhật',
}: DateRangeCalendarProps) {
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const todayKey = toKey(today);

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    if (rangeStart) return new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [hoverKey, setHoverKey] = useState<number | null>(null);

  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  const startKey = rangeStart ? toKey(rangeStart) : null;
  const endKey = rangeEnd ? toKey(rangeEnd) : null;

  let lo = startKey;
  let hi = endKey !== null ? endKey : startKey !== null && hoverKey !== null ? hoverKey : null;
  if (lo !== null && hi !== null && hi < lo) {
    [lo, hi] = [hi, lo];
  }

  const handlePickDay = (day: number) => {
    const picked = new Date(year, month, day);
    if (toKey(picked) < todayKey) return;

    if (!rangeStart || (rangeStart && rangeEnd)) {
      onSelectRange(picked, null);
      setHoverKey(null);
      return;
    }

    if (toKey(picked) === toKey(rangeStart)) {
      onSelectRange(picked, null);
      return;
    }

    if (picked.getTime() < rangeStart.getTime()) {
      onSelectRange(picked, rangeStart);
    } else {
      onSelectRange(rangeStart, picked);
    }
    setHoverKey(null);
  };

  const nights =
    rangeStart && rangeEnd
      ? Math.round(
          (new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate()).getTime() -
            new Date(rangeStart.getFullYear(), rangeStart.getMonth(), rangeStart.getDate()).getTime()) /
            86400000,
        )
      : null;

  return (
    <div className="gt-cal">
      <div className="gt-cal-pills">
        <div className={`gt-cal-pill ${!rangeStart || Boolean(rangeEnd) ? 'on' : ''}`.trim()}>
          <small>Ngày đi</small>
          <b className={rangeStart ? '' : 'ph'}>
            {rangeStart ? formatViShort(rangeStart) : 'Chọn ngày'}
          </b>
        </div>
        <div className={`gt-cal-pill ${Boolean(rangeStart) && !rangeEnd ? 'on' : ''}`.trim()}>
          <small>Ngày về</small>
          <b className={rangeEnd ? '' : 'ph'}>
            {rangeEnd ? formatViShort(rangeEnd) : 'Chọn ngày'}
          </b>
        </div>
      </div>

      <div className="gt-cal-top">
        <span className="gt-cal-month" aria-live="polite">
          Tháng {month + 1} năm {year}
        </span>
        <div className="gt-cal-nav">
          <button
            type="button"
            aria-label="Tháng trước"
            onClick={() => setViewMonth(new Date(year, month - 1, 1))}
          >
            <ChevronLeft size={17} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Tháng sau"
            onClick={() => setViewMonth(new Date(year, month + 1, 1))}
          >
            <ChevronRight size={17} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="gt-cal-wk" aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>

      <div
        className="gt-cal-grid"
        role="grid"
        onPointerLeave={() => setHoverKey(null)}
      >
        {Array.from({ length: firstDay }).map((_, idx) => (
          <div key={`empty-${idx}`} className="gt-cal-cell" />
        ))}

        {Array.from({ length: totalDays }).map((_, idx) => {
          const day = idx + 1;
          const dateObj = new Date(year, month, day);
          const k = toKey(dateObj);
          const isPast = k < todayKey;
          const isToday = k === todayKey;
          const isStartCell = lo !== null && k === (hi === null ? startKey : lo);
          const isEndCell = hi !== null && k === hi;
          const inRange = lo !== null && hi !== null && k >= lo && k <= hi;

          return (
            <div
              key={k}
              role="gridcell"
              className={`gt-cal-cell ${isStartCell ? 's' : ''} ${isEndCell ? 'e' : ''} ${inRange ? 'in' : ''}`.trim()}
            >
              <button
                type="button"
                disabled={isPast}
                aria-label={`Ngày ${day} tháng ${month + 1} năm ${year}`}
                aria-selected={k === startKey || k === endKey}
                className={`gt-cal-d ${isPast ? 'past' : ''} ${isToday ? 'today' : ''}`.trim()}
                onPointerEnter={() => {
                  if (!isPast && startKey !== null && endKey === null) {
                    setHoverKey(k);
                  }
                }}
                onClick={() => handlePickDay(day)}
              >
                {day}
              </button>
            </div>
          );
        })}
      </div>

      <div className="gt-cal-foot">
        <span className="gt-cal-sum" aria-live="polite">
          {nights !== null && rangeStart && rangeEnd ? (
            <>
              <b>{nights + 1} ngày</b> ({nights} đêm) · {rangeStart.getDate()}/{rangeStart.getMonth() + 1} –{' '}
              {rangeEnd.getDate()}/{rangeEnd.getMonth() + 1}
            </>
          ) : rangeStart ? (
            'Chọn tiếp ngày về'
          ) : (
            'Chọn khoảng ngày chuyến đi'
          )}
        </span>

        <div className="flex items-center gap-2">
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="min-h-[40px] px-3 text-xs font-semibold text-neutral-700 hover:text-neutral-950 hover:underline cursor-pointer"
            >
              Xóa
            </button>
          )}
          {onApply && (
            <button
              type="button"
              onClick={onApply}
              className="min-h-[42px] px-6 rounded-full bg-neutral-950 hover:bg-neutral-800 text-white text-sm font-semibold transition cursor-pointer"
            >
              {applyLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
