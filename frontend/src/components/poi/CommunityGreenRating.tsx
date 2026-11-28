import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Leaf, RefreshCw } from 'lucide-react';
import { getCommunityGreenRating } from '@/services/communityGreenReviews';
import { COMMUNITY_GREEN_CRITERIA, type CommunityGreenAggregate, type CommunityGreenCriterion } from '@/utils/communityGreen';

const LABELS: Record<CommunityGreenCriterion, string> = {
  cleanliness_waste: 'V\u1ec7 sinh v\u00e0 r\u00e1c th\u1ea3i',
  single_use_plastic: 'Nh\u1ef1a d\u00f9ng m\u1ed9t l\u1ea7n',
  ecosystem_protection: 'C\u1ea3nh quan v\u00e0 h\u1ec7 sinh th\u00e1i',
  responsible_management: 'Qu\u1ea3n l\u00fd c\u00f3 tr\u00e1ch nhi\u1ec7m',
};
const COPY = {
  title: '\u0110\u00e1nh gi\u00e1 m\u00f4i tr\u01b0\u1eddng c\u1ed9ng \u0111\u1ed3ng GreenTrip',
  disclaimer: '\u0110\u00e2y l\u00e0 ph\u1ea3n h\u1ed3i do du kh\u00e1ch t\u1ef1 khai b\u00e1o, kh\u00f4ng ph\u1ea3i ch\u1ee9ng nh\u1eadn m\u00f4i tr\u01b0\u1eddng.',
  loadError: 'Ch\u01b0a t\u1ea3i \u0111\u01b0\u1ee3c \u0111\u00e1nh gi\u00e1 c\u1ed9ng \u0111\u1ed3ng.',
  retry: 'Th\u1eed t\u1ea3i l\u1ea1i',
  loading: '\u0110ang t\u1ea3i \u0111\u00e1nh gi\u00e1 m\u00f4i tr\u01b0\u1eddng',
  noScores: 'Ch\u01b0a c\u00f3 \u0111\u00e1nh gi\u00e1 c\u00f3 \u0111i\u1ec3m. B\u1ea1n c\u00f3 th\u1ec3 chia s\u1ebb sau khi tr\u1ef1c ti\u1ebfp gh\u00e9 th\u0103m.',
  reviews: 'l\u01b0\u1ee3t \u0111\u00e1nh gi\u00e1 c\u00f3 \u0111i\u1ec3m',
  feedback: 'l\u01b0\u1ee3t ph\u1ea3n h\u1ed3i',
  scores: '\u0110i\u1ec3m theo ti\u00eau ch\u00ed',
};

export default function CommunityGreenRating({poiId}: {poiId: string}) {
  const [aggregate, setAggregate] = useState<CommunityGreenAggregate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    setError(false);
    try {
      const result = await getCommunityGreenRating(poiId, signal);
      if (!signal.aborted) setAggregate(result);
    } catch {
      if (!signal.aborted) setError(true);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [poiId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, attempt]);

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4" aria-labelledby="community-green-rating-title" aria-busy={loading}>
      <h2 id="community-green-rating-title" className="flex items-center gap-2 text-base font-bold text-neutral-950">
        <Leaf size={17} aria-hidden="true" /> {COPY.title}
      </h2>
      <p className="mt-1 text-sm text-neutral-700">{COPY.disclaimer}</p>
      {loading ? (
        <div className="mt-3 space-y-2" role="status" aria-label={COPY.loading}>
          <div className="h-6 w-40 animate-pulse rounded bg-emerald-100" />
          <div className="h-4 w-full animate-pulse rounded bg-emerald-100" />
        </div>
      ) : error ? (
        <div className="mt-3" role="alert">
          <p className="flex items-center gap-2 text-sm text-red-800"><AlertTriangle size={16} aria-hidden="true" />{COPY.loadError}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)} className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">
            <RefreshCw size={14} aria-hidden="true" /> {COPY.retry}
          </button>
        </div>
      ) : aggregate ? (
        <>
          {aggregate.community_green_score == null ? (
            <p className="mt-3 text-sm text-neutral-700" role="status">{COPY.noScores}</p>
          ) : (
            <p className="mt-3 text-neutral-900">
              <strong className="text-2xl tabular-nums">{aggregate.community_green_score.toLocaleString('vi-VN', {maximumFractionDigits: 1})}</strong>
              <span className="text-sm"> / 5 · {aggregate.review_count} {COPY.reviews}</span>
            </p>
          )}
          {aggregate.feedback_count > aggregate.review_count && <p className="mt-1 text-sm text-neutral-700">{aggregate.feedback_count} {COPY.feedback}</p>}
          <p className="mt-2 text-sm font-semibold text-neutral-800">{COPY.scores}</p>
          <dl className="mt-1 grid gap-1 sm:grid-cols-2">
            {COMMUNITY_GREEN_CRITERIA.map((key) => {
              const score = aggregate.criterion_average_scores[key];
              const count = aggregate.criterion_review_counts[key];
              if (count === 0) return null;
              return <div key={key} className="flex justify-between gap-3 text-sm text-neutral-700"><dt>{LABELS[key]}</dt><dd className="shrink-0 font-medium text-neutral-900">{score?.toLocaleString('vi-VN', {maximumFractionDigits: 1})} / 5 <span className="font-normal">({count})</span></dd></div>;
            })}
          </dl>
          <p className="mt-2 text-sm text-neutral-700">{aggregate.sample_note}</p>
        </>
      ) : null}
    </section>
  );
}
