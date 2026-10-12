import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Menu, X, Compass, CalendarCheck, MapPinned, LogIn } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LoginModal from '@/components/auth/LoginModal';
import OnboardingModal from '@/components/auth/OnboardingModal';

const navItems = [
  { to: '/explore', label: 'Khám Phá', icon: Compass },
  { to: '/planner', label: 'Lập Lịch Trình', icon: CalendarCheck },
  { to: '/my-trips', label: 'Chuyến Đi Của Tôi', icon: MapPinned },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      <div className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out flex justify-center ${scrolled ? 'pt-[7px] px-4' : 'pt-0 px-0'}`}>
        <header
          className={`
            w-full transition-all duration-500 ease-out
            ${scrolled 
              ? 'max-w-[1400px] bg-white/95 backdrop-blur-md shadow-card border border-gray-100 rounded-full' 
              : 'max-w-full bg-transparent rounded-none border-transparent'
            }
          `}
        >
          <nav className={`mx-auto w-full max-w-full flex items-center justify-between transition-all duration-500 ${scrolled ? 'h-[50px]' : 'h-[60px]'} px-6 lg:px-8`}>
            <Link to="/explore" className="flex items-center outline-none focus:outline-none">
              <Logo size="md" />
            </Link>

            {/* Desktop nav */}
            <div className="hidden items-center gap-1.5 md:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-1.5 text-[13px] transition-all duration-300 outline-none focus:outline-none ${
                      isActive
                        ? 'text-black bg-black/5 font-medium'
                        : 'text-black hover:bg-black/5 font-normal'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>

            {/* Right side */}
            <div className="hidden items-center gap-3 md:flex">
              <button
                onClick={() => setIsLoginOpen(true)}
                className="px-4 py-1.5 text-[13px] text-black hover:bg-black/5 font-normal rounded-full transition-all duration-300 outline-none focus:outline-none"
              >
                Đăng nhập
              </button>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen((o) => !o)}
              className="flex items-center justify-center rounded-full p-2 text-charcoal hover:bg-black/5 md:hidden"
              aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </nav>
        </header>
      </div>

      {/* Mobile menu (renders below the sticky pill) */}
      {mobileOpen && (
        <div className="fixed top-24 left-4 right-4 z-40 rounded-3xl border border-beige bg-cream shadow-2xl md:hidden animate-fadeIn overflow-hidden">
          <div className="space-y-1 px-4 py-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] transition-colors ${
                    isActive
                      ? 'bg-black/5 text-black font-medium'
                      : 'text-black hover:bg-black/5 font-normal'
                  }`
                }
              >
                <item.icon size={18} strokeWidth={2.5} />
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => {
                setMobileOpen(false);
                setIsLoginOpen(true);
              }}
              className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[15px] text-black hover:bg-black/5 font-normal transition-colors"
            >
              Đăng nhập
            </button>
          </div>
        </div>
      )}

      <LoginModal isOpen={isLoginOpen} onClose={() => setIsLoginOpen(false)} onRegisterSuccess={() => setIsOnboardingOpen(true)} />
      <OnboardingModal isOpen={isOnboardingOpen} onClose={() => setIsOnboardingOpen(false)} />
    </>
  );
}
