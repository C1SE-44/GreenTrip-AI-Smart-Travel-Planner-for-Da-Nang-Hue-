import React, { useEffect, useRef, useState } from 'react';
import { useEditorialReveal } from './useEditorialReveal';
const windshieldDuskImg = '/images/landing/studio/planner_windshield_dusk_bg_1794757650594.webp';
const paperClipsSheetImg = '/images/landing/studio/planner_ivory_paper_clips_cutout.webp';
const cauRongImg = '/images/landing/studio/plan_caurong_river_real.webp';
const haiVanImg = '/images/landing/studio/plan_haivan_pass_real.webp';
const banhEpImg = '/images/landing/studio/plan_banhep_closeup.webp';
const thienMuImg = '/images/landing/studio/plan_thienmu_tower_crop.webp';

interface TripPlannerCardProps {
  onStartPlanning: () => void;
  embedded?: boolean;
}

export type PlannerStopId = 'cau-rong' | 'deo-hai-van' | 'banh-ep-hue' | 'chua-thien-mu';

interface MilestoneSpec {
  id: PlannerStopId;
  status: 'done' | 'next';
  sheetText: string;
  sheetMeta?: string;
  roadLabel: string;
  nextTag?: string;
  photoSrc: string;
  photoAlt: string;
  objectPosition: string;
  tiltDeg: string;
}

const MILESTONES: MilestoneSpec[] = [
  {
    id: 'cau-rong',
    status: 'done',
    sheetText: 'Check-in Cầu Rồng',
    roadLabel: 'Cầu Rồng',
    photoSrc: cauRongImg,
    photoAlt: 'Cầu Rồng vòm vàng vươn nhịp qua sông Hàn vào ban ngày',
    objectPosition: '36% 50%',
    tiltDeg: '-1.6deg',
  },
  {
    id: 'deo-hai-van',
    status: 'done',
    sheetText: 'Check-in đèo Hải Vân',
    roadLabel: 'Đèo Hải Vân',
    photoSrc: haiVanImg,
    photoAlt: 'Cung đường đèo Hải Vân uốn cong ôm theo sườn núi xanh',
    objectPosition: '52% 66%',
    tiltDeg: '0.9deg',
  },
  {
    id: 'banh-ep-hue',
    status: 'done',
    sheetText: 'Ăn bánh ép Huế',
    roadLabel: 'Bánh ép Huế',
    photoSrc: banhEpImg,
    photoAlt: 'Đĩa bánh ép Huế nóng giòn kèm rau thơm và chén mắm nêm',
    objectPosition: '48% 58%',
    tiltDeg: '-0.8deg',
  },
  {
    id: 'chua-thien-mu',
    status: 'next',
    sheetText: 'Chùa Thiên Mụ',
    sheetMeta: 'Điểm đến tiếp theo',
    roadLabel: 'Chùa Thiên Mụ',
    nextTag: 'Ghé tiếp',
    photoSrc: thienMuImg,
    photoAlt: 'Tháp Phước Duyên chùa Thiên Mụ nổi bật giữa hàng thông xanh bên sông Hương',
    objectPosition: '50% 42%',
    tiltDeg: '1.4deg',
  },
];

