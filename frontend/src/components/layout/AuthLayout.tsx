import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Leaf, MapPin, Wallet, Users } from 'lucide-react';
import Logo from '@/components/ui/Logo';

interface AuthLayoutProps {
  image: string;
  imageAlt: string;
  slogan: string;
  benefits: string[];
  ecoStat: { score: number; co2: string };
  children: ReactNode;
}

const benefitIcons = [MapPin, Wallet, Leaf];

export default function AuthLayout({
  image,
  imageAlt,
  slogan,
  benefits,
  ecoStat,
  children,
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen flex-col bg-white lg:flex-row">
      {/* Left: scenic imagery + GreenTrip eco brand */}
      <div className="relative flex min-h-[240px] flex-col justify-between overflow-hidden p-6 lg:w-[45%] lg:min-h-screen lg:p-12">
        <img
          src={image}
          alt={imageAlt}
          width={1200}
          height={1600}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/92 via-emerald-950/45 to-neutral-950/20" />

        <div className="relative z-10 flex justify-between items-start gap-3">
          <Link
            to="/"
            className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white hover:opacity-90 transition-opacity"
          >
            <Logo size="md" textClassName="text-white" />
          </Link>
          <div className="hidden lg:inline-flex items-center gap-1.5 rounded-full bg-white/15 border border-white/20 px-3.5 py-1.5 backdrop-blur-md">
            <Users size={14} className="text-white" aria-hidden="true" />
            <span className="text-xs font-medium text-white">1.200+ chuyến đã lên lịch</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6 lg:space-y-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-200">
              Đà Nẵng ⇄ Huế · 100 km
            </p>
            <h1 className="font-display text-2xl font-bold leading-tight text-white lg:text-[2.25rem] lg:leading-tight">
              {slogan}
            </h1>
          </div>

          <ul className="space-y-3">
            {benefits.map((b, i) => {
              const Icon = benefitIcons[i % benefitIcons.length];
              return (
                <li key={i} className="flex items-center gap-3 text-sm text-white/95 lg:text-[15px]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-white shadow-xs">
                    <Icon size={14} aria-hidden="true" />
                  </span>
                  <span>{b}</span>
                </li>
              );
            })}
          </ul>

          <div className="inline-flex items-center gap-5 rounded-2xl bg-emerald-900/90 border border-white/15 px-5 py-3.5 shadow-lg backdrop-blur-xs">
            <div className="flex items-center gap-2.5">
              <Leaf size={20} className="text-emerald-300 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-xs font-medium text-emerald-200">Điểm xanh</p>
                <p className="text-xl font-bold text-white tabular-nums">{ecoStat.score}</p>
              </div>
            </div>
            <div className="h-10 w-px bg-white/20" />
            <div>
              <p className="text-xs font-medium text-emerald-200">Tiết kiệm CO₂</p>
              <p className="text-xl font-bold text-white tabular-nums">{ecoStat.co2}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: clean Airbnb-inspired auth card */}
      <div className="flex flex-1 items-center justify-center bg-neutral-50/70 p-5 sm:p-8 lg:p-12">
        <div className="w-full max-w-[440px] rounded-[24px] border border-neutral-200/80 bg-white p-6 sm:p-8 shadow-[0_8px_32px_rgba(28,25,23,0.06)] animate-slideUp">
          {children}
        </div>
      </div>
    </div>
  );
}
