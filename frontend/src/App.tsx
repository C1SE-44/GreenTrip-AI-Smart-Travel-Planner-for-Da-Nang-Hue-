import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import ExplorePage from '@/pages/ExplorePage';
import LandingPage from '@/pages/LandingPage';
import PlannerPage from '@/pages/PlannerPage';
import { SavedPlacesProvider } from '@/context/SavedPlacesContext';

function App() {
  return (
    <BrowserRouter>
      <SavedPlacesProvider>
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
        <Route path="/explore" element={<ExplorePage initialView="explore" />} />

        {/* Trip Planner page */}
        <Route path="/planner" element={<ExplorePage initialView="trips" />} />
        <Route path="/my-trips" element={<ExplorePage initialView="trips" />} />
        <Route path="/trips" element={<ExplorePage initialView="trips" />} />

        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SavedPlacesProvider>
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
