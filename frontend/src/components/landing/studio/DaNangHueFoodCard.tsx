import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorialReveal } from './useEditorialReveal';
const miQuangBaseImg = '/images/landing/studio/dish_miquang_base_cutout.webp';
const miQuangLiftImg = '/images/landing/studio/dish_miquang_lift_cutout.webp';
const miQuangShrimpImg = '/images/landing/studio/dish_miquang_shrimp_cutout.webp';
const miQuangCrackerImg = '/images/landing/studio/dish_miquang_cracker_cutout.webp';
const miQuangHerbsImg = '/images/landing/studio/dish_miquang_herbs_cutout.webp';
const bunBoBaseImg = '/images/landing/studio/dish_bunbo_base_cutout.webp';
const bunBoLiftImg = '/images/landing/studio/dish_bunbo_lift_cutout.webp';
const bunBoBeef2Img = '/images/landing/studio/dish_bunbo_beef2_cutout.webp';
const bunBoNoodlesImg = '/images/landing/studio/dish_bunbo_noodles_cutout.webp';
const bunBoChiliImg = '/images/landing/studio/dish_bunbo_chili_cutout.webp';
const banhXeoBaseImg = '/images/landing/studio/dish_banhxeo_base_cutout.webp';
const banhXeoLiftImg = '/images/landing/studio/dish_banhxeo_lift_cutout.webp';
const banhXeoGreensImg = '/images/landing/studio/dish_banhxeo_greens_cutout.webp';
const banhXeoSproutsImg = '/images/landing/studio/dish_banhxeo_sprouts_cutout.webp';
const woodTabletopImg = '/images/landing/studio/food_wood_tabletop_1794746485193.webp';
const ginghamTableclothImg = '/images/landing/studio/gingham_tablecloth_spread_1794751770545.webp';
const nuocChamBowlImg = '/images/landing/studio/nuoc_cham_bowl_cutout.webp';
const dungMiQuangPhoto = '/images/landing/studio/eatery_dung_miquang.webp';
const meKeoBunBoPhoto = '/images/landing/studio/eatery_mekeo_bunbo.webp';
const baDuongBanhXeoPhoto = '/images/landing/studio/eatery_baduong_banhxeo.webp';

export type DishId = 'mi-quang' | 'bun-bo' | 'banh-xeo';

