import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import { lazy, Suspense } from 'react';
import LandingPage from '@/pages/LandingPage';
import { SavedPlacesProvider } from '@/context/SavedPlacesContext';

const ExplorePage = lazy(() => import('@/pages/ExplorePage'));
const VerifyEmailPage = lazy(() => import('@/pages/VerifyEmailPage'));

function App() {
  return (
    <BrowserRouter>
      <SavedPlacesProvider>
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-cream text-sm text-neutral-600" role="status">Đang mở trang…</div>}>
      <Routes>
        {/* Landing Page & Auth Modal Overlay Routes */}
        <Route
          path="/"
          element={
            <>
              <Navbar />
              <LandingPage />
            </>
          }
        />
        <Route
          path="/login"
          element={
            <>
              <Navbar />
              <LandingPage />
            </>
          }
        />
        <Route
          path="/register"
          element={
            <>
              <Navbar />
              <LandingPage />
            </>
          }
        />
        <Route
          path="/onboarding"
          element={
            <>
              <Navbar />
              <LandingPage />
            </>
          }
        />
        <Route path="/verify-email" element={<VerifyEmailPage />} />


        {/* Explore page - Now has its own Sidebar layout */}
        <Route path="/home" element={<ExplorePage initialView="home" />} />
        <Route path="/explore" element={<ExplorePage initialView="explore" />} />
        <Route path="/saved" element={<ExplorePage initialView="saved" />} />

        {/* Trip Planner page */}
        <Route path="/planner" element={<ExplorePage initialView="trips" />} />
        <Route path="/my-trips" element={<ExplorePage initialView="trips" />} />
        <Route path="/trips" element={<ExplorePage initialView="trips" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      </SavedPlacesProvider>
    </BrowserRouter>
  );
}

export default App;
