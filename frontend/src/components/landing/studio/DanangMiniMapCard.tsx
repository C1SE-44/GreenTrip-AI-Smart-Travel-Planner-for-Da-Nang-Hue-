import React, { useEffect, useRef, useState } from 'react';
import { useEditorialReveal } from './useEditorialReveal';
const voocCutoutImg = '/images/landing/studio/vooc_cutout.webp';
const khiCutoutImg = '/images/landing/studio/khi_cutout.webp';
const socCutoutImg = '/images/landing/studio/soc_cutout.webp';
const leaf1Img = '/images/landing/studio/sontra_leaf_1.webp';
const leaf2Img = '/images/landing/studio/sontra_leaf_2.webp';

const SON_TRA_PEXELS_BG =
  '/images/landing/studio/pexels-th-hugo-349378163-34472518_b32847d7.webp';

interface DanangMiniMapCardProps {
  onOpenDanangItinerary: () => void;
  embedded?: boolean;
}

export type SonTraAnimalId = 'vooc' | 'khi' | 'soc';

type FactIconKind = 'eye' | 'leaf' | 'shield' | 'tail' | 'paw' | 'fruit';
type FactCardTone = 'cream' | 'butter' | 'mint';

interface LeafPeekSpec {
  src: string;
  posClass: string;
  sizeClass: string;
  restX: string;
  restY: string;
  peekX: string;
  peekY: string;
  restRot: string;
  peekRot: string;
}

interface DiscoveryFactCard {
  id: string;
  title: string;
  text: string;
  icon: FactIconKind;
  tone: FactCardTone;
  desktopPosClass: string;
  rotDeg: string;
  delayMs: string;
}

interface AnimalSpec {
  id: SonTraAnimalId;
  name: string;
  latinName: string;
  sourceNote: string;
  photoSrc: string;
  photoAlt: string;
  sizeClass: string;
  posClass: string;
  factCards: DiscoveryFactCard[];
  leaves: LeafPeekSpec[];
}

const FACT_TONE_CLASSES: Record<FactCardTone, string> = {
  cream: 'bg-[#FAF5E4] border-[#123828]/[0.16] text-[#123828]',
  butter: 'bg-[#FDF3C7] border-[#7C5A0B]/20 text-[#123828]',
  mint: 'bg-[#E4F4EA] border-[#123828]/[0.18] text-[#123828]',
};

const FACT_ICON_STROKE: Record<FactCardTone, string> = {
  cream: 'text-[#1B5E3F]',
  butter: 'text-[#875809]',
  mint: 'text-[#145339]',
};

const renderFactIcon = (icon: FactIconKind, className: string) => {
  switch (icon) {
    case 'eye':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
          <path
            d="M1.5 8s2.4-4 6.5-4 6.5 4 6.5 4-2.4 4-6.5 4-6.5-4-6.5-4Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="8" cy="8" r="1.9" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      );
    case 'leaf':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
          <path
            d="M13.5 2.5C8 2.7 4 5.8 3.5 12.5c6.7-.5 9.8-4.5 10-10Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.5 12.5 9.2 6.8"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'shield':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
          <path
            d="M8 1.8 13 3.8v3.9c0 3.2-2.1 5.6-5 6.5-2.9-.9-5-3.3-5-6.5V3.8l5-2Z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 5.2v3.3m0 2.2h.01"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'tail':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
          <path
            d="M3 13c2.4 0 4.5-1.3 4.8-3.6.3-2-1.2-3.4-.3-5.1C8.3 2.7 11 2.2 12.8 3.6c1.1.9 1.2 2.5-.1 3.3"
            stroke="currentColor"
            strokeWidth="1.45"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'paw':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
          <circle cx="4.3" cy="5.5" r="1.15" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="8" cy="4.2" r="1.2" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="11.7" cy="5.5" r="1.15" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M5.2 12.4c-.7 0-1.2-.6-1-1.3.4-1.5 1.8-2.6 3.8-2.6s3.4 1.1 3.8 2.6c.2.7-.3 1.3-1 1.3H5.2Z"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'fruit':
      return (
        <svg viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
          <path
            d="M8.3 4.8c0-1.6.9-2.8 2.4-3.1"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
          <path
            d="M8 4.8c-2.6 0-4.3 1.9-4.3 4.5 0 2.6 1.7 4.9 4.3 4.9s4.3-2.3 4.3-4.9c0-2.6-1.7-4.5-4.3-4.5Z"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        </svg>
      );
  }
};