interface ReviewNote {
  kind: 'review' | 'tip';
  label: string;
  body: string;
  authorOrSource?: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

interface ExampleEatery {
  id: string;
  stopId: string;
  dayLabel: string;
  name: string;
  area: string;
  address: string;
  whyVisit: string;
  details: string;
  photoSrc: string;
  photoAlt: string;
  sourceNote: string;
  mapUrl: string;
  reviewNote: ReviewNote;
}

interface DishSpec {
  id: DishId;
  name: string;
  eateryCardPosClass: string;
  reviewCardPosClass: string;
  eatery: ExampleEatery;
}

interface DaNangHueFoodCardProps {
  onFindDish: (dish: string) => void;
  embedded?: boolean;
}

type BurstStyle = React.CSSProperties & {
  '--tx': string;
  '--ty': string;
  '--rot': string;
  '--s0': string;
  '--s1': string;
  '--delay': string;
  '--pmx': string;
  '--pmy': string;
};

const DISH_DATA: Record<DishId, DishSpec> = {
  'mi-quang': {
    id: 'mi-quang',
    name: 'Mì Quảng',
    eateryCardPosClass: 'sm:left-[-2%] sm:top-[1.5%] sm:w-[214px] lg:w-[222px]',
    reviewCardPosClass: 'sm:right-[1%] sm:top-[2.5%] sm:w-[198px] lg:w-[208px]',
    eatery: {
      id: 'mq-dung',
      stopId: 'food-mq-dung',
      dayLabel: 'Ngày 3 · Đà Nẵng',
      name: 'Mỳ Quảng Dung Đại Lộc',
      area: 'Sơn Trà · Đà Nẵng',
      address: '99 Nguyễn Thị Định, Sơn Trà, Đà Nẵng',
      whyVisit: 'Đậm vị chuẩn Đại Lộc, thuận đường ghé từ bán đảo Sơn Trà.',
      details:
        'Quán bình dân phục vụ đa dạng nhân gà ta, bò, cá lóc hay lươn, ăn kèm bánh tráng Đại Lộc giòn rụm và đĩa rau sống tươi.',
      photoSrc: dungMiQuangPhoto,
      photoAlt:
        'Mặt tiền thực tế quán Mỳ Quảng Dung Đại Lộc tại 99 Nguyễn Thị Định, Sơn Trà, Đà Nẵng',
      sourceNote: 'Ảnh thực tế: Beelerb (Wikimedia Commons, CC BY-SA 4.0)',
      mapUrl:
        'https://www.google.com/maps/search/?api=1&query=My+Quang+Dung+99+Nguyen+Thi+Dinh+Son+Tra+Da+Nang',
      reviewNote: {
        kind: 'tip',
        label: 'Gợi ý khi gọi món',
        body: 'Chọn tô mì gà ta hoặc cá lóc kho đậm vị, bẻ thêm bánh tráng mè nướng giòn và ăn kèm rổ rau sống Đà Nẵng.',
      },
    },
  },
  'bun-bo': {
    id: 'bun-bo',
    name: 'Bún bò Huế',
    eateryCardPosClass: 'sm:left-[-2%] sm:top-[1.5%] sm:w-[214px] lg:w-[222px]',
    reviewCardPosClass: 'sm:right-[1%] sm:top-[2.5%] sm:w-[202px] lg:w-[212px]',
    eatery: {
      id: 'bb-mekeo',
      stopId: 'food-bb-mekeo',
      dayLabel: 'Ngày 1 · Cố đô Huế',
      name: 'Bún bò Huế Mệ Kéo',
      area: 'Phú Cát · TP. Huế',
      address: '20 Bạch Đằng, Phú Cát, TP. Huế',
      whyVisit: 'Gánh bún bò hơn 70 năm bên đường Bạch Đằng, chỉ bán buổi sáng.',
      details:
        'Khách tự lấy tô bún trụng và rau trứ danh bên nồi nước dùng sôi sùng sục mùi sả và mắm ruốc; quán mở từ khoảng 6 giờ sáng và thường hết sớm.',
      photoSrc: meKeoBunBoPhoto,
      photoAlt:
        'Không gian gánh bún bò Mệ Kéo tại 20 Bạch Đằng, Huế với đôi quang gánh và nồi nước dùng nghi ngút khói',
      sourceNote: 'Ảnh & tư liệu: Khánh Quỳnh / VnExpress',
      mapUrl:
        'https://www.google.com/maps/search/?api=1&query=Bun+Bo+Hue+Me+Keo+20+Bach+Dang+Hue',
      reviewNote: {
        kind: 'tip',
        label: 'Gợi ý tham khảo',
        body: 'Nên kiểm tra lại địa chỉ, giờ bán và thực đơn trước khi ghé.',
        
        sourceLabel: 'VnExpress',
        sourceUrl:
          'https://vnexpress.net/quan-bun-bo-70-nam-o-hue-khach-tu-phuc-vu-bun-rau-3872317.html',
      },
    },
  },
  'banh-xeo': {
    id: 'banh-xeo',
    name: 'Bánh xèo',
    eateryCardPosClass: 'sm:right-[1%] sm:top-[1.5%] sm:w-[216px] lg:w-[224px]',
    reviewCardPosClass: 'sm:left-[-2%] sm:top-[2.5%] sm:w-[202px] lg:w-[214px]',
    eatery: {
      id: 'bx-baduong',
      stopId: 'food-bx-baduong',
      dayLabel: 'Ngày 3 · Đà Nẵng',
      name: 'Bánh xèo Bà Dưỡng',
      area: 'Hải Châu · Đà Nẵng',
      address: 'K280/[0.23] Hoàng Diệu, Hải Châu, Đà Nẵng',
      whyVisit: 'Quán hơn 30 năm trong kiệt Hoàng Diệu, đổ bánh giòn tại chỗ.',
      details:
        'Vỏ bánh giòn rụm pha màu nghệ, cuốn cùng nem lụi nướng thơm, rau sống và chấm bát tương đậu phộng – gan béo bùi đặc trưng (góp mặt trong danh sách Michelin Guide).',
      photoSrc: baDuongBanhXeoPhoto,
      photoAlt:
        'Bên trong gian bếp quán Bánh xèo Bà Dưỡng trong kiệt Hoàng Diệu đang đỏ lửa đổ bánh phục vụ thực khách',
      sourceNote: 'Ảnh & tư liệu: VnExpress · Michelin Guide',
      mapUrl:
        'https://www.google.com/maps/search/?api=1&query=Banh+Xeo+Ba+Duong+K280+23+Hoang+Dieu+Da+Nang',
      reviewNote: {
        kind: 'tip',
        label: 'Gợi ý tham khảo',
        body: 'Thoải mái tự cuốn bánh tráng cùng thịt nướng và rau thơm trên bàn; nước chấm thịt băm đậu phộng là thứ nhất định phải thử.',
        sourceLabel: 'MICHELIN Guide',
        sourceUrl:
          'https://guide.michelin.com/vn/en/da-nang-region/da-nang_2984390/restaurant/banh-xeo-ba-duong',
      },
    },
  },
};

export const DaNangHueFoodCard: React.FC<DaNangHueFoodCardProps> = ({
  onFindDish,
  embedded = false,
}) => {
  const [hoveredDish, setHoveredDish] = useState<DishId | null>(null);
  const [focusedDish, setFocusedDish] = useState<DishId | null>(null);
  const [pinnedDish, setPinnedDish] = useState<DishId | null>(null);
  const [expandedDetailsId, setExpandedDetailsId] = useState<string | null>(null);
  const [settledBurstDish, setSettledBurstDish] = useState<DishId | null>(null);
  const [confirmBounceDish, setConfirmBounceDish] = useState<DishId | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});

  const cardRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pointerDownRef = useRef(false);
  const closeHoverTimerRef = useRef<number | null>(null);
  const bounceTimerRef = useRef<number | null>(null);
  const { ref: revealRef, revealState } = useEditorialReveal<HTMLDivElement>();

  const activeDish = hoveredDish ?? focusedDish ?? pinnedDish;
  const activeSpec = activeDish ? DISH_DATA[activeDish] : null;

  const cancelCloseHoverTimer = useCallback(() => {
    if (closeHoverTimerRef.current !== null) {
      window.clearTimeout(closeHoverTimerRef.current);
      closeHoverTimerRef.current = null;
    }
  }, []);

  const clearAll = useCallback(() => {
    cancelCloseHoverTimer();
    setHoveredDish(null);
    setFocusedDish(null);
    setPinnedDish(null);
    setExpandedDetailsId(null);
    setSettledBurstDish(null);
  }, [cancelCloseHoverTimer]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (stageRef.current && !stageRef.current.contains(target)) {
        clearAll();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearAll();
        if (
          document.activeElement instanceof HTMLElement &&
          cardRef.current?.contains(document.activeElement)
        ) {
          document.activeElement.blur();
        }
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
      cancelCloseHoverTimer();
      if (bounceTimerRef.current !== null) {
        window.clearTimeout(bounceTimerRef.current);
      }
    };
  }, [clearAll, cancelCloseHoverTimer]);

  const scheduleHoverClear = (id: DishId) => {
    cancelCloseHoverTimer();
    closeHoverTimerRef.current = window.setTimeout(() => {
      setHoveredDish((prev) => (prev === id ? null : prev));
      setSettledBurstDish((prev) => (prev === id ? null : prev));
      closeHoverTimerRef.current = null;
    }, 240);
  };

  const handleDishPointerEnter = (id: DishId, pointerType: string) => {
    if (pointerType === 'touch') return;
    cancelCloseHoverTimer();
    setSettledBurstDish((prev) => (prev === id ? prev : null));
    setHoveredDish(id);
  };

  const handleDishPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'touch') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width - 0.5) * 2));
    const ny = Math.max(-1, Math.min(1, ((e.clientY - rect.top) / rect.height - 0.5) * 2));
    e.currentTarget.style.setProperty('--px', nx.toFixed(3));
    e.currentTarget.style.setProperty('--py', ny.toFixed(3));
  };

  const handleDishPointerLeave = (id: DishId, e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.style.setProperty('--px', '0');
    e.currentTarget.style.setProperty('--py', '0');
    if (e.pointerType === 'touch') return;
    scheduleHoverClear(id);
  };

  const handleFloatingCardEnter = (id: DishId, pointerType: string) => {
    if (pointerType === 'touch') return;
    cancelCloseHoverTimer();
    setHoveredDish(id);
  };

  const handleFloatingCardLeave = (id: DishId, pointerType: string) => {
    if (pointerType === 'touch') return;
    scheduleHoverClear(id);
  };

  const handleDishFocus = (id: DishId) => {
    if (!pointerDownRef.current) {
      setFocusedDish(id);
    }
    pointerDownRef.current = false;
  };

  const handleDishBlur = (id: DishId, e: React.FocusEvent<HTMLButtonElement>) => {
    pointerDownRef.current = false;
    const related = e.relatedTarget as Node | null;
    if (related && stageRef.current?.contains(related)) {
      const insideFloating = (related as Element)?.closest?.(
        `[data-food-eateries="${id}"], [data-food-eatery-card], [data-food-review-card]`,
      );
      if (insideFloating) return;
    }
    setFocusedDish((prev) => (prev === id ? null : prev));
  };

  const handleDishClick = (id: DishId, e: React.MouseEvent<HTMLButtonElement>) => {
    pointerDownRef.current = false;
    cancelCloseHoverTimer();
    setConfirmBounceDish(null);
    window.requestAnimationFrame(() => {
      setConfirmBounceDish(id);
    });
    if (bounceTimerRef.current !== null) {
      window.clearTimeout(bounceTimerRef.current);
    }
    bounceTimerRef.current = window.setTimeout(() => {
      setConfirmBounceDish(null);
    }, 220);

    if (pinnedDish === id) {
      clearAll();
      e.currentTarget.blur();
    } else {
      setSettledBurstDish(id);
      setFocusedDish(null);
      setExpandedDetailsId(null);
      setPinnedDish(id);
    }
  };

  const handleImageError = (key: string) => {
    setBrokenImages((prev) => ({ ...prev, [key]: true }));
  };

  const isMiQuangBurst =
    (hoveredDish === 'mi-quang' || focusedDish === 'mi-quang') &&
    settledBurstDish !== 'mi-quang';
  const isBunBoBurst =
    (hoveredDish === 'bun-bo' || focusedDish === 'bun-bo') &&
    settledBurstDish !== 'bun-bo';
  const isBanhXeoBurst =
    (hoveredDish === 'banh-xeo' || focusedDish === 'banh-xeo') &&
    settledBurstDish !== 'banh-xeo';

  const renderEateryCard = (spec: DishSpec, compactMobile = false) => {
    const eatery = spec.eatery;
    const isDetailsOpen = expandedDetailsId === eatery.id;

    return (
      <article
        key={`${eatery.id}-${compactMobile ? 'm' : 'd'}`}
        data-food-eatery-card={eatery.id}
        data-eatery-card={eatery.id}
        onPointerEnter={(e) => handleFloatingCardEnter(spec.id, e.pointerType)}
        onPointerLeave={(e) => handleFloatingCardLeave(spec.id, e.pointerType)}
        style={{ '--tray-delay': '135ms' } as React.CSSProperties}
        className={`food-tray-enter overflow-hidden rounded-2xl border border-[#17241e]/[0.15] bg-[#FFFDF8] shadow-[0_14px_34px_rgba(24,14,6,0.22),0_3px_10px_rgba(24,14,6,0.12)] ${
          compactMobile
            ? 'flex flex-row'
            : `hidden sm:flex sm:flex-col absolute z-40 ${spec.eateryCardPosClass}`
        }`}
      >
        <div
          className={`relative shrink-0 bg-[#E8E4D8] overflow-hidden ${
            compactMobile ? 'w-[72px]' : 'w-full h-[76px]'
          }`}
        >
          {!brokenImages[eatery.id] ? (
            <img loading="lazy" decoding="async"               src={eatery.photoSrc}
              alt={eatery.photoAlt}
              referrerPolicy="no-referrer"
              onError={() => handleImageError(eatery.id)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center p-2 text-[11px] font-medium text-[#42544b]">
              {eatery.name}
            </div>
          )}
        </div>

        <div className={`flex flex-1 flex-col justify-between ${compactMobile ? 'p-2' : 'p-2.5 sm:p-3'}`}>
          <div>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#7D4715]">
                Ví dụ tham khảo
              </p>
              <button
                type="button"
                data-food-close
                aria-label="Đóng thẻ quán"
                onClick={(e) => {
                  e.stopPropagation();
                  clearAll();
                }}
                className="shrink-0 whitespace-nowrap rounded px-1 py-0.5 text-[10.5px] font-semibold text-[#42544b] hover:bg-[#173D2C]/[0.08] hover:text-[#17241e]"
              >
                Đóng
              </button>
            </div>

            <h3 className="mt-0.5 text-[13px] sm:text-[14px] font-bold leading-snug tracking-[-0.015em] text-[#17241e]">
              {eatery.name}
            </h3>
            <p className="text-[10.5px] font-medium text-[#5A4B38]">{eatery.area}</p>

            {!compactMobile && (
              <>
                <p className="mt-1 text-[11.5px] leading-snug text-[#2D4438]">
                  {eatery.whyVisit}{' '}
                  <button
                    type="button"
                    aria-expanded={isDetailsOpen}
                    onClick={() =>
                      setExpandedDetailsId((prev) =>
                        prev === eatery.id ? null : eatery.id,
                      )
                    }
                    className="inline font-semibold text-[#1f6b49] underline-offset-2 hover:underline whitespace-nowrap"
                  >
                    {isDetailsOpen ? 'Thu gọn' : 'Chi tiết'}
                  </button>
                </p>

                {isDetailsOpen && (
                  <div className="mt-1.5 space-y-1 border-t border-[#17241e]/10 pt-1.5 text-[11px] leading-snug text-[#42544b]">
                    <p className="font-medium text-[#6C431C]">{eatery.address}</p>
                    <p>{eatery.details}</p>
                    <p className="text-[10px] text-[#5B6B62]">{eatery.sourceNote}</p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-[#17241e]/10 pt-2">
            <a
              href={eatery.mapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#1f6b49] underline-offset-2 hover:underline whitespace-nowrap shrink-0"
            >
              <span>Xem quán</span>
              <span aria-hidden="true">↗</span>
            </a>

            <button
              type="button"
              data-eatery-toggle={eatery.stopId}
              onClick={() => onFindDish(spec.name)}
              className="whitespace-nowrap shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors border border-[#17241e]/[0.24] bg-white text-[#17241e] hover:border-[#1f6b49] hover:text-[#1f6b49]"
            >
              Tìm món này
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderReviewCard = (spec: DishSpec, compactMobile = false) => {
    const note = spec.eatery.reviewNote;
    const isReview = note.kind === 'review';

    return (
      <aside
        key={`${spec.id}-review-${compactMobile ? 'm' : 'd'}`}
        data-food-review-card={spec.eatery.id}
        onPointerEnter={(e) => handleFloatingCardEnter(spec.id, e.pointerType)}
        onPointerLeave={(e) => handleFloatingCardLeave(spec.id, e.pointerType)}
        style={{ '--tray-delay': '205ms' } as React.CSSProperties}
        className={`food-tray-enter rounded-2xl border text-left shadow-[0_12px_28px_rgba(24,14,6,0.20)] ${
          isReview
            ? 'border-[#8E4A16]/[0.18] bg-[#FAF4E1]'
            : 'border-[#173D2C]/[0.18] bg-[#E8F4EC]'
        } ${
          compactMobile
            ? 'block px-2.5 py-2'
            : `hidden sm:block absolute z-40 px-3 py-2.5 ${spec.reviewCardPosClass}`
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p
            className={`text-[10px] sm:text-[10.5px] font-bold uppercase tracking-[0.05em] ${
              isReview ? 'text-[#7D4715]' : 'text-[#185237]'
            }`}
          >
            {note.label}
          </p>
        </div>

        <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-[12px] leading-[1.38] sm:leading-[1.42] text-[#17241e]">
          {isReview ? `“${note.body}”` : note.body}
        </p>

        {note.sourceUrl && note.sourceLabel && (
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#17241e]/10 pt-1.5 text-[10.5px]">
            {note.authorOrSource ? (
              <span className="font-medium text-[#4C4233]">{note.authorOrSource}</span>
            ) : (
              <span className="font-medium text-[#4C4233]">Nguồn đánh giá</span>
            )}
            <a
              href={note.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-semibold text-[#1f6b49] underline-offset-2 hover:underline whitespace-nowrap"
            >
              <span>{note.sourceLabel}</span>
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        )}
      </aside>
    );
  };

  return (
    <section
      className={
        embedded
          ? 'h-full w-full overflow-hidden p-0 m-0'
          : 'bg-[#F7F6EE] px-4 sm:px-8 lg:px-14 pb-16 sm:pb-24 pt-2'
      }
      aria-label="Khám phá ẩm thực Đà Nẵng – Huế"
    >
      <div className={embedded ? 'h-full w-full' : 'mx-auto max-w-6xl'}>
        <div
          ref={(node) => {
            cardRef.current = node;
            (revealRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
          }}
          data-reveal-state={revealState}
          onClick={(e) => {
            const target = e.target as Element;
            if (
              !target.closest('button') &&
              !target.closest('a') &&
              !target.closest('[data-food-eateries]') &&
              !target.closest('[data-food-eatery-card]') &&
              !target.closest('[data-food-review-card]')
            ) {
              clearAll();
            }
          }}
          className={
            embedded
              ? 'relative isolate overflow-hidden h-full w-full bg-[#DFBE93] text-[#113122]'
              : 'relative isolate overflow-hidden rounded-[28px] border border-[#173D2C]/[0.14] bg-[#DFBE93] text-[#113122] shadow-[0_24px_60px_rgba(20,46,36,0.12)]'
          }
        >
          {/* FULL-BLEED LIGHT OAK WOOD TABLETOP COVERING THE CARD */}
          {!brokenImages['wood-tabletop'] ? (
            <img loading="lazy" decoding="async"               data-food-wood-bg
              src={woodTabletopImg}
              alt="Mặt bàn gỗ sồi sáng vân mịn nhìn từ trên xuống"
              referrerPolicy="no-referrer"
              onError={() => handleImageError('wood-tabletop')}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-left brightness-[1.09] contrast-[0.95] saturate-[0.82]"
            />
          ) : (
            <div
              data-food-wood-bg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[#DFBE93]"
            />
          )}

          {/* Soft sunlit warmth blending with the existing upper-left wood highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none hidden lg:block absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 52% 92% at 17% 50%, rgba(252, 244, 226, 0.56) 0%, rgba(250, 238, 212, 0.28) 58%, rgba(250, 238, 212, 0) 100%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none lg:hidden absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(252, 244, 226, 0.60) 0%, rgba(250, 238, 212, 0.34) 36%, rgba(250, 238, 212, 0) 58%)',
            }}
          />

          {/* Tilted brick-red gingham cloth raised & sized so ALL 3 bowls sit completely on gingham squares */}
          {!brokenImages['gingham-cloth'] && (
            <div
              aria-hidden="true"
              data-food-cloth
              style={{
                transform: 'rotate(-12deg)',
                transformOrigin: '62% 55%',
                filter: 'drop-shadow(-6px 10px 15px rgba(48, 24, 10, 0.28))',
              }}
              className={`pointer-events-none absolute left-[8%] right-[-10%] top-[33%] bottom-[-18%] sm:left-[18%] sm:right-[-10%] sm:top-[20%] sm:bottom-[-20%] ${
                embedded
                  ? 'lg:left-[24%] lg:right-[-15%] lg:top-[-10%] lg:bottom-[-22%]'
                  : 'lg:left-[38%] lg:right-[-12%] lg:top-[-8%] lg:bottom-[-24%]'
              } z-[2]`}
            >
              <img loading="lazy" decoding="async"                 src={ginghamTableclothImg}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => handleImageError('gingham-cloth')}
                style={{
                  clipPath: 'inset(10.5% 0% 0% 6.5%)',
                }}
                className="block h-full w-full select-none object-cover brightness-[0.98] contrast-[0.92] saturate-[0.86]"
              />
            </div>
          )}

          {/* UNIFIED SCENE: Constant card height, zero bottom tray */}
          <div
            className={
              embedded
                ? 'relative z-10 flex h-full flex-col lg:flex-row'
                : 'relative z-10 flex min-h-[735px] sm:min-h-[550px] lg:min-h-[545px] flex-col lg:flex-row'
            }
          >
            {/* LEFT TYPOGRAPHY */}
            <div
              className={`relative z-20 flex flex-col justify-between px-6 pt-7 pb-3 sm:px-10 sm:pt-10 ${
                embedded
                  ? 'lg:w-[26%] lg:py-12 lg:pl-10 lg:pr-2'
                  : 'lg:w-[36.5%] lg:py-12 lg:pl-10 lg:pr-2'
              }`}
            >
              <p className="editorial-reveal-item editorial-reveal-title text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-[#7D3B0D]">
                Ăn gì ở Đà Nẵng – Huế?
              </p>

              <div className="my-5 sm:my-7 lg:my-auto lg:py-5">
                <h2
                  className={`editorial-reveal-item editorial-reveal-title font-bold tracking-[-0.03em] text-[#0F2F21] text-balance ${
                    embedded
                      ? 'text-[24px] sm:text-[28px] lg:text-[30px] leading-[1.15] max-w-[10ch]'
                      : 'text-[34px] sm:text-[42px] lg:text-[44px] leading-[1.06] max-w-[14ch]'
                  }`}
                >
                  Thèm món nào, ghé quán đó.
                </h2>
                {!embedded && (
                  <>
                    <p className="editorial-reveal-item editorial-reveal-body mt-3.5 max-w-[30ch] text-[15px] leading-relaxed text-[#1B3E2E]">
                      Chạm vào một món để xem ví dụ. Chọn “Tìm món này” để tra quán trong Khám phá, xem thông tin rồi thêm vào chuyến đi sau khi đăng nhập.
                    </p>

                    <p className="editorial-reveal-item editorial-reveal-cta mt-4 sm:mt-6 min-h-[2.65rem] sm:min-h-0 text-[13px] font-semibold text-[#234736]">
                      {activeSpec
                        ? `Đang mở quán gợi ý cho ${activeSpec.name} · Chọn món khác để đổi quán.`
                        : 'Chọn món để xem quán gợi ý.'}
                    </p>
                  </>
                )}
              </div>

              <div className="hidden lg:block" aria-hidden="true" />
            </div>

            {/* RIGHT / LOWER UPRIGHT TABLETOP DISH STAGE */}
            <div
              ref={stageRef}
              data-food-stage
              className="relative z-20 flex-1 min-h-[480px] sm:min-h-[430px] lg:min-h-0"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  clearAll();
                }
              }}
            >
              {/* Stationary small ceramic dipping sauce bowl beside Bánh xèo */}
              {!brokenImages['nuoc-cham-bowl'] && (
                <div
                  aria-hidden="true"
                  data-food-anchor-bowl
                  className={`pointer-events-none absolute z-[8] ${
                    embedded
                      ? 'left-[45%] top-[71%] sm:left-[45%] sm:top-[70%] w-[12%] max-w-[84px]'
                      : 'left-[49.5%] top-[80.5%] sm:left-[50.5%] sm:top-[76.5%] w-[10%] max-w-[66px]'
                  }`}
                >
                  <div className="relative w-full">
                    <div
                      className="pointer-events-none absolute inset-[8%] rounded-full bg-[#4A2B16]/[0.26]"
                      style={{ transform: 'translate3d(4px, 5px, 0)', filter: 'blur(5px)' }}
                    />
                    <div
                      className="pointer-events-none absolute inset-[11%] rounded-full bg-[#3A2212]/[0.42]"
                      style={{ transform: 'translate3d(1px, 2px, 0)', filter: 'blur(1.5px)' }}
                    />
                    <img loading="lazy" decoding="async"                       src={nuocChamBowlImg}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={() => handleImageError('nuoc-cham-bowl')}
                      className="relative block h-auto w-full select-none"
                    />
                  </div>
                </div>
              )}

              {/* 1. BÚN BÒ HUẾ */}
              <button
                type="button"
                data-dish-btn="bun-bo"
                aria-pressed={pinnedDish === 'bun-bo'}
                aria-label="Chọn Bún bò Huế để xem quán gợi ý"
                onPointerDown={() => {
                  pointerDownRef.current = true;
                }}
                onPointerEnter={(e) => handleDishPointerEnter('bun-bo', e.pointerType)}
                onPointerMove={handleDishPointerMove}
                onPointerLeave={(e) => handleDishPointerLeave('bun-bo', e)}
                onFocus={() => handleDishFocus('bun-bo')}
                onBlur={(e) => handleDishBlur('bun-bo', e)}
                onClick={(e) => handleDishClick('bun-bo', e)}
                className={`dish-stage-btn group absolute z-10 flex flex-col items-center p-1 text-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173D2C] ${
                  embedded
                    ? 'left-[24%] top-[1%] sm:left-[22%] sm:top-[2%] w-[42%] sm:w-[46%] lg:max-w-[335px]'
                    : 'left-[36%] top-[41%] sm:left-[30%] sm:top-[6%] w-[34%] sm:w-[39%] lg:max-w-[258px]'
                } ${
                  isBunBoBurst
                    ? 'is-lifted z-30'
                    : activeDish === 'bun-bo'
                    ? 'is-selected-idle z-25'
                    : ''
                }`}
              >
                <div className="relative w-full">
                  <div
                    aria-hidden="true"
                    className="dish-shadow-cast pointer-events-none absolute inset-[10%] rounded-full bg-[#4C2E19]/30"
                  />
                  <div
                    aria-hidden="true"
                    className="dish-shadow-contact pointer-events-none absolute inset-[13%] rounded-full bg-[#3A2212]/[0.54]"
                  />

                  <div
                    className={`dish-vessel-confirm ${
                      confirmBounceDish === 'bun-bo' ? 'is-confirm-bounce' : ''
                    }`}
                  >
                    <div className="dish-vessel-lift">
                      <div className="dish-vessel-parallax relative">
                        {!brokenImages['bunbo-base'] ? (
                          <img loading="lazy" decoding="async"                             src={bunBoBaseImg}
                            alt="Tô bún bò Huế nước dùng đỏ cam với bún, chả và bắp bò"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('bunbo-base')}
                            className="relative block h-auto w-full select-none pointer-events-none"
                          />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center rounded-full border border-[#173D2C]/25 bg-[#FFFDF8] text-xs font-semibold text-[#173D2C]">
                            Bún bò Huế
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!brokenImages['bunbo-noodles'] && (
                    <div className="pointer-events-none absolute left-[26%] top-[18%] z-20 w-[44%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '2px',
                            '--ty': '-24px',
                            '--rot': '-8deg',
                            '--s0': '0.46',
                            '--s1': '0.88',
                            '--delay': '118ms',
                            '--pmx': '9px',
                            '--pmy': '7.4px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={bunBoNoodlesImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('bunbo-noodles')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[5px_12px_10px_rgba(52,30,15,0.34)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['bunbo-lift'] && (
                    <div className="pointer-events-none absolute left-[18%] top-[28%] z-30 w-[34%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '-18px',
                            '--ty': '-26px',
                            '--rot': '-20deg',
                            '--s0': '0.45',
                            '--s1': '0.88',
                            '--delay': '146ms',
                            '--pmx': '7.6px',
                            '--pmy': '6.2px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={bunBoLiftImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('bunbo-lift')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[5px_12px_9px_rgba(52,30,15,0.36)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['bunbo-beef2'] && (
                    <div className="pointer-events-none absolute left-[45%] top-[22%] z-30 w-[33%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '44px',
                            '--ty': '-22px',
                            '--rot': '18deg',
                            '--s0': '0.44',
                            '--s1': '0.85',
                            '--delay': '172ms',
                            '--pmx': '8.2px',
                            '--pmy': '6.8px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={bunBoBeef2Img}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('bunbo-beef2')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[5px_13px_9px_rgba(52,30,15,0.36)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['bunbo-chili'] && (
                    <div className="pointer-events-none absolute left-[48%] top-[44%] z-20 w-[29%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '50px',
                            '--ty': '-2px',
                            '--rot': '22deg',
                            '--s0': '0.42',
                            '--s1': '0.84',
                            '--delay': '198ms',
                            '--pmx': '6.5px',
                            '--pmy': '5.4px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={bunBoChiliImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('bunbo-chili')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[4px_10px_8px_rgba(52,30,15,0.32)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <span
                  className={`mt-1 inline-block rounded-[5px] bg-[#FAF2DE]/[0.94] px-2.5 py-0.5 text-[11.5px] sm:text-[13px] font-semibold whitespace-nowrap shadow-[0_2px_8px_rgba(32,18,10,0.16)] transition-colors duration-200 ${
                    activeDish === 'bun-bo'
                      ? 'border-b-2 border-[#8E4A16] bg-[#FFFDF8] text-[#173D2C]'
                      : 'border-b border-[#173D2C]/[0.35] text-[#173D2C]'
                  }`}
                >
                  Bún bò Huế
                </span>
              </button>

              {/* 2. MÌ QUẢNG */}
              <button
                type="button"
                data-dish-btn="mi-quang"
                aria-pressed={pinnedDish === 'mi-quang'}
                aria-label="Chọn Mì Quảng để xem quán gợi ý"
                onPointerDown={() => {
                  pointerDownRef.current = true;
                }}
                onPointerEnter={(e) => handleDishPointerEnter('mi-quang', e.pointerType)}
                onPointerMove={handleDishPointerMove}
                onPointerLeave={(e) => handleDishPointerLeave('mi-quang', e)}
                onFocus={() => handleDishFocus('mi-quang')}
                onBlur={(e) => handleDishBlur('mi-quang', e)}
                onClick={(e) => handleDishClick('mi-quang', e)}
                className={`dish-stage-btn group absolute z-20 flex flex-col items-center p-1 text-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173D2C] ${
                  embedded
                    ? 'left-[5%] bottom-[2%] sm:left-[6%] sm:bottom-[2%] w-[45%] sm:w-[49%] lg:max-w-[350px]'
                    : 'left-[8%] bottom-[3%] sm:left-[16%] sm:bottom-[3%] w-[37%] sm:w-[40%] lg:max-w-[266px]'
                } ${
                  isMiQuangBurst
                    ? 'is-lifted z-30'
                    : activeDish === 'mi-quang'
                    ? 'is-selected-idle z-25'
                    : ''
                }`}
              >
                <div className="relative w-full">
                  <div
                    aria-hidden="true"
                    className="dish-shadow-cast pointer-events-none absolute inset-[10%] rounded-full bg-[#4C2E19]/30"
                  />
                  <div
                    aria-hidden="true"
                    className="dish-shadow-contact pointer-events-none absolute inset-[13%] rounded-full bg-[#3A2212]/[0.54]"
                  />

                  <div
                    className={`dish-vessel-confirm ${
                      confirmBounceDish === 'mi-quang' ? 'is-confirm-bounce' : ''
                    }`}
                  >
                    <div className="dish-vessel-lift">
                      <div className="dish-vessel-parallax relative">
                        {!brokenImages['miquang-base'] ? (
                          <img loading="lazy" decoding="async"                             src={miQuangBaseImg}
                            alt="Tô mì Quảng sợi mì vàng nghệ với tôm, thịt, trứng cút và bánh tráng mè"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('miquang-base')}
                            className="relative block h-auto w-full select-none pointer-events-none"
                          />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center rounded-full border border-[#173D2C]/25 bg-[#FFFDF8] text-xs font-semibold text-[#173D2C]">
                            Mì Quảng
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!brokenImages['miquang-herbs'] && (
                    <div className="pointer-events-none absolute left-[24%] top-[16%] z-10 w-[26%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '-16px',
                            '--ty': '-54px',
                            '--rot': '-14deg',
                            '--s0': '0.42',
                            '--s1': '0.88',
                            '--delay': '190ms',
                            '--pmx': '6px',
                            '--pmy': '5px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={miQuangHerbsImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('miquang-herbs')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[5px_12px_9px_rgba(52,30,15,0.32)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['miquang-shrimp'] && (
                    <div className="pointer-events-none absolute left-[20%] top-[24%] z-20 w-[25%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '-58px',
                            '--ty': '-28px',
                            '--rot': '-24deg',
                            '--s0': '0.45',
                            '--s1': '0.92',
                            '--delay': '145ms',
                            '--pmx': '8.5px',
                            '--pmy': '7px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={miQuangShrimpImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('miquang-shrimp')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[5px_13px_10px_rgba(52,30,15,0.34)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['miquang-cracker'] && (
                    <div className="pointer-events-none absolute left-[48%] top-[34%] z-20 w-[26%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '54px',
                            '--ty': '-38px',
                            '--rot': '22deg',
                            '--s0': '0.45',
                            '--s1': '0.88',
                            '--delay': '165ms',
                            '--pmx': '8px',
                            '--pmy': '6.5px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={miQuangCrackerImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('miquang-cracker')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[5px_12px_9px_rgba(52,30,15,0.34)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['miquang-lift'] && (
                    <div className="pointer-events-none absolute left-[27%] top-[10%] z-30 w-[44%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '2px',
                            '--ty': '-58px',
                            '--rot': '-4deg',
                            '--s0': '0.48',
                            '--s1': '1.02',
                            '--delay': '118ms',
                            '--pmx': '10px',
                            '--pmy': '8.2px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={miQuangLiftImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('miquang-lift')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[6px_16px_12px_rgba(52,30,15,0.38)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <span
                  className={`mt-1 inline-block rounded-[5px] bg-[#FAF2DE]/[0.94] px-2.5 py-0.5 text-[11.5px] sm:text-[13px] font-semibold whitespace-nowrap shadow-[0_2px_8px_rgba(32,18,10,0.16)] transition-colors duration-200 ${
                    activeDish === 'mi-quang'
                      ? 'border-b-2 border-[#8E4A16] bg-[#FFFDF8] text-[#173D2C]'
                      : 'border-b border-[#173D2C]/[0.35] text-[#173D2C]'
                  }`}
                >
                  Mì Quảng
                </span>
              </button>

              {/* 3. BÁNH XÈO */}
              <button
                type="button"
                data-dish-btn="banh-xeo"
                aria-pressed={pinnedDish === 'banh-xeo'}
                aria-label="Chọn Bánh xèo để xem quán gợi ý"
                onPointerDown={() => {
                  pointerDownRef.current = true;
                }}
                onPointerEnter={(e) => handleDishPointerEnter('banh-xeo', e.pointerType)}
                onPointerMove={handleDishPointerMove}
                onPointerLeave={(e) => handleDishPointerLeave('banh-xeo', e)}
                onFocus={() => handleDishFocus('banh-xeo')}
                onBlur={(e) => handleDishBlur('banh-xeo', e)}
                onClick={(e) => handleDishClick('banh-xeo', e)}
                className={`dish-stage-btn group absolute z-15 flex flex-col items-center p-1 text-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#173D2C] ${
                  embedded
                    ? 'left-[50%] top-[40%] sm:left-[49%] sm:top-[38%] w-[44%] sm:w-[48%] lg:max-w-[340px]'
                    : 'left-[57%] top-[61%] sm:left-[57.5%] sm:top-[50%] w-[35%] sm:w-[40%] lg:max-w-[266px]'
                } ${
                  isBanhXeoBurst
                    ? 'is-lifted z-30'
                    : activeDish === 'banh-xeo'
                    ? 'is-selected-idle z-25'
                    : ''
                }`}
              >
                <div className="relative w-full">
                  <div
                    aria-hidden="true"
                    className="dish-shadow-cast pointer-events-none absolute inset-[10%] rounded-full bg-[#4C2E19]/30"
                  />
                  <div
                    aria-hidden="true"
                    className="dish-shadow-contact pointer-events-none absolute inset-[13%] rounded-full bg-[#3A2212]/[0.54]"
                  />

                  <div
                    className={`dish-vessel-confirm ${
                      confirmBounceDish === 'banh-xeo' ? 'is-confirm-bounce' : ''
                    }`}
                  >
                    <div className="dish-vessel-lift">
                      <div className="dish-vessel-parallax relative">
                        {!brokenImages['banhxeo-base'] ? (
                          <img loading="lazy" decoding="async"                             src={banhXeoBaseImg}
                            alt="Đĩa bánh xèo vàng giòn kèm tôm giá và rau sống"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('banhxeo-base')}
                            className="relative block h-auto w-full select-none pointer-events-none"
                          />
                        ) : (
                          <div className="flex aspect-square w-full items-center justify-center rounded-full border border-[#173D2C]/25 bg-[#FFFDF8] text-xs font-semibold text-[#173D2C]">
                            Bánh xèo
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {!brokenImages['banhxeo-lift'] && (
                    <div className="pointer-events-none absolute left-[22%] top-[24%] z-30 w-[50%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '12px',
                            '--ty': '-26px',
                            '--rot': '16deg',
                            '--s0': '0.50',
                            '--s1': '0.94',
                            '--delay': '118ms',
                            '--pmx': '9px',
                            '--pmy': '7.2px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={banhXeoLiftImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('banhxeo-lift')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[5px_13px_10px_rgba(52,30,15,0.36)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['banhxeo-greens'] && (
                    <div className="pointer-events-none absolute left-[52%] top-[22%] z-20 w-[36%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '16px',
                            '--ty': '-30px',
                            '--rot': '18deg',
                            '--s0': '0.44',
                            '--s1': '0.88',
                            '--delay': '155ms',
                            '--pmx': '7.5px',
                            '--pmy': '6px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={banhXeoGreensImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('banhxeo-greens')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[4px_11px_9px_rgba(52,30,15,0.32)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {!brokenImages['banhxeo-sprouts'] && (
                    <div className="pointer-events-none absolute left-[18%] top-[40%] z-20 w-[33%]">
                      <div
                        className="dish-burst-x"
                        style={
                          {
                            '--tx': '-44px',
                            '--ty': '6px',
                            '--rot': '-18deg',
                            '--s0': '0.44',
                            '--s1': '0.86',
                            '--delay': '182ms',
                            '--pmx': '7.2px',
                            '--pmy': '5.8px',
                          } as BurstStyle
                        }
                      >
                        <div className="dish-burst-y">
                          <img loading="lazy" decoding="async"                             src={banhXeoSproutsImg}
                            alt=""
                            aria-hidden="true"
                            referrerPolicy="no-referrer"
                            onError={() => handleImageError('banhxeo-sprouts')}
                            className="dish-ingredient-parallax block h-auto w-full select-none drop-shadow-[4px_11px_9px_rgba(52,30,15,0.32)]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <span
                  className={`mt-1 inline-block rounded-[5px] bg-[#FAF2DE]/[0.94] px-2.5 py-0.5 text-[11.5px] sm:text-[13px] font-semibold whitespace-nowrap shadow-[0_2px_8px_rgba(32,18,10,0.16)] transition-colors duration-200 ${
                    activeDish === 'banh-xeo'
                      ? 'border-b-2 border-[#8E4A16] bg-[#FFFDF8] text-[#173D2C]'
                      : 'border-b border-[#173D2C]/[0.35] text-[#173D2C]'
                  }`}
                >
                  Bánh xèo
                </span>
              </button>

              {/* DESKTOP / TABLET DUAL FLOATING CARDS AROUND THE DISH */}
              {activeSpec && (
                <div
                  key={`floating-eateries-${activeSpec.id}`}
                  data-food-eateries={activeSpec.id}
                  role="region"
                  aria-label={`Quán gợi ý và nhận xét cho ${activeSpec.name}`}
                  className="pointer-events-none hidden sm:block absolute inset-0 z-40"
                >
                  <div className="pointer-events-auto">{renderEateryCard(activeSpec, false)}</div>
                  <div className="pointer-events-auto">{renderReviewCard(activeSpec, false)}</div>
                </div>
              )}

              {/* MOBILE DUAL COMPACT CARDS IN UPPER CLEARING ABOVE BOWLS (ZERO HEIGHT SHIFT) */}
              {activeSpec && (
                <div
                  key={`floating-eateries-mob-${activeSpec.id}`}
                  data-food-eateries-mobile={activeSpec.id}
                  role="region"
                  aria-label={`Quán gợi ý cho ${activeSpec.name}`}
                  className="sm:hidden absolute inset-x-2.5 top-1 z-40 space-y-1.5"
                >
                  {renderEateryCard(activeSpec, true)}
                  {renderReviewCard(activeSpec, true)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
