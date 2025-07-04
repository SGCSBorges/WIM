import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { LoginPage } from "./components/auth/LoginPage";
import { RegisterPage } from "./components/auth/RegisterPage";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { Dashboard } from "./components/dashboard/Dashboard";
import { Layout } from "./components/layout/Layout";
import { ArticlesList } from "./components/articles/ArticlesList";
import { WarrantiesList } from "./components/warranties/WarrantiesList";
import { SharingManagement } from "./components/sharing/SharingManagement";

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Navigate to="/dashboard" replace />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/articles"
            element={
              <ProtectedRoute>
                <Layout>
                  <ArticlesList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/warranties"
            element={
              <ProtectedRoute>
                <Layout>
                  <WarrantiesList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/sharing"
            element={
              <ProtectedRoute requirePowerUser>
                <Layout>
                  <SharingManagement />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Layout>
                  <div className="p-6">
                    <h1 className="text-2xl font-bold text-gray-900">
                      Paramètres
                    </h1>
                    <p className="text-gray-600">
                      Paramètres du compte - À implémenter
                    </p>
                  </div>
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
