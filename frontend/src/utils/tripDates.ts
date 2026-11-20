export function vietnamNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (name: string) => parts.find((p) => p.type === name)?.value || '00';
  return {
    date: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function dateAt(start: string, offset = 0): string {
  const date = new Date(`${start}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return dateKey(date);
}

export function tripStartDate(raw?: string | null): string | null {
  if (!raw || /ngày\s*•|linh hoạt/i.test(raw)) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const crossMonth = raw.match(/^(\d{1,2})\/(\d{1,2})\s*[-–]\s*\d{1,2}\/\d{1,2}/);
  if (crossMonth) {
    const year = raw.match(/\b\d{4}\b/)?.[0] || vietnamNow().date.slice(0, 4);
    return `${year}-${crossMonth[2].padStart(2, '0')}-${crossMonth[1].padStart(2, '0')}`;
  }
  const range = raw.match(/(?:Ngày\s*)?(\d+)\s*[-–]\s*\d+\s*(?:tháng|thg|\/)\s*(\d+)(?:,?\s*(\d{4}))?/i);
  const single = raw.match(/(?:Từ\s*)?(\d+)\s*(?:tháng|thg|\/)\s*(\d+)(?:,?\s*(\d{4}))?/i);
  const match = range || single;
  if (!match) return null;
  return `${match[3] || vietnamNow().date.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
}

export function tripRangeLabel(raw: string | null | undefined, days: number): string {
  const start = tripStartDate(raw);
  if (!start) return 'Linh hoạt';
  const end = dateAt(start, days - 1);
  const short = (value: string) => `${Number(value.slice(8))}/${Number(value.slice(5, 7))}`;
  return days === 1 ? short(start) : `${short(start)} – ${short(end)}`;
}
