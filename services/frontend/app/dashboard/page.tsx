"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface UserProfile {
  name: string;
  role: string;
  email?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeNav, setActiveNav] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [clockStr, setClockStr] = useState("09:23:48 PST");
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(true);

  // Theme setup and persistence
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "light") {
      setIsDark(false);
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      setIsDark(true);
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
  }, []);

  const toggleTheme = () => {
    setIsDark((prev) => {
      const nextTheme = !prev;
      localStorage.setItem("theme", nextTheme ? "dark" : "light");
      if (nextTheme) {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.add("light");
        document.documentElement.classList.remove("dark");
      }
      return nextTheme;
    });
  };

  // Authentication check
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token) {
      router.push("/login");
      return;
    }

    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        setUser({ name: "Operator", role: "operator" });
      }
    } else {
      setUser({ name: "user", role: "OPERATOR" });
    }
  }, [router]);

  // Real-time ticking clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: "America/Los_Angeles",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      };
      setClockStr(now.toLocaleTimeString("en-US", options) + " PST");
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  return (
    <div
      className={`min-h-screen font-sans relative flex flex-col lg:flex-row antialiased transition-colors duration-200 ${
        isDark
          ? "bg-[#0a0e17] text-[#f8fafc] selection:bg-cyan-500 selection:text-black"
          : "bg-[#f8fafc] text-slate-900 selection:bg-cyan-600 selection:text-white"
      }`}
    >
      {/* Background Ambience */}
      <div className={isDark ? "bg-grid-overlay" : "bg-grid-overlay-light"} />

      {/* Interactive Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-2xl backdrop-blur-md animate-bounce border ${
            isDark
              ? "bg-[#1e293b]/95 border-cyan-500/50 text-white"
              : "bg-white/95 border-cyan-600/40 text-slate-900 shadow-cyan-900/10"
          }`}
        >
          <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-500 animate-ping" />
          <span className="text-xs font-mono font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Mobile Top Navbar (Visible on < 1024px) */}
      <header
        className={`lg:hidden sticky top-0 z-40 w-full px-4 py-3 flex items-center justify-between border-b backdrop-blur-md transition-colors ${
          isDark
            ? "bg-[#0f172a]/90 border-white/10"
            : "bg-white/90 border-slate-200 shadow-sm"
        }`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`p-2 rounded-md border transition ${
              isDark
                ? "bg-[#1e293b] text-slate-300 hover:text-white border-white/10"
                : "bg-slate-100 text-slate-700 hover:text-black border-slate-300"
            }`}
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-[0_0_12px_rgba(6,182,212,0.3)]">
              P
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider leading-none">Smart Parking</div>
              <div className={`text-[10px] font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                ANALYTICS v4.2
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Light/Dark Toggle on Mobile */}
          <button
            onClick={toggleTheme}
            className={`p-2 rounded-lg border text-xs transition ${
              isDark
                ? "bg-[#1e293b] text-amber-400 border-white/10 hover:bg-[#283548]"
                : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
            }`}
            title="Toggle Light/Dark Mode"
          >
            {isDark ? "☀️" : "🌙"}
          </button>

          <button
            onClick={handleLogout}
            className="text-[11px] font-mono font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 px-2.5 py-1.5 rounded transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm transition-opacity"
        />
      )}

      {/* Sidebar Navigation */}
      {/* Positioned cleanly: self-start, h-fit, live time and sign out grouped neatly right under menu! */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex flex-col p-4 sm:p-5 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:self-start lg:h-fit lg:rounded-2xl lg:m-4 lg:sticky lg:top-4 border ${
          isDark
            ? "bg-[#0f172a]/95 border-white/10 backdrop-blur-xl shadow-2xl"
            : "bg-white/95 border-slate-200/90 backdrop-blur-xl shadow-lg"
        } ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand Header */}
        <div className={`flex items-center gap-3 pb-4 border-b mb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-[0_0_15px_rgba(6,182,212,0.35)] shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="4" />
              <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
            </svg>
          </div>
          <div className="min-w-0">
            <h1 className={`text-sm font-bold tracking-wider uppercase truncate ${isDark ? "text-white" : "text-slate-900"}`}>
              Smart Parking
            </h1>
            <span className={`text-[11px] font-mono tracking-wider block ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              ANALYTICS v4.2
            </span>
          </div>
        </div>

        {/* User Badge */}
        <div
          className={`mb-4 p-2.5 rounded-lg border flex items-center justify-between ${
            isDark
              ? "bg-[#1e293b]/60 border-white/5"
              : "bg-slate-50 border-slate-200"
          }`}
        >
          <div className="min-w-0">
            <div className={`text-[10px] uppercase font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Operator
            </div>
            <div className={`text-xs font-semibold truncate ${isDark ? "text-white" : "text-slate-900"}`}>
              {user?.name || "user"}
            </div>
          </div>
          <span className="text-[10px] font-mono uppercase font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
            {user?.role || "OPERATOR"}
          </span>
        </div>

        {/* Navigation Links (Compact, NO flex-1 stretching) */}
        <nav className="flex flex-col gap-1">
          {[
            {
              id: "overview",
              label: "Overview",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                </svg>
              ),
            },
            {
              id: "live-map",
              label: "Live Map",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
              ),
            },
            {
              id: "traffic-flow",
              label: "Traffic Flow",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              ),
            },
            {
              id: "predictions",
              label: "Predictions",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              ),
            },
            {
              id: "alerts",
              label: "Alerts",
              badge: "2",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              ),
            },
            {
              id: "system-health",
              label: "System Health",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              ),
            },
            {
              id: "logs",
              label: "Logs",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
              ),
            },
            {
              id: "simulation",
              label: "Replay Simulation",
              badge: "STREAM",
              href: "/simulation",
              icon: (
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              ),
            },
          ].map((item) => {
            const isActive = activeNav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.href) {
                    router.push(item.href);
                    return;
                  }
                  setActiveNav(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                  isActive
                    ? isDark
                      ? "bg-gradient-to-r from-cyan-500/20 to-transparent text-cyan-400 border-l-4 border-cyan-400 font-semibold"
                      : "bg-gradient-to-r from-cyan-500/15 to-transparent text-cyan-700 border-l-4 border-cyan-600 font-bold"
                    : isDark
                    ? "text-slate-400 hover:text-white hover:bg-[#18243c]"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                {item.icon}
                <span className="flex-1 text-left">{item.label}</span>
                {item.badge && (
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-500 border border-red-500/40">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Live time & Sign Out Section (Directly underneath Logs, NOT pushed down) */}
        <div className={`mt-5 pt-4 border-t flex flex-col gap-2.5 ${isDark ? "border-white/10" : "border-slate-200"}`}>
          {/* Live Time Indicator */}
          <div
            className={`flex items-center gap-2 text-xs font-mono px-3 py-2 rounded-lg border w-full ${
              isDark
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            <span className="live-dot" />
            <span className="font-semibold">LIVE &bull; {clockStr}</span>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={handleLogout}
            className={`w-full flex items-center justify-center gap-2 text-xs font-mono font-bold uppercase py-2 rounded-lg border transition ${
              isDark
                ? "text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 border-red-500/30"
                : "text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border-red-200"
            }`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            SIGN OUT
          </button>

          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            className={`w-full flex items-center justify-center gap-2 text-xs font-mono py-1.5 rounded-lg border transition ${
              isDark
                ? "bg-[#1e293b]/60 hover:bg-[#1e293b] text-amber-300 border-white/5"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            }`}
          >
            <span>{isDark ? "☀️ Switch to Light Mode" : "🌙 Switch to Dark Mode"}</span>
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 p-4 sm:p-6 lg:p-6 lg:pl-0 max-w-[1720px] w-full mx-auto relative z-10 space-y-5">
        {/* Top Header Banner */}
        <div className="flex flex-col gap-4">
          <div
            className={`border border-l-4 border-l-red-500 rounded-xl p-3.5 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-md ${
              isDark
                ? "bg-gradient-to-r from-red-500/15 via-[#131c2e] to-[#131c2e] border-red-500/30 shadow-[0_4px_20px_rgba(239,68,68,0.1)]"
                : "bg-gradient-to-r from-red-50 via-white to-white border-red-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-red-500/20 text-red-500 px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase tracking-wider">
                <span className="alert-dot" />
                <span>System Interpretation</span>
              </div>
              <div className={`text-sm sm:text-base font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                HIGH CAPACITY PRESSURE &mdash;{" "}
                <span className="text-red-500 font-bold">Floor 5 at risk</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Quick Theme Toggle in Banner */}
              <button
                onClick={toggleTheme}
                className={`inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase px-3 py-2 rounded-lg border transition ${
                  isDark
                    ? "bg-[#1e293b] hover:bg-[#283548] text-amber-400 border-white/10"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                }`}
                title="Toggle Theme"
              >
                <span>{isDark ? "☀️ Light" : "🌙 Dark"}</span>
              </button>

              <button
                onClick={() => showToast("Exporting Parking Analytics Dataset (CSV/PDF)...")}
                className={`inline-flex items-center gap-2 text-xs font-mono font-bold uppercase px-3.5 py-2 rounded-lg border transition duration-200 shadow-sm ${
                  isDark
                    ? "bg-[#1e293b] hover:bg-cyan-500 hover:text-slate-950 text-white border-white/10"
                    : "bg-white hover:bg-cyan-600 hover:text-white text-slate-800 border-slate-300"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* KPI Metrics Grid (2 cols mobile, 3 cols tablet, 6 cols desktop) */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
            {/* KPI 1 */}
            <div
              className={`border rounded-xl p-4 transition-all duration-200 shadow-sm hover:shadow-md ${
                isDark
                  ? "bg-[#131c2e] hover:bg-[#18243c] border-white/10"
                  : "bg-white hover:bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">Occupancy</span>
                <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                78%
              </div>
              <div className="text-xs font-mono text-cyan-600 dark:text-cyan-400 flex items-center gap-1 font-semibold">
                <span>&darr; -0.12%/m</span>
              </div>
            </div>

            {/* KPI 2 */}
            <div
              className={`border rounded-xl p-4 transition-all duration-200 shadow-sm hover:shadow-md ${
                isDark
                  ? "bg-[#131c2e] hover:bg-[#18243c] border-white/10"
                  : "bg-white hover:bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">Avail / Total</span>
                <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className={`text-2xl sm:text-3xl font-mono font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  432
                </span>
                <span className={`text-xs sm:text-sm font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  / 2050
                </span>
              </div>
              <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                Net Flow: +12
              </div>
            </div>

            {/* KPI 3 */}
            <div
              className={`border rounded-xl p-4 transition-all duration-200 shadow-sm hover:shadow-md ${
                isDark
                  ? "bg-[#131c2e] hover:bg-[#18243c] border-white/10"
                  : "bg-white hover:bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">Vehicles In/Out</span>
                <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="17 1 21 5 17 9" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <polyline points="7 23 3 19 7 15" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </div>
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className={`text-2xl sm:text-3xl font-mono font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  1.2k
                </span>
                <span className={`text-xs sm:text-sm font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  / 1.1k
                </span>
              </div>
              <div className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                Vel: +0.42 KM/H
              </div>
            </div>

            {/* KPI 4 */}
            <div
              className={`border rounded-xl p-4 transition-all duration-200 shadow-sm hover:shadow-md ${
                isDark
                  ? "bg-[#131c2e] hover:bg-[#18243c] border-white/10"
                  : "bg-white hover:bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">Predicted Peak</span>
                <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                  <polyline points="17 6 23 6 23 12" />
                </svg>
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                95%
              </div>
              <div className="text-xs font-mono text-amber-600 dark:text-amber-400 font-semibold">
                Runway: ~40m
              </div>
            </div>

            {/* KPI 5 (Alert) */}
            <div
              className={`border rounded-xl p-4 transition-all duration-200 relative overflow-hidden ${
                isDark
                  ? "bg-[#131c2e] hover:bg-[#18243c] border-red-500/40 shadow-[0_4px_20px_rgba(239,68,68,0.15)]"
                  : "bg-red-50/50 hover:bg-red-50 border-red-300 shadow-sm"
              }`}
            >
              <div className="absolute top-0 left-0 w-full h-0.5 bg-red-500" />
              <div className="flex items-center justify-between text-red-500 mb-2">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-bold">Active Incidents</span>
                <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="text-2xl sm:text-3xl font-mono font-bold text-red-500 mb-1">2</div>
              <div className="text-xs font-mono text-red-500 font-bold">
                Action Required
              </div>
            </div>

            {/* KPI 6 */}
            <div
              className={`border rounded-xl p-4 transition-all duration-200 shadow-sm hover:shadow-md ${
                isDark
                  ? "bg-[#131c2e] hover:bg-[#18243c] border-white/10"
                  : "bg-white hover:bg-slate-50 border-slate-200"
              }`}
            >
              <div className="flex items-center justify-between text-slate-400 dark:text-slate-500 mb-2">
                <span className="text-[10px] sm:text-[11px] uppercase tracking-wider font-semibold">Sensor Health</span>
                <svg className="w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="2" />
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                </svg>
              </div>
              <div className={`text-2xl sm:text-3xl font-mono font-bold mb-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                98.7%
              </div>
              <div className="text-xs font-mono text-amber-600 dark:text-amber-400 font-semibold">
                12 Offline
              </div>
            </div>
          </div>
        </div>

        {/* Primary Analytics Grid: 2 Columns on Desktop, Stacks on Tablet & Mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column: Floor Analytics (Spans 2 cols) */}
          <section
            className={`lg:col-span-2 border rounded-2xl p-4 sm:p-6 shadow-sm flex flex-col justify-between ${
              isDark
                ? "bg-[#131c2e] border-white/10"
                : "bg-white border-slate-200 shadow-sm"
            }`}
          >
            <div>
              <div className={`flex items-center justify-between pb-4 border-b mb-4 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className={`flex items-center gap-2.5 text-sm sm:text-base font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                  <svg className="w-5 h-5 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                  Floor Analytics
                </div>
                <button
                  onClick={() => showToast("Loading detailed Floor Analytics...")}
                  className="text-[11px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 hover:underline bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded transition"
                >
                  VIEW ALL
                </button>
              </div>

              {/* Responsive Table with horizontal scroll */}
              <div className="overflow-x-auto w-full -mx-2 px-2 sm:mx-0 sm:px-0">
                <table className="w-full min-w-[620px] text-xs font-mono border-separate border-spacing-y-1">
                  <thead>
                    <tr className={`text-[11px] uppercase tracking-wider text-left ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      <th className={`py-2.5 px-3 rounded-l-lg ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>FLR</th>
                      <th className={`py-2.5 px-3 ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>Occupancy</th>
                      <th className={`py-2.5 px-3 ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>Cap</th>
                      <th className={`py-2.5 px-3 ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>Occ</th>
                      <th className={`py-2.5 px-3 ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>Avail</th>
                      <th className={`py-2.5 px-3 ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>15m &Delta;</th>
                      <th className={`py-2.5 px-3 ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>Velocity</th>
                      <th className={`py-2.5 px-3 ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>Pred 30m</th>
                      <th className={`py-2.5 px-3 rounded-r-lg ${isDark ? "bg-[#1e293b]/60" : "bg-slate-100"}`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* F1 */}
                    <tr className={`transition-colors rounded-lg ${isDark ? "hover:bg-[#18243c]" : "hover:bg-slate-50"}`}>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold border ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-slate-100 border-slate-300 text-slate-800"}`}>
                          F1
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="progress-container">
                          <div className={`progress-bar-bg ${isDark ? "" : "bg-slate-200"}`}>
                            <div className="progress-bar-fill fill-danger" style={{ width: "98%" }} />
                          </div>
                          <span className="text-xs font-semibold">98%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">500</td>
                      <td className="py-2.5 px-3">488</td>
                      <td className="py-2.5 px-3 font-bold text-red-500">12</td>
                      <td className="py-2.5 px-3 text-cyan-600 dark:text-cyan-400 font-semibold">-1%</td>
                      <td className="py-2.5 px-3 text-slate-500">-0.05 KM/H</td>
                      <td className="py-2.5 px-3 font-semibold">95%</td>
                      <td className="py-2.5 px-3">
                        <span className="status-pill status-busy">BUSY</span>
                      </td>
                    </tr>

                    {/* F2 */}
                    <tr className={`transition-colors rounded-lg ${isDark ? "hover:bg-[#18243c]" : "hover:bg-slate-50"}`}>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold border ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-slate-100 border-slate-300 text-slate-800"}`}>
                          F2
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="progress-container">
                          <div className={`progress-bar-bg ${isDark ? "" : "bg-slate-200"}`}>
                            <div className="progress-bar-fill fill-warning" style={{ width: "85%" }} />
                          </div>
                          <span className="text-xs font-semibold">85%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">400</td>
                      <td className="py-2.5 px-3">340</td>
                      <td className="py-2.5 px-3 font-semibold">60</td>
                      <td className="py-2.5 px-3 text-amber-500 font-semibold">+5%</td>
                      <td className="py-2.5 px-3 text-slate-500">-0.05 KM/H</td>
                      <td className="py-2.5 px-3 font-semibold">92%</td>
                      <td className="py-2.5 px-3">
                        <span className="status-pill status-busy">BUSY</span>
                      </td>
                    </tr>

                    {/* F4 */}
                    <tr className={`transition-colors rounded-lg ${isDark ? "hover:bg-[#18243c]" : "hover:bg-slate-50"}`}>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold border ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-slate-100 border-slate-300 text-slate-800"}`}>
                          F4
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="progress-container">
                          <div className={`progress-bar-bg ${isDark ? "" : "bg-slate-200"}`}>
                            <div className="progress-bar-fill fill-danger" style={{ width: "91%" }} />
                          </div>
                          <span className="text-xs font-semibold">91%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">300</td>
                      <td className="py-2.5 px-3">273</td>
                      <td className="py-2.5 px-3 font-bold text-red-500">27</td>
                      <td className="py-2.5 px-3 text-red-500 font-bold">+15%</td>
                      <td className="py-2.5 px-3 text-slate-500">-0.05 KM/H</td>
                      <td className="py-2.5 px-3 text-red-500 font-bold">100%</td>
                      <td className="py-2.5 px-3">
                        <span className="status-pill status-full">FULL SOON</span>
                      </td>
                    </tr>

                    {/* F3 */}
                    <tr className={`transition-colors rounded-lg ${isDark ? "hover:bg-[#18243c]" : "hover:bg-slate-50"}`}>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold border ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-slate-100 border-slate-300 text-slate-800"}`}>
                          F3
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="progress-container">
                          <div className={`progress-bar-bg ${isDark ? "" : "bg-slate-200"}`}>
                            <div className="progress-bar-fill fill-success" style={{ width: "62%" }} />
                          </div>
                          <span className="text-xs font-semibold">62%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">300</td>
                      <td className="py-2.5 px-3">186</td>
                      <td className="py-2.5 px-3 font-semibold">114</td>
                      <td className="py-2.5 px-3 text-slate-400">0%</td>
                      <td className="py-2.5 px-3 text-slate-500">-0.05 KM/H</td>
                      <td className="py-2.5 px-3 font-semibold">65%</td>
                      <td className="py-2.5 px-3">
                        <span className="status-pill status-normal">NORMAL</span>
                      </td>
                    </tr>

                    {/* F5 */}
                    <tr className={`transition-colors rounded-lg ${isDark ? "hover:bg-[#18243c]" : "hover:bg-slate-50"}`}>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded font-bold border ${isDark ? "bg-[#1e293b] border-white/10 text-white" : "bg-slate-100 border-slate-300 text-slate-800"}`}>
                          F5
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="progress-container">
                          <div className={`progress-bar-bg ${isDark ? "" : "bg-slate-200"}`}>
                            <div className="progress-bar-fill fill-success" style={{ width: "40%" }} />
                          </div>
                          <span className="text-xs font-semibold">40%</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">300</td>
                      <td className="py-2.5 px-3">120</td>
                      <td className="py-2.5 px-3 font-bold text-emerald-600 dark:text-emerald-400">180</td>
                      <td className="py-2.5 px-3 text-cyan-600 dark:text-cyan-400 font-semibold">-2%</td>
                      <td className="py-2.5 px-3 text-slate-500">-0.05 KM/H</td>
                      <td className="py-2.5 px-3 font-semibold">38%</td>
                      <td className="py-2.5 px-3">
                        <span className="status-pill status-normal">NORMAL</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Historical Context & 24x7 Heatmap Section */}
            <div className={`mt-5 pt-4 border-t ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-3 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Historical Context &amp; 24x7 Occupancy (Day &times; Hour)
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className={`border rounded-lg p-2.5 sm:p-3 ${isDark ? "bg-[#1e293b]/70 border-white/5" : "bg-slate-50 border-slate-200"}`}>
                  <div className={`text-[10px] sm:text-xs uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Today vs Yesterday
                  </div>
                  <div className="text-base sm:text-lg font-mono font-bold text-amber-500">+14.2%</div>
                </div>
                <div className={`border rounded-lg p-2.5 sm:p-3 ${isDark ? "bg-[#1e293b]/70 border-white/5" : "bg-slate-50 border-slate-200"}`}>
                  <div className={`text-[10px] sm:text-xs uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Today vs Last Week
                  </div>
                  <div className="text-base sm:text-lg font-mono font-bold text-cyan-600 dark:text-cyan-400">-2.1%</div>
                </div>
              </div>

              {/* 24x7 Heatmap Hour Blocks */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] sm:text-[11px] font-mono text-slate-500">
                  <span>Mon (00:00)</span>
                  <span>12:00 PM (Peak)</span>
                  <span>Sun (23:00)</span>
                </div>
                <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 sm:gap-1.5">
                  {[
                    "h-1", "h-1", "h-2", "h-3", "h-4", "h-5", "h-5", "h-4",
                    "h-3", "h-2", "h-1", "h-1", "h-2", "h-4", "h-5", "h-4",
                    "h-3", "h-2", "h-2", "h-1", "h-1", "h-2", "h-3", "h-2",
                  ].map((level, idx) => (
                    <div
                      key={idx}
                      title={`Hour ${idx}:00 - Capacity stress level ${level}`}
                      className={`heat-cell ${level}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Active Incidents & Recommended Actions */}
          <div className="flex flex-col gap-5">
            {/* Active Incidents */}
            <section
              className={`border rounded-2xl p-4 sm:p-5 shadow-sm ${
                isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                  <svg className="w-4 h-4 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Active Incidents
                </div>
                <button
                  onClick={() => showToast("Viewing all 2 active incidents...")}
                  className="text-[10px] font-mono font-semibold text-red-500 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded transition"
                >
                  VIEW ALL (2)
                </button>
              </div>

              <div className="space-y-3">
                {/* Incident 1 */}
                <div
                  className={`border border-l-4 border-l-red-500 rounded-xl p-3.5 transition ${
                    isDark
                      ? "bg-[#1e293b]/50 border-white/5 hover:bg-[#18243c]"
                      : "bg-red-50/40 border-slate-200 hover:bg-red-50/70"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="status-pill status-full">CRITICAL</span>
                    <span className="text-[11px] font-mono text-slate-500">14:30:12</span>
                  </div>
                  <div className={`text-xs sm:text-sm font-medium mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                    Emergency Call Box Activated - Floor 5 Sector C
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => showToast("Security team dispatched to Floor 5 Sector C.")}
                      className="text-[11px] font-mono font-bold uppercase bg-red-500/15 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/30 px-3 py-1 rounded transition"
                    >
                      INVESTIGATE
                    </button>
                  </div>
                </div>

                {/* Incident 2 */}
                <div
                  className={`border border-l-4 border-l-amber-500 rounded-xl p-3.5 transition ${
                    isDark
                      ? "bg-[#1e293b]/50 border-white/5 hover:bg-[#18243c]"
                      : "bg-amber-50/40 border-slate-200 hover:bg-amber-50/70"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="status-pill status-busy">WARNING</span>
                    <span className="text-[11px] font-mono text-slate-500">14:12:05</span>
                  </div>
                  <div className={`text-xs sm:text-sm font-medium mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                    Repeated tailgate attempts detected at Gate C Exit
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => showToast("Opening Gate C Exit CCTV feed...")}
                      className="text-[11px] font-mono font-bold uppercase bg-amber-500/15 hover:bg-amber-500 text-amber-500 hover:text-slate-950 border border-amber-500/30 px-3 py-1 rounded transition"
                    >
                      INVESTIGATE
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* Recommended Actions */}
            <section
              className={`border rounded-2xl p-4 sm:p-5 shadow-sm ${
                isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                  <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  Recommended Actions
                </div>
              </div>

              <div className="space-y-3">
                <div
                  className={`border border-l-4 border-l-red-500 rounded-xl p-3.5 transition ${
                    isDark
                      ? "bg-[#1e293b]/50 border-white/5 hover:bg-[#18243c]"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="mb-1.5">
                    <span className="status-pill status-full text-[10px]">CRITICAL PRIORITY</span>
                  </div>
                  <div className={`text-xs sm:text-sm mb-3 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    Floor 4 filling rapidly. ETA to full: <strong className={isDark ? "text-white" : "text-slate-950"}>18m</strong>.
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => showToast("Executing dynamic diversion F4 -> F1...")}
                      className="text-[11px] font-mono font-bold uppercase bg-cyan-500/20 hover:bg-cyan-500 text-cyan-600 dark:text-cyan-400 hover:text-white border border-cyan-500/40 px-3 py-1 rounded transition"
                    >
                      Execute Diversion F4&rarr;F1
                    </button>
                  </div>
                </div>

                <div
                  className={`border border-l-4 border-l-amber-500 rounded-xl p-3.5 transition ${
                    isDark
                      ? "bg-[#1e293b]/50 border-white/5 hover:bg-[#18243c]"
                      : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                  }`}
                >
                  <div className="mb-1.5">
                    <span className="status-pill status-busy text-[10px]">WARNING</span>
                  </div>
                  <div className={`text-xs sm:text-sm mb-3 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    Investigate Entrance A flow anomaly.
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => showToast("Launching Entrance A live camera stream...")}
                      className="text-[11px] font-mono font-bold uppercase bg-cyan-500/20 hover:bg-cyan-500 text-cyan-600 dark:text-cyan-400 hover:text-white border border-cyan-500/40 px-3 py-1 rounded transition"
                    >
                      View Cameras
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Secondary Row: 3 Columns Grid (Traffic, Predictions, Intelligence Log) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {/* Column 1: Traffic Intelligence */}
          <section
            className={`border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between ${
              isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div>
              <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                  <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                  Traffic Intelligence
                </div>
                <button
                  onClick={() => showToast("Loading Traffic Velocity Report...")}
                  className="text-[10px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 hover:underline bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded transition"
                >
                  DETAILS
                </button>
              </div>

              {/* Chart Visual Image */}
              <div className={`border rounded-xl p-3 mb-4 flex items-center justify-center min-h-[90px] ${isDark ? "bg-[#1e293b]/60 border-white/5" : "bg-slate-50 border-slate-200"}`}>
                <img
                  src="/images/v3351_912.png"
                  alt="Traffic Flow Chart"
                  className={`w-full max-h-[85px] object-contain ${isDark ? "invert brightness-200" : ""}`}
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className={`text-[11px] uppercase tracking-wider text-left border-b ${isDark ? "text-slate-400 border-white/10" : "text-slate-600 border-slate-200"}`}>
                      <th className="pb-2">Gate</th>
                      <th className="pb-2">In/H</th>
                      <th className="pb-2">Out/H</th>
                      <th className="pb-2">Net Vel</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? "divide-white/5" : "divide-slate-100"}`}>
                    <tr>
                      <td className={`py-2 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Ent A</td>
                      <td className="py-2">450</td>
                      <td className="py-2">200</td>
                      <td className="py-2 text-emerald-600 dark:text-emerald-400 font-semibold">+4.1 KM/H</td>
                    </tr>
                    <tr>
                      <td className={`py-2 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Ent B</td>
                      <td className="py-2">310</td>
                      <td className="py-2">320</td>
                      <td className="py-2 text-emerald-600 dark:text-emerald-400 font-semibold">+4.1 KM/H</td>
                    </tr>
                    <tr>
                      <td className={`py-2 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Ent C</td>
                      <td className="py-2">120</td>
                      <td className="py-2">380</td>
                      <td className="py-2 text-emerald-600 dark:text-emerald-400 font-semibold">+4.1 KM/H</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Column 2: Prediction Engine */}
          <section
            className={`border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between ${
              isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div>
              <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                  <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                  </svg>
                  Prediction Engine
                </div>
                <button
                  onClick={() => showToast("Opening ML gRPC Inference Models...")}
                  className="text-[10px] font-mono font-semibold text-cyan-600 dark:text-cyan-400 hover:underline bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded transition"
                >
                  FULL FORECAST
                </button>
              </div>

              {/* Risk Badge */}
              <div className="mb-3 p-3 bg-red-500/10 border border-red-500/25 rounded-xl">
                <div className="text-[10px] font-mono font-bold text-red-500 uppercase tracking-wider mb-0.5">
                  RISK RANKING #1
                </div>
                <div className={`text-xs sm:text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  Floor 4 Capacity Breach
                </div>
                <div className="text-[11px] font-mono text-slate-500">Confidence: HIGH (89%)</div>
              </div>

              {/* Capacity Pressure Chart */}
              <div className="mb-3">
                <div className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Capacity Pressure Index
                </div>
                <div className={`border rounded-xl p-2.5 flex items-center justify-center min-h-[55px] ${isDark ? "bg-[#1e293b]/60 border-white/5" : "bg-slate-50 border-slate-200"}`}>
                  <img
                    src="/images/v3351_1067.png"
                    alt="Capacity Pressure Index"
                    className={`w-full max-h-[50px] object-contain ${isDark ? "invert brightness-200" : ""}`}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className={`text-[11px] uppercase tracking-wider text-left border-b ${isDark ? "text-slate-400 border-white/10" : "text-slate-600 border-slate-200"}`}>
                      <th className="pb-1.5">Time</th>
                      <th className="pb-1.5">F4 Pred</th>
                      <th className="pb-1.5">Global</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? "divide-white/5" : "divide-slate-100"}`}>
                    <tr>
                      <td className="py-1.5 text-slate-500">Now</td>
                      <td className="py-1.5 text-red-500 font-bold">91%</td>
                      <td className="py-1.5 font-semibold">78%</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-slate-500">+15m</td>
                      <td className="py-1.5 text-red-500 font-bold">98%</td>
                      <td className="py-1.5 font-semibold">82%</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-slate-500">+30m</td>
                      <td className="py-1.5 text-red-500 font-bold">100%</td>
                      <td className="py-1.5 font-semibold">88%</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-slate-500">+60m</td>
                      <td className="py-1.5 text-red-500 font-bold">100%</td>
                      <td className="py-1.5 font-semibold">95%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* Column 3: Intelligence Log & Feed */}
          <section
            className={`border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between ${
              isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div>
              <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
                <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                  <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polyline points="4 17 10 11 4 5" />
                    <line x1="12" y1="19" x2="20" y2="19" />
                  </svg>
                  Intelligence Log &amp; Feed
                </div>
              </div>

              {/* Log Stream */}
              <div className="space-y-2 font-mono text-xs mb-3">
                <div className={`p-2 rounded border flex items-baseline gap-2 ${isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200"}`}>
                  <span className="text-[11px] text-slate-500">14:30:12</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-500/20 text-red-500 uppercase">
                    ALERT
                  </span>
                  <span className={`text-[11px] flex-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Emergency Call Box triggered (F5). Sec dispatched.
                  </span>
                </div>

                <div className={`p-2 rounded border flex items-baseline gap-2 ${isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200"}`}>
                  <span className="text-[11px] text-slate-500">14:28:45</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 uppercase">
                    SYSTEM
                  </span>
                  <span className={`text-[11px] flex-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Auto-diversion activated Ent A &rarr; Ent B.
                  </span>
                </div>

                <div className={`p-2 rounded border flex items-baseline gap-2 ${isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-200"}`}>
                  <span className="text-[11px] text-slate-500">14:15:00</span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-600 dark:text-slate-400 uppercase">
                    INFO
                  </span>
                  <span className={`text-[11px] flex-1 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Routine sensor recalibration (Zone 2).
                  </span>
                </div>
              </div>

              {/* Predictive Feed */}
              <div>
                <div className={`text-[11px] font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Predictive Feed
                </div>
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 border-l-2 border-l-amber-500">
                    <div className="flex justify-between items-center mb-1">
                      <span className="status-pill status-busy text-[9px] py-0 px-1.5">THRESHOLD ALERT</span>
                      <span className="text-[10px] font-mono text-slate-500">-2m</span>
                    </div>
                    <div className={`text-xs ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                      F1 hit 98% occupancy. Growth rate slowing.
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 border-l-2 border-l-red-500">
                    <div className="flex justify-between items-center mb-1">
                      <span className="status-pill status-full text-[9px] py-0 px-1.5">VELOCITY ALERT</span>
                      <span className="text-[10px] font-mono text-slate-500">-12m</span>
                    </div>
                    <div className={`text-xs ${isDark ? "text-slate-300" : "text-slate-800"}`}>
                      Ent A inbound velocity exceeds baseline +2&sigma;.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Third Row: 3 Columns Grid (Capacity Distribution, Anomaly Detection, Infra Health) */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 pb-6">
          {/* Capacity Distribution */}
          <section
            className={`border rounded-2xl p-4 sm:p-5 shadow-sm ${
              isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                <svg className="w-4 h-4 text-cyan-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                  <path d="M22 12A10 10 0 0 0 12 2v10z" />
                </svg>
                Capacity Distribution
              </div>
            </div>

            <table className="w-full text-xs font-mono">
              <thead>
                <tr className={`text-[11px] uppercase tracking-wider text-left border-b ${isDark ? "text-slate-400 border-white/10" : "text-slate-600 border-slate-200"}`}>
                  <th className="pb-2">Rankings</th>
                  <th className="pb-2">Value</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-white/5" : "divide-slate-100"}`}>
                <tr>
                  <td className={`py-2 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>#1 Least Avail</td>
                  <td className="py-2 text-red-500 font-bold">F1 (12 spots)</td>
                </tr>
                <tr>
                  <td className={`py-2 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>#1 Most Avail</td>
                  <td className="py-2 text-emerald-600 dark:text-emerald-400 font-bold">F5 (180 spots)</td>
                </tr>
                <tr>
                  <td className={`py-2 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Fastest Growth</td>
                  <td className="py-2 text-cyan-600 dark:text-cyan-400 font-bold">F4 (+0.45 KM/H)</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Anomaly Detection */}
          <section
            className={`border rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col justify-between ${
              isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                <svg className="w-4 h-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Anomaly Detection
              </div>
            </div>

            <div
              className={`p-3.5 rounded-xl border border-l-4 border-l-amber-500 flex-1 flex flex-col justify-center ${
                isDark
                  ? "bg-amber-500/10 border-amber-500/30"
                  : "bg-amber-50/60 border-amber-200"
              }`}
            >
              <div className="text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">
                Unusual Dwell Time &mdash; Level 3
              </div>
              <div className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Average stay duration is <strong className={isDark ? "text-white" : "text-slate-950"}>45m above historical Thursday baseline</strong>. May impact turnover rate.
              </div>
            </div>
          </section>

          {/* Infra Health */}
          <section
            className={`border rounded-2xl p-4 sm:p-5 shadow-sm ${
              isDark ? "bg-[#131c2e] border-white/10" : "bg-white border-slate-200"
            }`}
          >
            <div className={`flex items-center justify-between pb-3 border-b mb-3 ${isDark ? "border-white/10" : "border-slate-200"}`}>
              <div className={`flex items-center gap-2 text-sm font-bold uppercase tracking-wider ${isDark ? "text-white" : "text-slate-900"}`}>
                <svg className="w-4 h-4 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
                Infra Health
              </div>
              <button
                onClick={() => showToast("All 42 IoT Gateways operating normally.")}
                className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 hover:underline bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded transition"
              >
                SYSTEMS
              </button>
            </div>

            <div className="space-y-1.5 text-xs font-mono">
              <div className={`flex justify-between items-center py-1 border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
                <span className="text-slate-500">Data Freshness:</span>
                <span className="status-pill status-normal text-[10px]">0.8s lag</span>
              </div>
              <div className={`flex justify-between items-center py-1 border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
                <span className="text-slate-500">PGS Nodes Active:</span>
                <span className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>2038 / 2050</span>
              </div>
              <div className={`flex justify-between items-center py-1 border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
                <span className="text-slate-500">TDS Gateways:</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">42 / 42 (100%)</span>
              </div>
              <div className={`flex justify-between items-center py-1 border-b ${isDark ? "border-white/5" : "border-slate-100"}`}>
                <span className="text-slate-500">ETL Pipeline:</span>
                <span className="status-pill status-normal text-[10px]">HEALTHY</span>
              </div>

              {/* Uptime Trend Bars */}
              <div className="pt-2">
                <div className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">24H UPTIME TREND</div>
                <div className="uptime-bars">
                  <div className="uptime-bar" style={{ height: "95%" }} title="Hour -12: 99.5%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -11: 100%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -10: 100%" />
                  <div className="uptime-bar" style={{ height: "98%" }} title="Hour -9: 99.8%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -8: 100%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -7: 100%" />
                  <div className="uptime-bar" style={{ height: "92%" }} title="Hour -6: 98.2%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -5: 100%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -4: 100%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -3: 100%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -2: 100%" />
                  <div className="uptime-bar" style={{ height: "100%" }} title="Hour -1: 100%" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