const ANIMALS: Record<SonTraAnimalId, AnimalSpec> = {
  vooc: {
    id: 'vooc',
    name: 'Voọc chà vá chân nâu',
    latinName: 'Pygathrix nemaeus',
    sourceNote: 'IUCN · GreenViet',
    photoSrc: voocCutoutImg,
    photoAlt:
      'Voọc chà vá chân nâu tách nền rõ mặt vàng cam, chòm râu trắng, tay bám và cẳng chân nâu đỏ',
    sizeClass: 'w-[94px] sm:w-[102px] lg:w-[108px]',
    posClass: 'sm:left-[24%] sm:top-[24%]',
    factCards: [
      {
        id: 'vooc-leg',
        title: 'Nhìn chân là biết',
        text: 'Cẳng chân nâu đỏ nổi bật bên đôi tay trắng và chòm râu ôm gương mặt vàng cam.',
        icon: 'eye',
        tone: 'cream',
        desktopPosClass: 'sm:left-[39%] sm:top-[6%] sm:w-[210px] lg:w-[224px]',
        rotDeg: '-1.2deg',
        delayMs: '0ms',
      },
      {
        id: 'vooc-canopy',
        title: 'Trên tán cây',
        text: 'Sống theo đàn gia đình trên tầng tán cao rừng già Sơn Trà và chủ yếu ăn lá non.',
        icon: 'leaf',
        tone: 'mint',
        desktopPosClass: 'sm:left-[56%] sm:top-[28%] sm:w-[210px] lg:w-[220px]',
        rotDeg: '1.1deg',
        delayMs: '65ms',
      },
      {
        id: 'vooc-distance',
        title: 'Gặp thì ngắm từ xa',
        text: 'Thuộc nhóm Nguy cấp (IUCN); giữ khoảng cách yên lặng để đàn tự nhiên kiếm ăn.',
        icon: 'shield',
        tone: 'butter',
        desktopPosClass: 'sm:left-[54%] sm:top-[62%] sm:w-[214px] lg:w-[226px]',
        rotDeg: '-0.8deg',
        delayMs: '130ms',
      },
    ],
    leaves: [
      {
        src: leaf2Img,
        posClass: 'left-[-4%] top-[46%]',
        sizeClass: 'w-[28px] sm:w-[34px]',
        restX: '10px',
        restY: '4px',
        peekX: '-6px',
        peekY: '-3px',
        restRot: '-34deg',
        peekRot: '-44deg',
      },
      {
        src: leaf1Img,
        posClass: 'right-[-4%] top-[42%]',
        sizeClass: 'w-[28px] sm:w-[35px]',
        restX: '-10px',
        restY: '4px',
        peekX: '7px',
        peekY: '-3px',
        restRot: '32deg',
        peekRot: '42deg',
      },
      {
        src: leaf2Img,
        posClass: 'left-[10%] bottom-[19%]',
        sizeClass: 'w-[24px] sm:w-[29px]',
        restX: '6px',
        restY: '-4px',
        peekX: '-5px',
        peekY: '4px',
        restRot: '-58deg',
        peekRot: '-66deg',
      },
    ],
  },
  khi: {
    id: 'khi',
    name: 'Khỉ đuôi dài',
    latinName: 'Macaca fascicularis',
    sourceNote: 'GreenViet · Bảo tồn Sơn Trà',
    photoSrc: khiCutoutImg,
    photoAlt:
      'Khỉ đuôi dài tách nền sắc nét ngồi thư thái thấy rõ gương mặt và chiếc đuôi dài cong đặc trưng',
    sizeClass: 'w-[154px] sm:w-[196px] lg:w-[222px]',
    posClass: 'sm:left-[40%] sm:top-[71%]',
    factCards: [
      {
        id: 'khi-tail',
        title: 'Cái đuôi có gì hay?',
        text: 'Chiếc đuôi dài bằng hoặc hơn thân mình giúp giữ thăng bằng khi leo vách đá, chuyền cành.',
        icon: 'tail',
        tone: 'butter',
        desktopPosClass: 'sm:left-[44%] sm:top-[7%] sm:w-[210px] lg:w-[222px]',
        rotDeg: '-1.1deg',
        delayMs: '0ms',
      },
      {
        id: 'khi-troop',
        title: 'Chuyện trong đàn',
        text: 'Thường di chuyển theo bầy dọc bìa rừng ven biển và các triền đá quanh bán đảo.',
        icon: 'paw',
        tone: 'cream',
        desktopPosClass: 'sm:left-[56%] sm:top-[38%] sm:w-[210px] lg:w-[220px]',
        rotDeg: '1.2deg',
        delayMs: '65ms',
      },
      {
        id: 'khi-feed',
        title: 'Đừng mời ăn nhé',
        text: 'Không cho khỉ ăn để giữ tập tính tự kiếm ăn và tránh kéo bầy ra mặt đường đèo.',
        icon: 'shield',
        tone: 'mint',
        desktopPosClass: 'sm:left-[56%] sm:top-[64%] sm:w-[214px] lg:w-[224px]',
        rotDeg: '-0.7deg',
        delayMs: '130ms',
      },
    ],
    leaves: [
      {
        src: leaf1Img,
        posClass: 'left-[-4%] top-[46%]',
        sizeClass: 'w-[22px] sm:w-[27px]',
        restX: '8px',
        restY: '4px',
        peekX: '-6px',
        peekY: '-2px',
        restRot: '-42deg',
        peekRot: '-50deg',
      },
      {
        src: leaf2Img,
        posClass: 'right-[16%] bottom-[26%]',
        sizeClass: 'w-[20px] sm:w-[25px]',
        restX: '-6px',
        restY: '4px',
        peekX: '6px',
        peekY: '-3px',
        restRot: '38deg',
        peekRot: '46deg',
      },
    ],
  },
  soc: {
    id: 'soc',
    name: 'Sóc bụng đỏ',
    latinName: 'Callosciurus erythraeus',
    sourceNote: 'IUCN · Cục Kiểm lâm',
    photoSrc: socCutoutImg,
    photoAlt:
      'Sóc bụng đỏ tách nền sắc nét thấy rõ mắt sáng, khuôn mặt và chiếc đuôi xù vươn cong',
    sizeClass: 'w-[118px] sm:w-[144px] lg:w-[160px]',
    posClass: 'sm:left-[71%] sm:top-[32%]',
    factCards: [
      {
        id: 'soc-belly',
        title: 'Bụng đỏ ở đâu?',
        text: 'Tên gọi bắt nguồn từ vùng lông bụng phớt đỏ cam đến đỏ nâu lộ rõ khi sóc vươn chuyền cành.',
        icon: 'eye',
        tone: 'cream',
        desktopPosClass: 'sm:left-[38%] sm:top-[7%] sm:w-[212px] lg:w-[226px]',
        rotDeg: '-1.3deg',
        delayMs: '0ms',
      },
      {
        id: 'soc-agile',
        title: 'Thoắt lên cành',
        text: 'Hoạt động mạnh nhất lúc sáng sớm và chiều mát nhờ chân bám chắc cùng đuôi xù thăng bằng.',
        icon: 'tail',
        tone: 'mint',
        desktopPosClass: 'sm:left-[18%] sm:top-[48%] sm:w-[200px] lg:w-[212px]',
        rotDeg: '0.9deg',
        delayMs: '65ms',
      },
      {
        id: 'soc-diet',
        title: 'Món khoái khẩu',
        text: 'Ưa tìm hạt, quả chín, chồi non và hoa rừng trên tán cao; đôi lúc bắt thêm côn trùng nhỏ.',
        icon: 'fruit',
        tone: 'butter',
        desktopPosClass: 'sm:left-[48%] sm:top-[67%] sm:w-[216px] lg:w-[228px]',
        rotDeg: '-0.9deg',
        delayMs: '130ms',
      },
    ],
    leaves: [
      {
        src: leaf1Img,
        posClass: 'right-[-8%] top-[24%]',
        sizeClass: 'w-[22px] sm:w-[26px]',
        restX: '-8px',
        restY: '4px',
        peekX: '6px',
        peekY: '-3px',
        restRot: '34deg',
        peekRot: '44deg',
      },
      {
        src: leaf2Img,
        posClass: 'right-[2%] bottom-[22%]',
        sizeClass: 'w-[20px] sm:w-[24px]',
        restX: '-6px',
        restY: '-4px',
        peekX: '6px',
        peekY: '3px',
        restRot: '52deg',
        peekRot: '62deg',
      },
    ],
  },
};

