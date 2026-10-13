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
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Left: image + branding */}
      <div className="relative flex min-h-[240px] flex-col justify-between overflow-hidden p-6 lg:w-[45%] lg:min-h-screen lg:p-12">
        <img
          src={image}
          alt={imageAlt}
          className="absolute inset-0 h-full w-full object-cover"
        />
        {/* Soft bottom-to-top gradient so the image stays bright at the top */}
        <div className="absolute inset-0 bg-gradient-to-t from-forest-900/95 via-forest-900/40 to-transparent" />

        <div className="relative z-10 flex justify-between items-start">
          <Link to="/" className="outline-none focus:outline-none hover:opacity-85 transition-opacity">
            <Logo size="md" textClassName="text-cream" />
          </Link>
          <div className="hidden lg:flex items-center gap-1.5 rounded-full bg-cream/20 px-3 py-1.5 backdrop-blur-md">
            <Users size={14} className="text-cream" />
            <span className="text-xs font-medium text-cream">1.200+ chuyến đã lên lịch</span>
          </div>
        </div>

        <div className="relative z-10 space-y-6 lg:space-y-8">
          <div>
            <p className="mb-2 text-sm font-medium text-sun-500 drop-shadow-sm">
              Đà Nẵng ⇄ Huế · 100 km
            </p>
            <h1 className="font-display text-2xl leading-tight text-ivory lg:text-[2.5rem] lg:leading-tight">
              {slogan}
            </h1>
          </div>

          <ul className="space-y-3">
            {benefits.map((b, i) => {
              const Icon = benefitIcons[i % benefitIcons.length];
              return (
                <li key={i} className="flex items-center gap-3 text-sm text-cream/90 lg:text-base">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-forest-500 text-ivory shadow-sm">
                    <Icon size={14} />
                  </span>
                  {b}
                </li>
              );
            })}
          </ul>

          <div className="inline-flex items-center gap-4 rounded-2xl bg-forest-500 px-5 py-3.5 shadow-lg">
            <div className="flex items-center gap-2">
              <Leaf size={20} className="text-sun-100" />
              <div>
                <p className="text-[11px] font-medium text-forest-100 uppercase tracking-wider">Eco score</p>
                <p className="text-xl font-bold text-ivory">{ecoStat.score}</p>
              </div>
            </div>
            <div className="h-10 w-px bg-forest-400" />
            <div>
              <p className="text-[11px] font-medium text-forest-100 uppercase tracking-wider">Tiết kiệm CO₂</p>
              <p className="text-xl font-bold text-ivory">{ecoStat.co2}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex flex-1 items-center justify-center bg-ivory p-6 lg:p-12">
        <div className="w-full max-w-[420px] animate-slideUp">
          {children}
        </div>
      </div>
    </div>
  );
}
