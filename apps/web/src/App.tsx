import React, { useState } from "react";
import ArticlesList from "./components/articles/ArticlesList";
import Dashboard from "./components/dashboard/Dashboard";
import LoginForm from "./components/auth/LoginForm";
import { authAPI } from "./services/api";

export default function App() {
  const [currentView, setCurrentView] = useState<
    "dashboard" | "articles" | "home"
  >("home");

  // Real authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return authAPI.isAuthenticated();
  });

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    authAPI.logout();
    setIsAuthenticated(false);
    setCurrentView("home");
  };

  // Login screen
  if (!isAuthenticated) {
    return <LoginForm onLogin={handleLogin} />;
  }
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">WIM</h1>
              <div className="flex space-x-4">
                <button
                  onClick={() => setCurrentView("home")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "home"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Home
                </button>
                <button
                  onClick={() => setCurrentView("dashboard")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "dashboard"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Dashboard
                </button>
                <button
                  onClick={() => setCurrentView("articles")}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    currentView === "articles"
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  Articles
                </button>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        {currentView === "home" && (
          <div>
            <header className="mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                Welcome to WIM
              </h1>
              <p className="text-gray-600">
                Warranty & Inventory Manager - Manage your articles, warranties,
                and more.
              </p>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div
                className="rounded-xl border border-gray-200 bg-white p-4 shadow cursor-pointer hover:bg-gray-50"
                onClick={() => setCurrentView("articles")}
              >
                <h2 className="font-semibold">Inventaire</h2>
                <p className="text-sm text-gray-600">
                  Liste et détail des articles.
                </p>
                <button className="mt-2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                  Manage Articles
                </button>
              </div>
              <div
                className="rounded-xl border border-gray-200 bg-white p-4 shadow cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setCurrentView("dashboard")}
              >
                <h2 className="font-semibold text-lg text-gray-900 mb-2">
                  📊 Dashboard
                </h2>
                <p className="text-sm text-gray-600 mb-3">
                  Statistics and overview.
                </p>
                <button className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors">
                  View Dashboard
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow">
                <h2 className="font-semibold text-lg text-gray-900 mb-2">
                  🛡️ Garanties
                </h2>
                <p className="text-sm text-gray-600 mb-3">
                  Dates d'achat, fin, statut.
                </p>
                <button className="px-3 py-1 bg-gray-400 text-white text-sm rounded cursor-not-allowed">
                  Coming Soon
                </button>
              </div>
            </section>
          </div>
        )}

        {currentView === "dashboard" && <Dashboard />}
        {currentView === "articles" && <ArticlesList />}
      </main>
    </div>
  );
}
