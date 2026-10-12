import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Compass, CalendarCheck, MapPinned, LogIn, UserPlus, LogOut } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import LoginModal from '@/components/auth/LoginModal';

const navItems = [
  { to: '/explore', label: 'Khám Phá', icon: Compass },
  { to: '/planner', label: 'Lập Lịch Trình', icon: CalendarCheck },
  { to: '/my-trips', label: 'Chuyến Đi Của Tôi', icon: MapPinned },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const [authModal, setAuthModal] = useState<{
    isOpen: boolean;
    mode: 'login' | 'register';
  }>({
    isOpen: location.pathname === '/login' || location.pathname === '/register',
    mode: location.pathname === '/register' ? 'register' : 'login',
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!(localStorage.getItem('access_token') || sessionStorage.getItem('access_token'));
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Sync auth modal with URL routes /login and /register
  useEffect(() => {
    if (location.pathname === '/login') {
      setAuthModal({ isOpen: true, mode: 'login' });
    } else if (location.pathname === '/register') {
      setAuthModal({ isOpen: true, mode: 'register' });
    } else if (location.pathname === '/') {
      setAuthModal((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev));
    }
  }, [location.pathname]);

  // Synchronize authentication status
  useEffect(() => {
    const checkAuth = () => {
      const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
      setIsAuthenticated(!!token);
    };
    checkAuth();
    window.addEventListener('auth-change', checkAuth);
    window.addEventListener('storage', checkAuth);
    return () => {
      window.removeEventListener('auth-change', checkAuth);
      window.removeEventListener('storage', checkAuth);
    };
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    sessionStorage.removeItem('access_token');
    window.dispatchEvent(new Event('auth-change'));
    setIsAuthenticated(false);
    navigate('/');
  };

  const handleCloseModal = () => {
    setAuthModal((prev) => ({ ...prev, isOpen: false }));
    if (location.pathname === '/login' || location.pathname === '/register') {
      navigate('/', { replace: true });
    }
  };

  const handleLoginSuccess = () => {
    setAuthModal((prev) => ({ ...prev, isOpen: false }));
    navigate('/explore');
  };

  return (
    <>
      <div className={`fixed top-0 left-0 right-0 z-40 transition-all duration-500 ease-out flex justify-center ${scrolled ? 'pt-[7px] px-4' : 'pt-0 px-0'}`}>
        <header
          className={`
            w-full transition-all duration-500 ease-out
            ${scrolled 
              ? 'max-w-[1400px] bg-white/95 backdrop-blur-md shadow-card border border-gray-100 rounded-full' 
              : 'max-w-full bg-transparent rounded-none border-transparent'
            }
          `}
        >
          <nav className={`mx-auto w-full max-w-[1400px] flex items-center justify-between transition-all duration-500 ${scrolled ? 'h-[50px]' : 'h-[60px]'} px-6 lg:px-8`}>
            <Link to="/" className="flex items-center outline-none focus:outline-none">
              <Logo size="md" />
            </Link>

            {/* Desktop nav */}
            <div className="hidden items-center gap-1.5 md:flex">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-full px-4 py-1.5 text-[14px] transition-all duration-300 outline-none focus:outline-none ${
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

            {/* Right side - Wanderlog style pill buttons */}
            <div className="hidden items-center gap-2.5 md:flex">
              {isAuthenticated ? (
                <>
                  <NavLink
                    to="/my-trips"
                    className="px-4 py-1.5 text-[14px] text-charcoal/80 hover:text-black hover:bg-black/5 font-medium rounded-full transition-all"
                  >
                    Chuyến đi của tôi
                  </NavLink>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-1.5 text-[14px] text-charcoal/60 hover:text-red-600 hover:bg-red-50 font-medium rounded-full transition-all cursor-pointer"
                  >
                    Đăng xuất
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="px-4 py-1.5 text-[14px] border border-black/20 hover:border-black/50 text-black hover:bg-black/5 font-medium rounded-full transition-all duration-300 outline-none focus:outline-none cursor-pointer"
                  >
                    Đăng nhập
                  </Link>
                  <Link
                    to="/register"
                    className="px-4 py-1.5 text-[14px] border border-black/20 hover:border-black/50 text-black hover:bg-black/5 font-medium rounded-full transition-all duration-300 outline-none focus:outline-none cursor-pointer"
                  >
                    Đăng ký
                  </Link>
                </>
              )}
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
                  `flex items-center gap-3 rounded-2xl px-4 py-3 text-[15px] transition-colors ${isActive
                    ? 'bg-black/5 text-black font-medium'
                    : 'text-black hover:bg-black/5 font-normal'
                  }`
                }
              >
                <item.icon size={18} strokeWidth={2.5} />
                {item.label}
              </NavLink>
            ))}

            {isAuthenticated ? (
              <button
                onClick={() => {
                  setMobileOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-[15px] text-red-600 hover:bg-red-50 font-medium transition-colors cursor-pointer"
              >
                <LogOut size={18} strokeWidth={2.5} />
                Đăng xuất
              </button>
            ) : (
              <div className="pt-2 flex flex-col gap-2">
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black/20 text-black hover:bg-black/5 px-4 py-2.5 text-[15px] font-medium transition-colors cursor-pointer"
                >
                  <LogIn size={18} strokeWidth={2.5} />
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-black/20 text-black hover:bg-black/5 px-4 py-2.5 text-[15px] font-medium transition-colors cursor-pointer"
                >
                  <UserPlus size={18} strokeWidth={2.5} />
                  Đăng ký
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wanderlog Style Popup Modal */}
      <LoginModal
        isOpen={authModal.isOpen}
        initialMode={authModal.mode}
        onClose={handleCloseModal}
        onLoginSuccess={handleLoginSuccess}
      />
    </>
  );
}
