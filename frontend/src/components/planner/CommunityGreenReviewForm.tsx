import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle } from 'lucide-react';
import { getOwnCommunityGreenReview, saveCommunityGreenReview } from '@/services/communityGreenReviews';
import { COMMUNITY_GREEN_CRITERIA, communityGreenCriteriaFor, type CommunityGreenAggregate, type CommunityGreenCriterion, type CommunityGreenReview, type CommunityGreenScores } from '@/utils/communityGreen';

interface Props {
  poiId: string;
  poiName: string;
  category: string;
  subCategory?: string | null;
  tripId: string;
  stopId: string;
  onClose: () => void;
  onSaved: (aggregate: CommunityGreenAggregate) => void;
}

const CRITERION_LABEL: Record<CommunityGreenCriterion, {title: string; question: string}> = {
  cleanliness_waste: {title: 'Vệ sinh và rác thải', question: 'Khu vực có sạch và rác được thu gom hợp lý không?'},
  single_use_plastic: {title: 'Hạn chế nhựa dùng một lần', question: 'Địa điểm có hạn chế nhựa hoặc khuyến khích lựa chọn thay thế không?'},
  ecosystem_protection: {title: 'Bảo vệ cảnh quan và hệ sinh thái', question: 'Cây xanh, thiên nhiên hoặc không gian di sản có được gìn giữ không?'},
  responsible_management: {title: 'Hoạt động có trách nhiệm', question: 'Bạn có quan sát được hướng dẫn hay biện pháp bảo vệ môi trường không?'},
};
const RATING_LABEL = ['Rất kém', 'Kém', 'Bình thường', 'Tốt', 'Rất tốt'];
const EMPTY_SCORES: CommunityGreenScores = {
  cleanliness_waste: null,
  single_use_plastic: null,
  ecosystem_protection: null,
  responsible_management: null,
};

export default function CommunityGreenReviewForm({poiId, poiName, category, subCategory, tripId, stopId, onClose, onSaved}: Props) {
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState<CommunityGreenReview | null>(null);
  const [scores, setScores] = useState<CommunityGreenScores>(EMPTY_SCORES);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setSuccess('');
    setReview(null);
    setScores(EMPTY_SCORES);
    setComment('');
    getOwnCommunityGreenReview(poiId, controller.signal)
      .then(({review: existing}) => {
        if (controller.signal.aborted) return;
        setReview(existing);
        if (existing) {
          setScores(Object.fromEntries(COMMUNITY_GREEN_CRITERIA.map((key) => [key, existing[key]])) as CommunityGreenScores);
          setComment(existing.comment || '');
        } else {
          setScores(EMPTY_SCORES);
          setComment('');
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Chưa tải được đánh giá của bạn.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [poiId, loadAttempt]);

  const visibleCriteria = useMemo(() => {
    const visible = new Set(communityGreenCriteriaFor(category, subCategory));
    COMMUNITY_GREEN_CRITERIA.forEach((key) => { if (review?.[key] != null) visible.add(key); });
    return COMMUNITY_GREEN_CRITERIA.filter((key) => visible.has(key));
  }, [category, subCategory, review]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await saveCommunityGreenReview(poiId, {
        trip_id: tripId,
        stop_id: stopId,
        ...scores,
        comment: comment.trim() || null,
        ...(review ? {expected_version: review.review_version} : {}),
      });
      setReview(result.review);
      setSuccess('Đã lưu đánh giá môi trường của bạn.');
      onSaved(result.aggregate);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Chưa lưu được đánh giá. Nội dung vẫn được giữ để bạn thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4" aria-labelledby="community-review-title" aria-busy={loading || saving}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 id="community-review-title" className="text-base font-semibold text-neutral-950">Đánh giá môi trường · {poiName}</h4>
          <p className="mt-1 text-sm text-neutral-700">Chia sẻ điều bạn trực tiếp quan sát được. Lượt ghé thăm là tự khai báo, chưa được xác minh.</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-10 min-w-10 rounded-full border border-neutral-300 bg-white px-3 text-sm font-semibold text-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" aria-label="Đóng biểu mẫu đánh giá">Đóng</button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-3" role="status" aria-label="Đang tải đánh giá">
          <div className="h-5 animate-pulse rounded bg-neutral-200" />
          <div className="h-16 animate-pulse rounded-xl bg-neutral-200" />
          <span className="sr-only">Đang tải đánh giá của bạn…</span>
        </div>
      ) : error && !review && !success ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-white p-3" role="alert">
          <p className="flex items-start gap-2 text-sm text-red-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />{error}</p>
          <button type="button" onClick={() => setLoadAttempt((value) => value + 1)} className="mt-3 min-h-10 rounded-full border border-neutral-300 px-4 text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black">Thử tải lại</button>
        </div>
      ) : (
        <>
          {!review && <p className="mt-3 text-sm text-neutral-700" role="status">Bạn chưa gửi đánh giá môi trường cho địa điểm này.</p>}
          {review && <p className="mt-3 text-sm text-neutral-700">Bạn đã đánh giá địa điểm này. Có thể cập nhật câu trả lời của mình.</p>}
          <form className="mt-4 space-y-4" onSubmit={(event) => void submit(event)}>
            {visibleCriteria.map((key) => (
              <fieldset key={key} className="rounded-xl border border-neutral-200 bg-white p-3">
                <legend className="px-1 text-sm font-semibold text-neutral-900">{CRITERION_LABEL[key].title}</legend>
                <p className="mt-1 text-sm text-neutral-700">{CRITERION_LABEL[key].question}</p>
                <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={CRITERION_LABEL[key].title}>
                  {RATING_LABEL.map((label, index) => {
                    const value = index + 1;
                    const selected = scores[key] === value;
                    return <button key={value} type="button" aria-pressed={selected} aria-label={`${value} trên 5: ${label}`} onClick={() => setScores((current) => ({...current, [key]: value}))} className={`min-h-11 min-w-11 rounded-full border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${selected ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 bg-white text-neutral-900'}`}>{value}</button>;
                  })}
                  <button type="button" aria-pressed={scores[key] === null} onClick={() => setScores((current) => ({...current, [key]: null}))} className={`min-h-11 rounded-full border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black ${scores[key] === null ? 'border-neutral-700 bg-neutral-100 text-neutral-950' : 'border-neutral-300 bg-white text-neutral-800'}`}>Không quan sát được</button>
                </div>
              </fieldset>
            ))}
            <label className="grid gap-1.5 text-sm font-medium text-neutral-900" htmlFor="community-green-comment">Ghi chú thêm (tùy chọn)
              <textarea id="community-green-comment" maxLength={500} rows={3} value={comment} onChange={(event) => setComment(event.target.value)} className="min-h-24 rounded-xl border border-neutral-300 bg-white p-3 text-sm font-normal text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black" aria-describedby="community-green-comment-help" />
            </label>
            <p id="community-green-comment-help" className="text-sm text-neutral-700">Không chia sẻ thông tin cá nhân hoặc vị trí chính xác. {comment.length}/500 ký tự.</p>
            {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
            {success && <p className="text-sm text-emerald-800" role="status">{success}</p>}
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 disabled:opacity-60">
                {saving && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{review ? 'Lưu chỉnh sửa' : 'Gửi đánh giá'}
              </button>
              <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-full border border-neutral-300 bg-white px-5 text-sm font-semibold text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black disabled:opacity-60">Để sau</button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
