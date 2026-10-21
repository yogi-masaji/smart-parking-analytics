"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SimulationEvent {
  type?: string;
  timestamp: string;
  floor_code: string;
  floor_name: string;
  capacity: number;
  used: number;
  available: number;
  occupancy_ratio: number;
  predicted_ratio: number;
  predicted_class: string;
  early_warning: boolean;
  alert_message: string;
  mode?: string;
  speed?: number;
}

interface SimulationConfig {
  mode: string; // "realtime", "15m", "30m", "60m"
  speed: number; // 1.0, 2.0, 5.0, 10.0, 60.0
  status: string; // "play", "pause", "restart"
}

export default function SimulationDashboard() {
  const router = useRouter();
  const [currentTimestamp, setCurrentTimestamp] = useState<string>("-");
  const [floorsData, setFloorsData] = useState<Record<string, SimulationEvent>>({});
  const [activeAlerts, setActiveAlerts] = useState<SimulationEvent[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [eventCount, setEventCount] = useState<number>(0);

  // Simulation speed & mode controls
  const [simConfig, setSimConfig] = useState<SimulationConfig>({
    mode: "15m",
    speed: 1.0,
    status: "play",
  });
  const [wsRef, setWsRef] = useState<WebSocket | null>(null);

  // Fetch initial config
  useEffect(() => {
    fetch("http://localhost:8080/api/v1/simulation/config")
      .then((res) => res.json())
      .then((data) => {
        if (data && data.mode) {
          setSimConfig(data);
        }
      })
      .catch(() => {});
  }, []);

  // WebSocket Connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let isMounted = true;

    const connectWS = () => {
      try {
        ws = new WebSocket("ws://localhost:8080/ws/simulation");

        ws.onopen = () => {
          if (isMounted) {
            setIsConnected(true);
            setWsRef(ws);
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            setIsConnected(false);
            setWsRef(null);
            reconnectTimer = setTimeout(connectWS, 2000);
          }
        };

        ws.onerror = () => {
          if (ws) ws.close();
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "control" && data.config) {
              if (isMounted) setSimConfig(data.config);
              return;
            }

            const payload: SimulationEvent = data;
            if (!payload || !payload.floor_code) return;

            if (isMounted) {
              setEventCount((c) => c + 1);
              setCurrentTimestamp(payload.timestamp);

              if (payload.mode && payload.speed) {
                setSimConfig((prev) => ({
                  ...prev,
                  mode: payload.mode || prev.mode,
                  speed: payload.speed || prev.speed,
                }));
              }

              setFloorsData((prev) => ({
                ...prev,
                [payload.floor_code]: payload,
              }));

              if (payload.early_warning) {
                setActiveAlerts((prev) => {
                  const filtered = prev.filter((a) => a.floor_code !== payload.floor_code);
                  return [payload, ...filtered].slice(0, 6);
                });
              } else {
                setActiveAlerts((prev) => prev.filter((a) => a.floor_code !== payload.floor_code));
              }
            }
          } catch (err) {
            console.error("Format payload tidak sesuai:", err);
          }
        };
      } catch (err) {
        if (isMounted) {
          setIsConnected(false);
          reconnectTimer = setTimeout(connectWS, 2000);
        }
      }
    };

    connectWS();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const sendControl = (updated: Partial<SimulationConfig>) => {
    const nextCfg: SimulationConfig = { ...simConfig, ...updated };
    setSimConfig(nextCfg);

    // Send HTTP POST
    fetch("http://localhost:8080/api/v1/simulation/control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextCfg),
    }).catch(() => {});

    // Send via WebSocket if open
    if (wsRef && wsRef.readyState === WebSocket.OPEN) {
      wsRef.send(JSON.stringify(nextCfg));
    }
  };

  const modeOptions = [
    { id: "realtime", label: "⚡ Real-Time", desc: "Interval 5m Kontinu" },
    { id: "15m", label: "⏱️ Per 15 Menit", desc: "Step Jeda 15m" },
    { id: "30m", label: "⏱️ Per 30 Menit", desc: "Step Jeda 30m" },
    { id: "60m", label: "⏱️ Per 60 Menit", desc: "Hourly Step 1 Jam" },
  ];

  const speedOptions = [
    { val: 1.0, label: "1x" },
    { val: 2.0, label: "2x" },
    { val: 5.0, label: "5x" },
    { val: 10.0, label: "10x" },
    { val: 60.0, label: "60x" },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 px-6 flex items-center justify-between backdrop-blur sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-lg font-bold tracking-tight text-white hover:text-blue-400 transition"
          >
            <span>🅿️</span>
            <span>SmartParking</span>
          </Link>
          <span className="text-[11px] px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-bold tracking-wider">
            HISTORIC REPLAY STREAM
          </span>
          <Link
            href="/dashboard"
            className="text-xs text-slate-400 hover:text-slate-200 ml-2 border border-slate-700/60 rounded px-2.5 py-1 transition hover:bg-slate-800"
          >
            ← Kembali ke Dashboard
          </Link>
        </div>

        {/* Dynamic Simulated Time Indicator */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Waktu Simulasi (IoT)</span>
            <span className="font-mono text-sm font-bold text-amber-400">{currentTimestamp}</span>
          </div>

          <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              }`}
            ></span>
            <span className="text-xs font-mono font-medium text-slate-300">
              {isConnected ? "Replay Online" : "Disconnected"}
            </span>
            {eventCount > 0 && (
              <span className="text-[10px] bg-slate-700 px-1.5 py-0.2 rounded text-slate-300 font-mono">
                {eventCount} evt
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Simulation Replay Controls Panel */}
        <section className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="text-xl">🎛️</span>
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Kontrol Simulasi & Percepatan Replay
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Pilih interval langkah data historis dan kecepatan pemutaran stream secara real-time.
              </p>
            </div>

            {/* Play / Pause / Restart */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => sendControl({ status: simConfig.status === "play" ? "pause" : "play" })}
                className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition flex items-center gap-2 border ${
                  simConfig.status === "play"
                    ? "bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30"
                    : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                }`}
              >
                <span>{simConfig.status === "play" ? "⏸️" : "▶️"}</span>
                <span>{simConfig.status === "play" ? "Pause Replay" : "Resume Replay"}</span>
              </button>

              <button
                onClick={() => sendControl({ status: "restart" })}
                className="px-3.5 py-2 rounded-xl text-xs font-bold font-mono transition bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5"
              >
                <span>🔄</span>
                <span>Mulai Ulang</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
            {/* Opsi 1: Mode Step Interval */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
                1. Mode Interval Waktu (Time Step)
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {modeOptions.map((opt) => {
                  const isActive = simConfig.mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => sendControl({ mode: opt.id })}
                      className={`p-2.5 rounded-xl border text-left transition-all duration-200 ${
                        isActive
                          ? "bg-indigo-600/20 border-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.25)]"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                      }`}
                    >
                      <span className="block text-xs font-bold truncate">{opt.label}</span>
                      <span className="block text-[10px] text-slate-500 mt-0.5 truncate">{opt.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Opsi 2: Kecepatan Replay (Speed Multiplier) */}
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block font-mono">
                2. Faktor Percepatan (Playback Speed)
              </span>
              <div className="flex items-center gap-2">
                {speedOptions.map((spd) => {
                  const isActive = simConfig.speed === spd.val;
                  return (
                    <button
                      key={spd.val}
                      onClick={() => sendControl({ speed: spd.val })}
                      className={`flex-1 py-2.5 rounded-xl border text-center font-mono font-bold text-xs transition-all duration-200 ${
                        isActive
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_12px_rgba(6,182,212,0.25)]"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/50"
                      }`}
                    >
                      {spd.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active status indicator pill */}
          <div className="pt-2 flex items-center justify-between text-xs font-mono text-slate-400 border-t border-slate-800/60">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-indigo-400 animate-ping"></span>
              <span>
                Status Replay:{" "}
                <strong className="text-indigo-400 uppercase">
                  {simConfig.mode} @ {simConfig.speed}x ({simConfig.status.toUpperCase()})
                </strong>
              </span>
            </div>
            <span className="text-[11px] text-slate-500">
              Latensi estimasi: ~{Math.round(1000 / simConfig.speed)}ms per tick
            </span>
          </div>
        </section>

        {/* Early Warning Alert Banner */}
        {activeAlerts.length > 0 && (
          <section className="space-y-2 animate-fadeIn">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-red-400 flex items-center gap-2">
                <span>🚨</span>
                <span>Sinyal Peringatan Dini (Prediksi 15 Menit ke Depan)</span>
              </h2>
              <span className="text-[10px] text-red-400/80 font-mono font-semibold">
                {activeAlerts.length} Peringatan Aktif
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeAlerts.map((alert) => (
                <div
                  key={alert.floor_code}
                  className="rounded-xl border border-red-500/50 bg-red-950/40 p-4 flex items-start justify-between shadow-xl backdrop-blur"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{alert.floor_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-mono font-bold">
                        {alert.predicted_class}
                      </span>
                    </div>
                    <p className="text-xs text-red-200">{alert.alert_message}</p>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Saat ini: {alert.used} / {alert.capacity} ({Math.round(alert.occupancy_ratio * 100)}%)
                    </div>
                  </div>
                  <div className="text-right pl-3 border-l border-red-500/20">
                    <span className="text-[10px] text-slate-400 block uppercase">Prediksi</span>
                    <span className="text-lg font-mono font-bold text-red-400">
                      {Math.round(alert.predicted_ratio * 100)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Grid Status Lantai */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
                Status Real-Time & Prediksi per Lantai
              </h2>
              <p className="text-xs text-slate-500">
                Data okupansi diinterpolasi dan diinferensi langsung melalui machine learning LightGBM.
              </p>
            </div>
            <span className="text-xs text-slate-400 bg-slate-900 border border-slate-800 px-3 py-1 rounded-md font-mono">
              Terdeteksi: {Object.keys(floorsData).length} Lantai
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(floorsData).map((floor) => {
              const currentPercent = Math.round(floor.occupancy_ratio * 100);
              const predictedPercent = Math.round(floor.predicted_ratio * 100);

              let statusColor = "border-slate-800 bg-slate-900/90";
              let progressColor = "bg-emerald-500";
              let badgeColor = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";

              if (currentPercent >= 90 || floor.predicted_class === "PENUH") {
                statusColor = "border-red-500/60 bg-red-950/25";
                progressColor = "bg-red-500";
                badgeColor = "bg-red-500/20 text-red-400 border-red-500/30";
              } else if (currentPercent >= 70 || floor.predicted_class === "PADAT") {
                statusColor = "border-amber-500/60 bg-amber-950/25";
                progressColor = "bg-amber-500";
                badgeColor = "bg-amber-500/20 text-amber-400 border-amber-500/30";
              }

              return (
                <div
                  key={floor.floor_code}
                  className={`rounded-xl border p-5 shadow-lg transition-all duration-300 ${statusColor}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-bold text-white text-base">{floor.floor_name}</h3>
                      <span className="text-[11px] text-slate-400 font-mono">CODE: {floor.floor_code}</span>
                    </div>
                    <span className={`text-[10px] px-2.5 py-1 rounded font-bold font-mono border ${badgeColor}`}>
                      {floor.predicted_class}
                    </span>
                  </div>

                  {/* Progress Bar Okupansi Saat Ini */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400">
                        Terisi: <strong className="text-white">{floor.used}</strong> / {floor.capacity} (Sisa:{" "}
                        <strong className="text-slate-300">{floor.available}</strong>)
                      </span>
                      <span className="font-bold text-white">{currentPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${Math.min(100, Math.max(0, currentPercent))}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Indikator Prediksi 15 Menit ke Depan */}
                  <div className="mt-5 pt-3.5 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <span>🔮</span>
                      <span>Prediksi (15m):</span>
                    </span>
                    <span className="font-mono font-bold text-indigo-300 text-sm">
                      {predictedPercent}% Okupansi
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(floorsData).length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-16 text-center text-slate-500">
              <div className="text-4xl mb-3">📡</div>
              <p className="text-base text-slate-300 font-medium">
                Menunggu event stream dari pipeline simulasi...
              </p>
              <span className="text-xs text-slate-500 mt-2 block font-mono">
                Jalankan: <code>python training/simulate_producer.py --mode 15m --speed 2</code> atau{" "}
                <code>cd services/stream-worker && .\simulation_worker.exe -mode 15m -speed 2</code>
              </span>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