export const TripPlannerCard: React.FC<TripPlannerCardProps> = ({
  onStartPlanning,
  embedded = false,
}) => {
  const [hoveredId, setHoveredId] = useState<PlannerStopId | null>(null);
  const [focusedId, setFocusedId] = useState<PlannerStopId | null>(null);
  const [pinnedId, setPinnedId] = useState<PlannerStopId | null>(null);
  const [brokenPhotos, setBrokenPhotos] = useState<Partial<Record<PlannerStopId, boolean>>>({});
  const [windshieldBroken, setWindshieldBroken] = useState(false);
  const [paperBroken, setPaperBroken] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const pointerDownRef = useRef(false);
  const { ref: revealRef, revealState } = useEditorialReveal<HTMLDivElement>();

  const activeHighlightId: PlannerStopId | null = hoveredId ?? focusedId ?? pinnedId;

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        setPinnedId(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinnedId(null);
        setHoveredId(null);
        setFocusedId(null);
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
    };
  }, []);

  const handleEnter = (id: PlannerStopId, pointerType?: string) => {
    if (pointerType && pointerType !== 'mouse') return;
    setHoveredId(id);
  };

  const handleLeave = (id: PlannerStopId, pointerType?: string) => {
    if (pointerType && pointerType !== 'mouse') return;
    setHoveredId((prev) => (prev === id ? null : prev));
  };

  const handleFocus = (id: PlannerStopId) => {
    if (!pointerDownRef.current) {
      setFocusedId(id);
    }
    pointerDownRef.current = false;
  };

  const handleBlur = (id: PlannerStopId) => {
    pointerDownRef.current = false;
    setFocusedId((prev) => (prev === id ? null : prev));
  };

  const handleSelect = (id: PlannerStopId) => {
    pointerDownRef.current = false;
    setPinnedId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      className={
        embedded
          ? 'h-full w-full overflow-hidden p-0 m-0'
          : 'bg-[#F7F6EE] px-4 sm:px-8 lg:px-14 pb-16 sm:pb-24 pt-2'
      }
      aria-label="Lên lịch trình tuyến Đà Nẵng – Huế"
    >
      <div className={embedded ? 'h-full w-full' : 'mx-auto max-w-6xl'}>
        <div
          ref={(node) => {
            cardRef.current = node;
            revealRef.current = node;
          }}
          data-reveal-state={revealState}
          onClick={(e) => {
            const target = e.target as Element;
            if (!target.closest('button')) {
              setPinnedId(null);
            }
          }}
          className={
            embedded
              ? 'relative isolate overflow-hidden h-full w-full bg-[#19223B] text-[#FAF6EA]'
              : 'relative isolate overflow-hidden rounded-[28px] border border-[#173D2C]/[0.14] bg-[#19223B] text-[#FAF6EA] shadow-[0_24px_60px_rgba(20,46,36,0.16)]'
          }
        >
          {/* FULL-BLEED STATIC DUSK WINDSHIELD PHOTOGRAPH COVERING THE ENTIRE CARD */}
          {!windshieldBroken ? (
            <img loading="lazy" decoding="async"               data-planner-windshield-bg
              src={windshieldDuskImg}
              alt="Góc nhìn từ ghế phụ ô tô lúc chạng vạng qua kính lái ra khúc đường cong với bầu trời xanh chàm, tím lam và vệt hồng nhạt chân trời"
              referrerPolicy="no-referrer"
              onError={() => setWindshieldBroken(true)}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[50%_54%]"
            />
          ) : (
            <div
              data-planner-windshield-bg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#1A2242] via-[#3A3E6E] to-[#111524]"
            />
          )}

          {/* Local dusk shadow gradient behind left typography only — leaves center road curve & pink horizon open */}
          <div
            aria-hidden="true"
            className="pointer-events-none hidden lg:block absolute inset-0"
            style={{
              background:
                'linear-gradient(96deg, rgba(11, 16, 33, 0.80) 0%, rgba(13, 19, 39, 0.56) 24%, rgba(15, 22, 44, 0.14) 40%, rgba(15, 22, 44, 0) 56%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none lg:hidden absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(11, 16, 33, 0.82) 0%, rgba(13, 19, 39, 0.54) 36%, rgba(15, 22, 44, 0) 60%)',
            }}
          />

          {/* Subtle bottom dash depth for crisp souvenir print separation */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-32"
            style={{
              background:
                'linear-gradient(180deg, rgba(10, 13, 24, 0) 0%, rgba(10, 13, 24, 0.46) 100%)',
            }}
          />

          {/* UNIFIED SCENE: Left/Top Editorial Copy + Right/Bottom Visor Sheet, Open Curving Road & Dashboard Prints */}
          <div
            className={
              embedded
                ? 'relative z-10 flex h-full flex-col lg:flex-row'
                : 'relative z-10 flex min-h-[690px] sm:min-h-[580px] lg:min-h-[560px] flex-col lg:flex-row'
            }
          >
            {/* LEFT / TOP TYPOGRAPHY LAYER OVER DARK DUSK LEFT EDGE */}
            <div
              className={`relative z-20 flex flex-col justify-center px-6 pt-7 pb-3 sm:px-10 sm:pt-10 ${
                embedded
                  ? 'lg:w-[35%] lg:py-12 lg:pl-10 lg:pr-3'
                  : 'lg:w-[37%] lg:py-12 lg:pl-11 lg:pr-4'
              }`}
            >
              <p className="editorial-reveal-item editorial-reveal-title text-[11px] sm:text-xs font-semibold uppercase tracking-[0.14em] text-[#D7E4DA]/90">
                LÊN LỊCH TRÌNH
              </p>

              <h2 className="editorial-reveal-item editorial-reveal-title mt-2 max-w-[13ch] text-[32px] sm:text-[38px] lg:text-[42px] font-bold leading-[1.08] tracking-[-0.03em] text-[#FAF6EA] drop-shadow-[0_2px_12px_rgba(8,12,28,0.45)] text-balance">
                Có lịch để bắt đầu.
              </h2>

              {!embedded && (
                <>
                  <p className="editorial-reveal-item editorial-reveal-body mt-3.5 max-w-[32ch] text-[15px] leading-relaxed text-[#E9EFEA]/[0.92] drop-shadow-[0_1px_6px_rgba(8,12,28,0.4)]">
                    Chọn thành phố và số ngày, xem lịch theo từng buổi rồi bỏ bớt điểm nếu muốn đi nhẹ hơn. Thử ngay một lịch mẫu; đăng nhập khi bạn muốn tạo và lưu chuyến đi riêng.
                  </p>

                  <div className="editorial-reveal-item editorial-reveal-cta mt-5 sm:mt-8">
                    <button
                      type="button"
                      data-planner-cta
                      onClick={onStartPlanning}
                      className="group inline-flex items-center gap-3 rounded-full bg-[#FAF3E0] px-6 py-3 text-[14.5px] font-semibold text-[#173D2C] shadow-[0_10px_24px_rgba(6,10,24,0.38)] transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FAF3E0]"
                    >
                      <span>Thử chỉnh lịch mẫu</span>
                      <span
                        aria-hidden="true"
                        className="transition-transform duration-150 group-hover:translate-x-0.5"
                      >
                        →
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* RIGHT / LOWER WINDSHIELD INTERACTIVE STAGE */}
            <div
              data-planner-scene
              className="relative z-20 flex flex-1 flex-col justify-between"
            >
              {/* UPPER-RIGHT: Clipped Ivory Cotton Paper Sheet pinched onto the Sun Visor */}
              <div className="relative z-20 flex justify-end px-4 pt-2 sm:pt-2.5 sm:pr-7 lg:pr-8">
                <div
                  data-hanging-paper
                  className="relative w-full max-w-[292px] sm:max-w-[322px] aspect-[777/637]"
                >
                  {!paperBroken ? (
                    <img loading="lazy" decoding="async"                       src={paperClipsSheetImg}
                      alt=""
                      aria-hidden="true"
                      referrerPolicy="no-referrer"
                      onError={() => setPaperBroken(true)}
                      style={{
                        filter: 'drop-shadow(0 12px 22px rgba(8, 11, 26, 0.45))',
                      }}
                      className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-2 top-[11%] bottom-1 rounded-[2px] border border-[#DDD0B3] bg-[#FBF4E2] shadow-[0_12px_24px_rgba(8,11,26,0.42)]"
                    />
                  )}

                  <div className="relative z-10 flex h-full flex-col justify-center px-5 pt-[14.5%] pb-[6%] sm:px-6 sm:pt-[15%] sm:pb-[6.5%]">
                    <div className="flex items-baseline justify-between gap-2 border-b border-[#1D3B2A]/[0.16] pb-1.5">
                      <p className="text-[13px] sm:text-[14px] font-bold tracking-[-0.015em] text-[#173D2C]">
                        Đà Nẵng → Huế
                      </p>
                      <span className="text-[9.5px] sm:text-[10.5px] font-medium text-[#4D6857] whitespace-nowrap">
                        Lịch trình minh họa
                      </span>
                    </div>

                    <ol
                      className="mt-1.5 sm:mt-2 space-y-0.5 sm:space-y-1"
                      aria-label="Lịch trình minh họa trên giấy"
                    >
                      {MILESTONES.map((stop) => {
                        const isNext = stop.status === 'next';
                        const isHighlighted = activeHighlightId === stop.id;

                        return (
                          <li key={stop.id}>
                            <button
                              type="button"
                              data-planner-row={stop.id}
                              data-highlighted={isHighlighted ? 'true' : 'false'}
                              aria-pressed={pinnedId === stop.id}
                              onPointerDown={() => {
                                pointerDownRef.current = true;
                              }}
                              onPointerEnter={(e) => handleEnter(stop.id, e.pointerType)}
                              onPointerLeave={(e) => handleLeave(stop.id, e.pointerType)}
                              onFocus={() => handleFocus(stop.id)}
                              onBlur={() => handleBlur(stop.id)}
                              onClick={() => handleSelect(stop.id)}
                              className={`w-full flex items-center gap-2 rounded-[2px] px-1.5 py-[3.5px] sm:py-1 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E5B3D] ${
                                isHighlighted
                                  ? isNext
                                    ? 'bg-[#F3DFBC]/80'
                                    : 'bg-[#D7E8D4]/[0.85]'
                                  : 'bg-transparent hover:bg-[#EFE6CF]/60'
                              }`}
                            >
                              <span
                                aria-hidden="true"
                                data-paper-check={stop.id}
                                data-lit={stop.status === 'done' ? 'true' : 'false'}
                                className={`flex h-[15px] w-[15px] sm:h-4 sm:w-4 shrink-0 items-center justify-center rounded-full text-[9.5px] sm:text-[10px] font-bold transition-colors duration-150 ${
                                  stop.status === 'done'
                                    ? isHighlighted
                                      ? 'bg-[#173D2C] text-[#FAF5E8]'
                                      : 'bg-[#1E5B3D] text-[#FAF5E8]'
                                    : isHighlighted
                                    ? 'border-[1.8px] border-[#9E470A] text-[#9E470A]'
                                    : 'border-[1.6px] border-[#B85D0E] text-[#B85D0E]'
                                }`}
                              >
                                {stop.status === 'done' ? '✓' : '○'}
                              </span>

                              <span
                                className={`min-w-0 flex-1 text-[11px] sm:text-[12px] leading-snug text-[#173D2C] ${
                                  isNext
                                    ? 'underline decoration-[#C46610] decoration-[1.8px] underline-offset-[3px]'
                                    : isHighlighted
                                    ? 'underline decoration-[#1E5B3D]/60 decoration-[1.5px] underline-offset-[3px]'
                                    : ''
                                }`}
                              >
                                <span
                                  className={
                                    isHighlighted ? 'font-bold text-[#102C1F]' : 'font-semibold'
                                  }
                                >
                                  {stop.sheetText}
                                </span>
                                {stop.sheetMeta && (
                                  <span className="font-semibold text-[#A8510B]">
                                    {' '}
                                    · {stop.sheetMeta}
                                  </span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                </div>
              </div>

              {/* OPEN CENTER WINDSHIELD VISTA SHOWING CURVING DUSK ROAD */}
              <div
                aria-hidden="true"
                data-windshield-open-band
                className="pointer-events-none flex-1 min-h-[76px] sm:min-h-[115px] lg:min-h-[120px]"
              />

              {/* LOWER DASHBOARD LEDGE: 4 Souvenir Prints along bottom edge */}
              <div className="relative z-20 px-3 pt-1 pb-7 sm:px-5 sm:pb-7 lg:pr-7">
                <div
                  data-dashboard-ledge
                  className="mx-auto flex max-w-[640px] items-end justify-center lg:justify-end gap-2 sm:gap-3 lg:gap-3.5"
                >
                  {MILESTONES.map((stop) => {
                    const isHighlighted = activeHighlightId === stop.id;
                    const isNext = stop.status === 'next';
                    const photoBroken = !!brokenPhotos[stop.id];

                    return (
                      <button
                        key={stop.id}
                        type="button"
                        data-planner-keepsake={stop.id}
                        data-highlighted={isHighlighted ? 'true' : 'false'}
                        aria-pressed={pinnedId === stop.id}
                        aria-label={`${stop.roadLabel}${stop.nextTag ? ` · ${stop.nextTag}` : ''}`}
                        onPointerDown={() => {
                          pointerDownRef.current = true;
                        }}
                        onPointerEnter={(e) => handleEnter(stop.id, e.pointerType)}
                        onPointerLeave={(e) => handleLeave(stop.id, e.pointerType)}
                        onFocus={() => handleFocus(stop.id)}
                        onBlur={() => handleBlur(stop.id)}
                        onClick={() => handleSelect(stop.id)}
                        style={{ '--photo-tilt': stop.tiltDeg } as React.CSSProperties}
                        className={`planner-dash-photo shrink-0 rounded-[3px] border bg-[#FAF5E8] p-[3px] sm:p-[4.5px] text-center focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#F5E8C8] ${
                          isNext
                            ? 'w-[86px] sm:w-[126px] lg:w-[138px]'
                            : 'w-[74px] sm:w-[110px] lg:w-[120px]'
                        } ${isHighlighted ? 'is-highlighted z-30' : 'z-20'} ${
                          isNext
                            ? isHighlighted
                              ? 'border-[#E68A38] shadow-[0_14px_26px_rgba(4,6,18,0.72)]'
                              : 'border-[#E7D8BE] shadow-[0_8px_18px_rgba(4,6,18,0.58)]'
                            : isHighlighted
                            ? 'border-[#6BC295] shadow-[0_14px_26px_rgba(4,6,18,0.7)]'
                            : 'border-[#EAE2CE] shadow-[0_8px_16px_rgba(4,6,18,0.55)]'
                        }`}
                      >
                        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[1.5px] bg-[#252E44]">
                          {!photoBroken ? (
                            <img loading="lazy" decoding="async"                               src={stop.photoSrc}
                              alt={stop.photoAlt}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenPhotos((prev) => ({ ...prev, [stop.id]: true }))
                              }
                              style={{ objectPosition: stop.objectPosition }}
                              className="pointer-events-none block h-full w-full select-none object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#E4ECE4] px-1 text-[9.5px] font-semibold text-[#173D2C]">
                              {stop.roadLabel}
                            </div>
                          )}
                        </div>

                        <div className="mt-1 sm:mt-1.5 pb-0.5 leading-tight">
                          {stop.nextTag && (
                            <span className="block text-[8.5px] sm:text-[9.5px] font-bold tracking-[0.01em] text-[#B85D0E]">
                              {stop.nextTag}
                            </span>
                          )}
                          <p
                            className={`text-[9px] sm:text-[11px] font-semibold leading-tight tracking-[-0.025em] sm:tracking-[-0.01em] whitespace-nowrap ${
                              isNext && isHighlighted ? 'text-[#9E470A]' : 'text-[#173D2C]'
                            }`}
                          >
                            {stop.roadLabel}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Quiet photo attribution */}
                <p
                  data-planner-photo-credit
                  className="pointer-events-none absolute bottom-1.5 right-3 z-10 text-[9px] sm:text-[10px] font-medium text-[#D6DDF0]/70"
                >
                  Ảnh: S. Arunoprayote, B. Arnold, A. Hospers
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
