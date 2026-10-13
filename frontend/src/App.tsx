import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import ExplorePage from '@/pages/ExplorePage';
import LandingPage from '@/pages/LandingPage';

function App() {
  return (
    <BrowserRouter>
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
        <Route path="/verify-email" element={<VerifyEmailPage />} />


        {/* Explore page - Now has its own Sidebar layout */}
        <Route path="/explore" element={<ExplorePage />} />

        {/* Placeholder routes for future sprints */}
        <Route
          path="/planner"
          element={
            <>
              <Navbar />
              <ComingSoon title="Lập Lịch Trình" />
            </>
          }
        />
        <Route
          path="/my-trips"
          element={
            <>
              <Navbar />
              <ComingSoon title="Chuyến Đi Của Tôi" />
            </>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 pt-16">
      <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
      <p className="mt-2 text-sm text-gray-500">Tính năng này sẽ có trong sprint tiếp theo</p>
    </div>
  );
}

export default App;