const VISIBLE_ANIMALS: SonTraAnimalId[] = ['vooc', 'khi', 'soc'];

export const DanangMiniMapCard: React.FC<DanangMiniMapCardProps> = ({
  onOpenDanangItinerary,
  embedded = false,
}) => {
  const [hoveredId, setHoveredId] = useState<SonTraAnimalId | null>(null);
  const [focusedId, setFocusedId] = useState<SonTraAnimalId | null>(null);
  const [pinnedId, setPinnedId] = useState<SonTraAnimalId | null>(null);
  const [bgFailed, setBgFailed] = useState(false);
  const [failedPhotos, setFailedPhotos] = useState<Partial<Record<SonTraAnimalId, boolean>>>(
    {},
  );

  const stageWrapRef = useRef<HTMLDivElement>(null);
  const pointerDownRef = useRef(false);
  const { ref: revealRef, revealState } = useEditorialReveal<HTMLDivElement>();

  // Hover/focus temporarily shows this animal's 2–3 fact cards; click/tap pins them open.
  const previewId = hoveredId ?? focusedId;
  const activeId = previewId ?? pinnedId;
  const activeAnimal = activeId ? ANIMALS[activeId] : null;
  const isPinnedCluster = activeId !== null && pinnedId === activeId;

  const clearAll = () => {
    setHoveredId(null);
    setFocusedId(null);
    setPinnedId(null);
  };

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (stageWrapRef.current && !stageWrapRef.current.contains(e.target as Node)) {
        clearAll();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearAll();
        if (
          document.activeElement instanceof HTMLElement &&
          stageWrapRef.current?.contains(document.activeElement)
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

  const handleEnter = (id: SonTraAnimalId, pointerType?: string) => {
    if (pointerType && pointerType !== 'mouse') return;
    setHoveredId(id);
  };

  const handleLeave = (id: SonTraAnimalId, pointerType?: string) => {
    if (pointerType && pointerType !== 'mouse') return;
    setHoveredId((prev) => (prev === id ? null : prev));
  };

  const handleClickAnimal = (
    id: SonTraAnimalId,
    e: React.MouseEvent<HTMLButtonElement>,
  ) => {
    pointerDownRef.current = false;
    if (pinnedId === id) {
      clearAll();
      e.currentTarget.blur();
    } else {
      setHoveredId(null);
      setFocusedId(null);
      setPinnedId(id);
    }
  };

  const handleFocus = (id: SonTraAnimalId) => {
    if (!pointerDownRef.current) {
      setFocusedId(id);
    }
    pointerDownRef.current = false;
  };

  const handleBlur = (id: SonTraAnimalId) => {
    pointerDownRef.current = false;
    setFocusedId((prev) => (prev === id ? null : prev));
  };

  const renderPeekingLeaves = (leaves: LeafPeekSpec[]) =>
    leaves.map((leaf, index) => (
      <img loading="lazy" decoding="async"         key={index}
        src={leaf.src}
        alt=""
        aria-hidden="true"
        style={
          {
            '--leaf-rest-x': leaf.restX,
            '--leaf-rest-y': leaf.restY,
            '--leaf-peek-x': leaf.peekX,
            '--leaf-peek-y': leaf.peekY,
            '--leaf-rot': leaf.restRot,
            '--leaf-peek-rot': leaf.peekRot,
          } as React.CSSProperties
        }
        className={`sontra-leaf-peek pointer-events-none absolute z-0 h-auto select-none drop-shadow-[0_4px_8px_rgba(8,24,18,0.34)] ${leaf.posClass} ${leaf.sizeClass}`}
      />
    ));

  return (
    <section
      className={
        embedded
          ? 'h-full w-full overflow-hidden p-0 m-0'
          : 'bg-[#F7F6EE] px-4 sm:px-8 lg:px-14 pb-16 sm:pb-24 pt-2'
      }
      aria-label="Khám phá thiên nhiên bán đảo Sơn Trà"
    >
      <div className={embedded ? 'h-full w-full' : 'mx-auto max-w-6xl'}>
        <div
          ref={revealRef}
          data-reveal-state={revealState}
          onClick={(e) => {
            const target = e.target as Element;
            if (
              !target.closest('button') &&
              !target.closest('[data-animal-fact-cluster]') &&
              !target.closest('[data-animal-fact-mobile]')
            ) {
              clearAll();
            }
          }}
          className={
            embedded
              ? 'relative isolate overflow-hidden h-full w-full bg-[#1B4A43] text-[#FAF6EA]'
              : 'relative isolate overflow-hidden rounded-[28px] border border-[#173D2C]/[0.15] bg-[#1B4A43] text-[#FAF6EA] shadow-[0_24px_60px_rgba(14,36,28,0.16)]'
          }
        >
          {/* Unified 5–7px cream-white contour sticker rim (~6px on desktop, ~4.5px on mobile) */}
          <svg
            className="pointer-events-none absolute h-0 w-0 overflow-hidden"
            aria-hidden="true"
          >
            <defs>
              <filter
                id="sontra-rim-ivory"
                x="-24%"
                y="-24%"
                width="148%"
                height="148%"
                colorInterpolationFilters="sRGB"
              >
                <feMorphology
                  in="SourceAlpha"
                  operator="dilate"
                  radius="5.8"
                  result="DILATED"
                />
                <feGaussianBlur
                  in="DILATED"
                  stdDeviation="0.85"
                  result="SOFT_MASK"
                />
                <feComponentTransfer in="SOFT_MASK" result="CRISP_MASK">
                  <feFuncA type="linear" slope="6" intercept="-1.2" />
                </feComponentTransfer>
                <feFlood floodColor="#FAF6EA" floodOpacity="1" result="RIM_COLOR" />
                <feComposite
                  in="RIM_COLOR"
                  in2="CRISP_MASK"
                  operator="in"
                  result="RIM"
                />
                <feMerge>
                  <feMergeNode in="RIM" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter
                id="sontra-rim-gold"
                x="-24%"
                y="-24%"
                width="148%"
                height="148%"
                colorInterpolationFilters="sRGB"
              >
                <feMorphology
                  in="SourceAlpha"
                  operator="dilate"
                  radius="6"
                  result="DILATED"
                />
                <feGaussianBlur
                  in="DILATED"
                  stdDeviation="0.85"
                  result="SOFT_MASK"
                />
                <feComponentTransfer in="SOFT_MASK" result="CRISP_MASK">
                  <feFuncA type="linear" slope="6" intercept="-1.2" />
                </feComponentTransfer>
                <feFlood floodColor="#F6CF4E" floodOpacity="1" result="RIM_COLOR" />
                <feComposite
                  in="RIM_COLOR"
                  in2="CRISP_MASK"
                  operator="in"
                  result="RIM"
                />
                <feMerge>
                  <feMergeNode in="RIM" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter
                id="sontra-rim-ivory-mob"
                x="-22%"
                y="-22%"
                width="144%"
                height="144%"
                colorInterpolationFilters="sRGB"
              >
                <feMorphology
                  in="SourceAlpha"
                  operator="dilate"
                  radius="4.5"
                  result="DILATED"
                />
                <feGaussianBlur
                  in="DILATED"
                  stdDeviation="0.7"
                  result="SOFT_MASK"
                />
                <feComponentTransfer in="SOFT_MASK" result="CRISP_MASK">
                  <feFuncA type="linear" slope="6" intercept="-1.2" />
                </feComponentTransfer>
                <feFlood floodColor="#FAF6EA" floodOpacity="1" result="RIM_COLOR" />
                <feComposite
                  in="RIM_COLOR"
                  in2="CRISP_MASK"
                  operator="in"
                  result="RIM"
                />
                <feMerge>
                  <feMergeNode in="RIM" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              <filter
                id="sontra-rim-gold-mob"
                x="-22%"
                y="-22%"
                width="144%"
                height="144%"
                colorInterpolationFilters="sRGB"
              >
                <feMorphology
                  in="SourceAlpha"
                  operator="dilate"
                  radius="4.7"
                  result="DILATED"
                />
                <feGaussianBlur
                  in="DILATED"
                  stdDeviation="0.7"
                  result="SOFT_MASK"
                />
                <feComponentTransfer in="SOFT_MASK" result="CRISP_MASK">
                  <feFuncA type="linear" slope="6" intercept="-1.2" />
                </feComponentTransfer>
                <feFlood floodColor="#F6CF4E" floodOpacity="1" result="RIM_COLOR" />
                <feComposite
                  in="RIM_COLOR"
                  in2="CRISP_MASK"
                  operator="in"
                  result="RIM"
                />
                <feMerge>
                  <feMergeNode in="RIM" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
          </svg>

          {/* SINGLE FULL-BLEED STATIC PEXELS PHOTOGRAPH COVERING THE ENTIRE CARD */}
          {!bgFailed ? (
            <img loading="lazy" decoding="async"               data-sontra-bg
              src={SON_TRA_PEXELS_BG}
              alt="Khung cảnh biển xanh qua tán lá và cụm đá ven bờ bán đảo Sơn Trà"
              referrerPolicy="no-referrer"
              onError={() => setBgFailed(true)}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[50%_62%]"
            />
          ) : (
            <div
              data-sontra-bg
              aria-label="Khung cảnh biển xanh và cụm đá bán đảo Sơn Trà"
              className="pointer-events-none absolute inset-0 h-full w-full bg-gradient-to-br from-[#2B665D] via-[#3A7D7F] to-[#173932]"
            />
          )}

          {/* Soft left-to-center gradient wash keeping the ocean & right wildlife stage bright and natural */}
          <div
            aria-hidden="true"
            className="pointer-events-none hidden lg:block absolute inset-0"
            style={{
              background:
                'linear-gradient(96deg, rgba(8, 30, 25, 0.80) 0%, rgba(10, 36, 30, 0.56) 22%, rgba(12, 42, 35, 0.16) 40%, rgba(12, 42, 35, 0) 56%)',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none lg:hidden absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(8, 30, 25, 0.80) 0%, rgba(10, 36, 30, 0.52) 32%, rgba(12, 42, 35, 0) 56%)',
            }}
          />

          {/* UNIFIED SCENE CONTENT */}
          <div
            className={
              embedded
                ? 'relative z-10 flex h-full flex-col lg:flex-row'
                : 'relative z-10 flex min-h-[630px] sm:min-h-[550px] lg:min-h-[560px] flex-col lg:flex-row'
            }
          >
            {/* LEFT/TOP EDITORIAL COPY */}
            <div
              className={`relative z-20 flex flex-col justify-between px-6 pt-7 pb-3 sm:px-10 sm:pt-10 ${
                embedded
                  ? 'lg:w-[35%] lg:py-12 lg:pl-10 lg:pr-3'
                  : 'lg:w-[39%] lg:py-12 lg:pl-11 lg:pr-4'
              }`}
            >
              <p className="editorial-reveal-item editorial-reveal-title text-[11px] sm:text-xs font-semibold tracking-[0.06em] text-[#D7EDE1]/90">
                Bán đảo Sơn Trà · Đà Nẵng
              </p>

              <div className="my-5 sm:my-7 lg:my-auto lg:py-5">
                <h2 className="editorial-reveal-item editorial-reveal-title max-w-[13ch] text-[32px] sm:text-[38px] lg:text-[42px] font-bold leading-[1.08] tracking-[-0.03em] text-[#FAF6EA] drop-shadow-[0_2px_12px_rgba(8,24,20,0.36)] text-balance">
                  Muốn ghé Sơn Trà?
                </h2>
                {!embedded && (
                  <>
                    <p className="editorial-reveal-item editorial-reveal-body mt-3.5 max-w-[30ch] text-[15px] leading-relaxed text-[#EDF6F0]/[0.92] drop-shadow-[0_1px_6px_rgba(8,24,20,0.3)]">
                      Khám phá thiên nhiên trước khi chọn điểm dừng. Xem lịch mẫu Đà Nẵng 2 ngày để biết ghép Sơn Trà vào buổi nào.
                    </p>

                    <div className="editorial-reveal-item editorial-reveal-cta mt-6 sm:mt-8">
                      <button
                        type="button"
                        onClick={onOpenDanangItinerary}
                        className="group inline-flex items-center gap-3.5 border-b border-[#FAF6EA]/[0.55] pb-1.5 text-[15px] font-semibold text-[#FAF6EA] transition-colors hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FAF6EA]"
                      >
                        <span>Xem lịch mẫu có Sơn Trà</span>
                        <span
                          aria-hidden="true"
                          className="text-base transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        >
                          ↗
                        </span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {!embedded && (
                <p className="editorial-reveal-item editorial-reveal-cta hidden lg:block text-[12px] text-[#DCECE3]/80">
                  Khu bảo tồn thiên nhiên bán đảo Sơn Trà
                </p>
              )}
            </div>

            {/* RIGHT / LOWER WILDLIFE STAGE */}
            <div
              ref={stageWrapRef}
              data-sontra-stage
              className="relative z-20 flex-1 sm:min-h-[430px] lg:min-h-0"
            >
              {/* MOBILE COMPACT TRIANGULAR SHOWCASE (< sm): roomy spacing, zero overlap, clear faces & labels */}
              <div className="sm:hidden flex flex-col items-center justify-end gap-3.5 px-4 pt-2 pb-12">
                <div className="flex w-full items-end justify-center gap-6">
                  {(['vooc', 'soc'] as SonTraAnimalId[]).map((id) => {
                    const animal = ANIMALS[id];
                    const isActive = activeId === id;
                    const photoBroken = !!failedPhotos[id];
                    return (
                      <button
                        key={`mob-${id}`}
                        type="button"
                        data-animal-btn-mobile={id}
                        aria-pressed={pinnedId === id}
                        aria-label={`${animal.name} — chạm để mở thông tin`}
                        onPointerDown={() => {
                          pointerDownRef.current = true;
                        }}
                        onClick={(e) => handleClickAnimal(id, e)}
                        className={`sontra-animal-btn group flex flex-col items-center p-1 text-center rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5C942] ${
                          isActive ? 'is-active z-30' : 'z-20'
                        }`}
                      >
                        <div className="sontra-cutout-lift relative pointer-events-none flex flex-col items-center">
                          <div className="sontra-cutout-shadow relative z-10 flex items-center justify-center">
                            {!photoBroken ? (
                              <img loading="lazy" decoding="async"                                 src={animal.photoSrc}
                                alt={animal.photoAlt}
                                referrerPolicy="no-referrer"
                                onError={() =>
                                  setFailedPhotos((prev) => ({ ...prev, [id]: true }))
                                }
                                style={{
                                  filter: isActive
                                    ? 'url(#sontra-rim-gold-mob)'
                                    : 'url(#sontra-rim-ivory-mob)',
                                }}
                                className={`block h-auto select-none object-contain ${animal.sizeClass}`}
                              />
                            ) : (
                              <div className="rounded-xl border border-[#FAF6EA]/80 bg-[#173D2C]/[0.85] px-3 py-2 text-xs font-semibold text-[#FAF6EA]">
                                {animal.name}
                              </div>
                            )}
                          </div>
                          <span
                            className={`relative z-20 mt-2 inline-block rounded-[8px] border px-2.5 py-0.5 text-[11px] font-bold leading-tight tracking-[-0.015em] whitespace-nowrap transition-colors duration-150 ${
                              isActive
                                ? 'border-[#F5C942] bg-[#FFFDF6] text-[#143B2A] shadow-[0_6px_14px_rgba(7,24,17,0.34)]'
                                : 'border-[#143B2A]/[0.16] bg-[#FAF6EA] text-[#143B2A] shadow-[0_4px_10px_rgba(7,24,17,0.28)]'
                            }`}
                          >
                            {animal.name}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {(() => {
                  const id: SonTraAnimalId = 'khi';
                  const animal = ANIMALS[id];
                  const isActive = activeId === id;
                  const photoBroken = !!failedPhotos[id];
                  return (
                    <button
                      type="button"
                      data-animal-btn-mobile={id}
                      aria-pressed={pinnedId === id}
                      aria-label={`${animal.name} — chạm để mở thông tin`}
                      onPointerDown={() => {
                        pointerDownRef.current = true;
                      }}
                      onClick={(e) => handleClickAnimal(id, e)}
                      className={`sontra-animal-btn group flex flex-col items-center p-1 text-center rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5C942] ${
                        isActive ? 'is-active z-30' : 'z-20'
                      }`}
                    >
                      <div className="sontra-cutout-lift relative pointer-events-none flex flex-col items-center">
                        <div className="sontra-cutout-shadow relative z-10 flex items-center justify-center">
                          {!photoBroken ? (
                            <img loading="lazy" decoding="async"                               src={animal.photoSrc}
                              alt={animal.photoAlt}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setFailedPhotos((prev) => ({ ...prev, [id]: true }))
                              }
                              style={{
                                filter: isActive
                                  ? 'url(#sontra-rim-gold-mob)'
                                  : 'url(#sontra-rim-ivory-mob)',
                              }}
                              className={`block h-auto select-none object-contain ${animal.sizeClass}`}
                            />
                          ) : (
                            <div className="rounded-xl border border-[#FAF6EA]/80 bg-[#173D2C]/[0.85] px-3 py-2 text-xs font-semibold text-[#FAF6EA]">
                              {animal.name}
                            </div>
                          )}
                        </div>
                        <span
                          className={`relative z-20 mt-2 inline-block rounded-[8px] border px-2.5 py-0.5 text-[11px] font-bold leading-tight tracking-[-0.015em] whitespace-nowrap transition-colors duration-150 ${
                            isActive
                              ? 'border-[#F5C942] bg-[#FFFDF6] text-[#143B2A] shadow-[0_6px_14px_rgba(7,24,17,0.34)]'
                              : 'border-[#143B2A]/[0.16] bg-[#FAF6EA] text-[#143B2A] shadow-[0_4px_10px_rgba(7,24,17,0.28)]'
                          }`}
                        >
                          {animal.name}
                        </span>
                      </div>
                    </button>
                  );
                })()}
              </div>

              {/* DESKTOP / TABLET TRIANGLE STAGE (sm+): Voọc upper-center, Sóc upper-right, Khỉ lower-center */}
              {VISIBLE_ANIMALS.map((id) => {
                const animal = ANIMALS[id];
                const isActive = activeId === id;
                const photoBroken = !!failedPhotos[id];

                return (
                  <button
                    key={id}
                    type="button"
                    data-animal-btn={id}
                    aria-pressed={pinnedId === id}
                    aria-label={`${animal.name} — rê để xem nhanh, bấm để giữ các thẻ khám phá`}
                    onPointerDown={() => {
                      pointerDownRef.current = true;
                    }}
                    onPointerEnter={(e) => handleEnter(id, e.pointerType)}
                    onPointerLeave={(e) => handleLeave(id, e.pointerType)}
                    onFocus={() => handleFocus(id)}
                    onBlur={() => handleBlur(id)}
                    onClick={(e) => handleClickAnimal(id, e)}
                    className={`sontra-animal-btn group hidden sm:block absolute -translate-x-1/2 -translate-y-1/2 p-1 text-center rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F5C942] ${animal.posClass} ${
                      isActive ? 'is-active z-30' : 'z-20'
                    }`}
                  >
                    <div
                      data-animal-frame={id}
                      className="sontra-cutout-lift relative pointer-events-none flex flex-col items-center"
                    >
                      {renderPeekingLeaves(animal.leaves)}

                      <div className="sontra-cutout-shadow relative z-10 flex items-center justify-center">
                        {!photoBroken ? (
                          <img loading="lazy" decoding="async"                             src={animal.photoSrc}
                            alt={animal.photoAlt}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedPhotos((prev) => ({ ...prev, [id]: true }))
                            }
                            style={{
                              filter: isActive
                                ? 'url(#sontra-rim-gold)'
                                : 'url(#sontra-rim-ivory)',
                            }}
                            className={`block h-auto select-none object-contain ${animal.sizeClass}`}
                          />
                        ) : (
                          <div className="rounded-xl border border-[#FAF6EA]/80 bg-[#173D2C]/[0.85] px-3 py-2 text-xs font-semibold text-[#FAF6EA]">
                            {animal.name}
                          </div>
                        )}
                      </div>

                      <span
                        className={`relative z-20 mt-2 inline-block rounded-[9px] border px-2.5 py-0.5 text-[11px] sm:text-[12px] font-bold leading-tight tracking-[-0.015em] whitespace-nowrap transition-colors duration-150 ${
                          isActive
                            ? 'border-[#F5C942] bg-[#FFFDF6] text-[#143B2A] shadow-[0_6px_14px_rgba(7,24,17,0.34)]'
                            : 'border-[#143B2A]/[0.16] bg-[#FAF6EA] text-[#143B2A] shadow-[0_5px_12px_rgba(7,24,17,0.30)]'
                        }`}
                      >
                        {animal.name}
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* DESKTOP/TABLET STAGGERED DISCOVERY FACT CLUSTER (2–3 individual solid mini-cards around active animal only) */}
              {activeAnimal && (
                <div
                  key={`cluster-${activeAnimal.id}`}
                  data-animal-fact-cluster={activeAnimal.id}
                  data-fact-mode={isPinnedCluster ? 'pinned' : 'preview'}
                  aria-live="polite"
                  className="pointer-events-none hidden sm:block absolute inset-0 z-40"
                >
                  {activeAnimal.factCards.map((card, idx) => (
                    <aside
                      key={card.id}
                      data-animal-fact-card={card.id}
                      style={
                        {
                          '--fact-delay': card.delayMs,
                          '--fact-rot': card.rotDeg,
                        } as React.CSSProperties
                      }
                      className={`sontra-fact-chip pointer-events-auto absolute rounded-xl border px-3 py-2.5 text-left shadow-[0_12px_26px_rgba(10,28,20,0.28)] ${
                        FACT_TONE_CLASSES[card.tone]
                      } ${card.desktopPosClass}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {renderFactIcon(
                            card.icon,
                            `h-3.5 w-3.5 shrink-0 ${FACT_ICON_STROKE[card.tone]}`,
                          )}
                          <h3 className="text-[12px] font-bold leading-tight tracking-[-0.01em] text-[#123828]">
                            {card.title}
                          </h3>
                        </div>

                        {isPinnedCluster && idx === 0 && (
                          <button
                            type="button"
                            data-animal-close
                            onClick={clearAll}
                            className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold text-[#1E593F] hover:bg-[#123828]/10 hover:text-[#123828]"
                          >
                            Đóng
                          </button>
                        )}
                      </div>

                      <p className="mt-1 text-[11.5px] leading-[1.42] text-[#1D4432]">
                        {card.text}
                      </p>

                      {isPinnedCluster && idx === activeAnimal.factCards.length - 1 && (
                        <p className="mt-1.5 border-t border-[#123828]/[0.12] pt-1 text-[10px] font-medium text-[#395B4A]">
                          {activeAnimal.latinName} · {activeAnimal.sourceNote}
                        </p>
                      )}
                    </aside>
                  ))}
                </div>
              )}

              {/* MOBILE TAP DISCOVERY FACT CLUSTER INSIDE THE SAME SCENE */}
              {activeAnimal && (
                <div
                  key={`cluster-mob-${activeAnimal.id}`}
                  data-animal-fact-mobile={activeAnimal.id}
                  className="sm:hidden absolute inset-x-3 bottom-3 z-40"
                >
                  <div className="grid grid-cols-1 gap-1.5">
                    {activeAnimal.factCards.map((card, idx) => (
                      <div
                        key={card.id}
                        data-animal-fact-card={card.id}
                        style={
                          {
                            '--fact-delay': card.delayMs,
                            '--fact-rot': '0deg',
                          } as React.CSSProperties
                        }
                        className={`sontra-fact-chip rounded-lg border px-2.5 py-2 text-left shadow-[0_10px_22px_rgba(10,28,20,0.34)] ${
                          FACT_TONE_CLASSES[card.tone]
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {renderFactIcon(
                              card.icon,
                              `h-3.5 w-3.5 shrink-0 ${FACT_ICON_STROKE[card.tone]}`,
                            )}
                            <h3 className="text-[11.5px] font-bold leading-tight text-[#123828]">
                              {card.title}
                            </h3>
                          </div>
                          {idx === 0 && (
                            <button
                              type="button"
                              data-animal-close-mobile
                              onClick={clearAll}
                              className="shrink-0 whitespace-nowrap rounded bg-[#123828]/[0.08] px-2 py-0.5 text-[10.5px] font-semibold text-[#123828] hover:bg-[#123828]/[0.14]"
                            >
                              Đóng
                            </button>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] leading-[1.35] text-[#1D4432]">
                          {card.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quiet exact photo attribution */}
              <p
                data-sontra-credit
                title="Nền: Thư Hugo / Pexels · Voọc: Wren987 (Wikimedia Commons, CC0) · Khỉ: Trudy Vianda (Wikimedia Commons, CC BY-SA 4.0) · Sóc bụng đỏ: xiquinhosilva (Wikimedia Commons, CC BY 2.0) · Lá: Wikimedia Commons"
                className="pointer-events-none absolute bottom-2.5 right-3 z-10 rounded-[7px] bg-[#FAF8EE]/[0.92] px-2.5 py-0.5 text-[10px] sm:text-[10.5px] font-medium text-[#173D2C]/90 shadow-sm"
              >
                Thư Hugo / Pexels · Động vật: Wikimedia Commons
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
