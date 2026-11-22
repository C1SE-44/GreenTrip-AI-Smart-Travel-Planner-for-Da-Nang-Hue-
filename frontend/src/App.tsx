import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from '@/components/layout/Navbar';
import VerifyEmailPage from '@/pages/VerifyEmailPage';
import ExplorePage from '@/pages/ExplorePage';
import LandingPage from '@/pages/LandingPage';
import AdminDashboardPage from '@/pages/AdminDashboardPage';
import AdminRouteGuard from '@/components/admin/AdminRouteGuard';
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
        <Route path="/home" element={<ExplorePage initialView="home" />} />
        <Route path="/explore" element={<ExplorePage initialView="explore" />} />
        <Route path="/saved" element={<ExplorePage initialView="saved" />} />
        <Route path="/chat" element={<ExplorePage initialView="chat" />} />
        <Route path="/profile" element={<ExplorePage initialView="profile" />} />

        {/* Trip Planner page */}
        <Route path="/planner" element={<ExplorePage initialView="trips" />} />
        <Route path="/my-trips" element={<ExplorePage initialView="trips" />} />
        <Route path="/trips" element={<ExplorePage initialView="trips" />} />

        {/* Protected RBAC Admin Portal */}
        <Route
          path="/admin"
          element={
            <AdminRouteGuard>
              {(adminUser) => <AdminDashboardPage adminUser={adminUser} />}
            </AdminRouteGuard>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </SavedPlacesProvider>
    </BrowserRouter>
  );
}

export default App;
