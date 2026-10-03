import { Suspense, lazy } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider, useAuth } from "./context/AuthContext";
import DashboardPage from "./pages/DashboardPage";
import LoginPage from "./pages/LoginPage";
import SettingsPage from "./pages/SettingsPage";

// แยกออกเป็น chunk ต่างหากเพราะไลบรารีอ่านไฟล์ Excel (exceljs) มีขนาดใหญ่
// และหน้านี้ไม่ได้ใช้บ่อย — โหลดเฉพาะตอนเข้าหน้า "นำเข้าจาก Excel" เท่านั้น
const ImportPage = lazy(() => import("./pages/ImportPage"));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-kit-muted">กำลังโหลด...</div>;
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route
          path="import"
          element={
            <Suspense fallback={<p className="text-kit-muted">กำลังโหลด...</p>}>
              <ImportPage />
            </Suspense>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </Router>
  );
}
