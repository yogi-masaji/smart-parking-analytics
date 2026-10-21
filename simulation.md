Berikut adalah panduan lengkap dokumentasi SIMULATION.md beserta implementasi halaman baru /simulation di Next.js yang terhubung langsung ke pipeline Kafka, Go Worker, dan LightGBM Inference Engine. 🚀 SIMULATION.mdDokumentasi rancangan dan eksekusi pemutaran ulang (historic replay) data time-series pgs_occupancy_log.csv menggunakan Apache Kafka sebagai event ingestion pipeline, Go Stream Worker untuk kalkulasi lag & state, serta Python gRPC Server untuk inferensi LightGBM. 1. Arsitektur Alur SimulasiPlaintext[pgs_occupancy_log.csv]
│
▼ (Replayer Script: streaming per batch waktu dengan speed multiplier)
[Kafka Producer] ──► Topic: "parking.occupancy.stream"
│
▼
[Go Stream Worker]
├─ Update History Okupansi per Lantai (Redis Sorted Set)
├─ Hitung Lag 15/30/60m, Delta & Velocity
├─ Request Prediksi ke Python via gRPC
│
▼ (Emit JSON Status & Early Warning Alert)
[Redis Pub/Sub: "channel:simulation"]
│
▼
[Go Backend WebSocket: "/ws/simulation"]
│
▼
[Next.js: "/simulation" Dashboard] 2. Skrip Kafka Replay Producer (training/simulate_producer.py)Skrip ini membaca file CSV, mengelompokkannya per createdAt, lalu mem-push seluruh lantai pada menit tersebut ke topik Kafka parking.occupancy.stream dengan jeda waktu yang bisa diatur (speed multiplier):Pythonimport pandas as pd
import json
import time
from kafka import KafkaProducer

CSV_PATH = "training/data/pgs_occupancy_log.csv"
KAFKA_BROKER = "localhost:9092"
TOPIC_NAME = "parking.occupancy.stream"

def run_simulation(delay_seconds=1.0):
print("⏳ Membaca data historis...")
df = pd.read_csv(CSV_PATH)
df['createdAt'] = pd.to_datetime(df['createdAt'])
df = df.sort_values(by=['createdAt', 'floor_code'])

    producer = KafkaProducer(
        bootstrap_servers=[KAFKA_BROKER],
        value_serializer=lambda v: json.dumps(v).encode('utf-8')
    )

    print(f"🚀 Memulai simulasi ke Kafka topic [{TOPIC_NAME}]...")
    grouped = df.groupby('createdAt')

    for timestamp, batch in grouped:
        print(f"📡 Emitting snapshot: {timestamp} ({len(batch)} lantai)")

        for _, row in batch.iterrows():
            payload = {
                "id_log": int(row['id_log']),
                "location_code": str(row['location_code']),
                "floor_code": str(row['floor_code']),
                "floor_name": str(row['floor_name']),
                "capacity": int(row['capacity']),
                "used": int(row['used']),
                "available": int(row['available']),
                "created_at": str(row['createdAt'])
            }
            producer.send(TOPIC_NAME, value=payload)

        producer.flush()
        # Jeda waktu antar snapshot (1 detik simulasi = pergeseran waktu 5-15 menit di dunia nyata)
        time.sleep(delay_seconds)

if **name** == "**main**":
run_simulation(delay_seconds=1.5) 3. Go Stream Worker Penangan Simulasi (services/stream-worker/cmd/simulation_worker.go)Worker ini mengonsumsi topik Kafka parking.occupancy.stream, menghitung fitur lag (15/30/60 menit) dan laju velocity di Redis, memanggil gRPC Python ML Inference, lalu mem-publish hasil akhirnya ke Redis channel channel:simulation: Gopackage main

import (
"context"
"encoding/json"
"fmt"
"log"
"math"
"strconv"
"time"

    "github.com/redis/go-redis/v9"
    "github.com/segmentio/kafka-go"
    "google.golang.org/grpc"
    "google.golang.org/grpc/credentials/insecure"

    pb "stream-worker/internal/rpc"

)

type OccupancySnapshot struct {
IDLog int64 `json:"id_log"`
LocationCode string `json:"location_code"`
FloorCode string `json:"floor_code"`
FloorName string `json:"floor_name"`
Capacity int32 `json:"capacity"`
Used int32 `json:"used"`
Available int32 `json:"available"`
CreatedAt string `json:"created_at"`
}

type SimulationBroadcast struct {
Timestamp string `json:"timestamp"`
FloorCode string `json:"floor_code"`
FloorName string `json:"floor_name"`
Capacity int32 `json:"capacity"`
Used int32 `json:"used"`
Available int32 `json:"available"`
OccupancyRatio float32 `json:"occupancy_ratio"`
PredictedRatio float32 `json:"predicted_ratio"`
PredictedClass string `json:"predicted_class"` // AVAILABLE, PADAT, PENUH
EarlyWarning bool `json:"early_warning"`
AlertMessage string `json:"alert_message"`
}

func main() {
ctx := context.Background()
rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})

    // Koneksi gRPC ke Service Python ML Inference
    conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
    if err != nil {
    	log.Fatalf("Gagal terhubung ke gRPC Python: %v", err)
    }
    defer conn.Close()
    mlClient := pb.NewCongestionPredictorClient(conn)

    // Kafka Consumer untuk simulasi stream
    reader := kafka.NewReader(kafka.ReaderConfig{
    	Brokers: []string{"localhost:9092"},
    	Topic:   "parking.occupancy.stream",
    	GroupID: "simulation-worker-group",
    })
    defer reader.Close()

    log.Println("⚡ Simulation Worker siap mengolah data stream Kafka...")

    for {
    	m, err := reader.ReadMessage(ctx)
    	if err != nil {
    		log.Printf("Kafka read error: %v", err)
    		continue
    	}

    	var logData OccupancySnapshot
    	if err := json.Unmarshal(m.Value, &logData); err != nil {
    		continue
    	}

    	parsedTime, _ := time.Parse("2006-01-02 15:04:05", logData.CreatedAt)
    	ratio := float32(logData.Used) / float32(math.Max(1, float64(logData.Capacity)))

    	// 1. Simpan history 'used' ke Redis Sorted Set berdasarkan score unix time
    	floorKey := fmt.Sprintf("sim:history:%s", logData.FloorCode)
    	rdb.ZAdd(ctx, floorKey, redis.Z{
    		Score:  float64(parsedTime.Unix()),
    		Member: fmt.Sprintf("%d", logData.Used),
    	})

    	// 2. Ambil nilai lag 15m, 30m, 60m dari Redis
    	getLagUsed := func(minutesAgo int64) float32 {
    		targetScore := float64(parsedTime.Add(-time.Duration(minutesAgo) * time.Minute).Unix())
    		vals, _ := rdb.ZRevRangeByScore(ctx, floorKey, &redis.ZRangeBy{
    			Min:   "-inf",
    			Max:   fmt.Sprintf("%f", targetScore),
    			Count: 1,
    		}).Result()

    		if len(vals) > 0 {
    			usedVal, _ := strconv.Atoi(vals[0])
    			return float32(usedVal) / float32(math.Max(1, float64(logData.Capacity)))
    		}
    		return ratio
    	}

    	lag15Ratio := getLagUsed(15)
    	lag30Ratio := getLagUsed(30)
    	lag60Ratio := getLagUsed(60)

    	deltaUsed15m := float32(logData.Used) - (lag15Ratio * float32(logData.Capacity))
    	velocity15m := deltaUsed15m / 15.0

    	// 3. Panggil Model LightGBM via gRPC
    	res, err := mlClient.PredictCongestion(ctx, &pb.PredictionRequest{
    		SiteId:           1,
    		CurrentOccupancy: logData.Used,
    		InRate_15M:       int32(deltaUsed15m),
    		OutRate_15M:      0,
    		HourOfDay:        int32(parsedTime.Hour()),
    		DayOfWeek:        int32(parsedTime.Weekday()),
    		IsWeekend:        parsedTime.Weekday() == 0 || parsedTime.Weekday() == 6,
    		TotalCapacity:    logData.Capacity,
    	})

    	predictedRatio := ratio
    	predictedClass := "AVAILABLE"
    	earlyWarning := false
    	alertMsg := "Kondisi lantai parkir lancar."

    	if err == nil {
    		predictedRatio = res.PredictedOccupancyRatio
    		predictedClass = res.CongestionLevel
    		earlyWarning = res.ShouldAlert
    		alertMsg = res.AlertMessage
    	}

    	// 4. Broadcast ke Redis Pub/Sub untuk WebSocket Frontend
    	broadcastData := SimulationBroadcast{
    		Timestamp:      logData.CreatedAt,
    		FloorCode:      logData.FloorCode,
    		FloorName:      logData.FloorName,
    		Capacity:       logData.Capacity,
    		Used:           logData.Used,
    		Available:      logData.Available,
    		OccupancyRatio: ratio,
    		PredictedRatio: predictedRatio,
    		PredictedClass: predictedClass,
    		EarlyWarning:   earlyWarning,
    		AlertMessage:   alertMsg,
    	}

    	payloadJSON, _ := json.Marshal(broadcastData)
    	rdb.Publish(ctx, "channel:simulation", payloadJSON)
    }

} 4. Tambahan Endpoint WebSocket Backend (services/backend-api/cmd/main.go)Tambahkan route WebSocket khusus /ws/simulation di backend Go Gin: Go// Di dalam services/backend-api/cmd/main.go tambahkan:
r.GET("/ws/simulation", func(c \*gin.Context) {
ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
if err != nil {
return
}
defer ws.Close()

    pubsub := rdb.Subscribe(context.Background(), "channel:simulation")
    defer pubsub.Close()

    ch := pubsub.Channel()
    for msg := range ch {
    	ws.WriteMessage(websocket.TextMessage, []byte(msg.Payload))
    }

}) 5. Implementasi Halaman Dashboard Simulasi (services/frontend/app/simulation/page.tsx)Buat file baru di services/frontend/app/simulation/page.tsx. Halaman ini menampilkan jam digital historis yang berjalan, kartu status lantai yang berubah secara interaktif, grafik okupansi vs prediksi, serta banner peringatan dini (Early Warning Alert) saat lantai terdeteksi akan penuh[cite: 4]: TypeScript"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface SimulationEvent {
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
}

export default function SimulationDashboard() {
const router = useRouter();
const [currentTimestamp, setCurrentTimestamp] = useState<string>("-");
const [floorsData, setFloorsData] = useState<Record<string, SimulationEvent>>({});
const [activeAlerts, setActiveAlerts] = useState<SimulationEvent[]>([]);
const [isConnected, setIsConnected] = useState<boolean>(false);

useEffect(() => {
const token = localStorage.getItem("token");
if (!token) {
router.push("/login");
return;
}

    const ws = new WebSocket("ws://localhost:8080/ws/simulation");

    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);

    ws.onmessage = (event) => {
      try {
        const payload: SimulationEvent = JSON.parse(event.data);
        setCurrentTimestamp(payload.timestamp);

        setFloorsData((prev) => ({
          ...prev,
          [payload.floor_code]: payload,
        }));

        if (payload.early_warning) {
          setActiveAlerts((prev) => {
            const exists = prev.some((a) => a.floor_code === payload.floor_code);
            if (!exists) return [payload, ...prev].slice(0, 5);
            return prev.map((a) => (a.floor_code === payload.floor_code ? payload : a));
          });
        }
      } catch (err) {
        console.error("Format payload tidak sesuai:", err);
      }
    };

    return () => ws.close();

}, [router]);

return (
<div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col">
{/_ Top Bar _/}
<header className="h-16 border-b border-slate-800 bg-slate-900/60 px-6 flex items-center justify-between backdrop-blur">
<div className="flex items-center gap-3">
<Link href="/dashboard" className="text-xl font-bold tracking-tight text-white hover:text-blue-400 transition">
🅿️ SmartParking
</Link>
<span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono font-bold tracking-wider">
HISTORIC REPLAY STREAM
</span>
</div>

        {/* Dynamic Simulated Time Indicator */}
        <div className="flex items-center gap-6">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wider text-slate-400">Waktu Simulasi (IoT)</span>
            <span className="font-mono text-sm font-bold text-amber-400">{currentTimestamp}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}></span>
            <span className="text-xs text-slate-400">{isConnected ? "Kafka Online" : "Disconnected"}</span>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Early Warning Alert Banner */}
        {activeAlerts.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-400">
              🚨 Sinyal Peringatan Dini (Prediksi Penuh 15 Menit)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {activeAlerts.map((alert, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-red-500/40 bg-red-950/30 p-3.5 flex items-start justify-between shadow-lg"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-sm">{alert.floor_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white font-mono font-bold">
                        {alert.predicted_class}
                      </span>
                    </div>
                    <p className="text-xs text-red-200 mt-1">{alert.alert_message}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block">Prediksi Rasio</span>
                    <span className="text-sm font-mono font-bold text-red-400">
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
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Status Real-Time & Prediksi per Lantai
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              Terdeteksi: {Object.keys(floorsData).length} Lantai
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(floorsData).map((floor) => {
              const currentPercent = Math.round(floor.occupancy_ratio * 100);
              const predictedPercent = Math.round(floor.predicted_ratio * 100);

              let statusColor = "border-slate-800 bg-slate-900";
              let progressColor = "bg-emerald-500";
              if (currentPercent >= 90 || floor.predicted_class === "PENUH") {
                statusColor = "border-red-500/50 bg-red-950/20";
                progressColor = "bg-red-500";
              } else if (currentPercent >= 70 || floor.predicted_class === "PADAT") {
                statusColor = "border-amber-500/50 bg-amber-950/20";
                progressColor = "bg-amber-500";
              }

              return (
                <div
                  key={floor.floor_code}
                  className={`rounded-xl border p-4 shadow transition ${statusColor}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-white text-sm">{floor.floor_name}</h3>
                      <span className="text-[10px] text-slate-400 font-mono">CODE: {floor.floor_code}</span>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold font-mono ${
                        floor.predicted_class === "PENUH"
                          ? "bg-red-500/20 text-red-400 border border-red-500/30"
                          : floor.predicted_class === "PADAT"
                          ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      }`}
                    >
                      {floor.predicted_class}
                    </span>
                  </div>

                  {/* Progress Bar Okupansi Saat Ini */}
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-400">Terisi: {floor.used} / {floor.capacity}</span>
                      <span className="font-bold text-white">{currentPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${progressColor}`}
                        style={{ width: `${Math.min(100, currentPercent)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Indikator Prediksi 15 Menit ke Depan */}
                  <div className="mt-4 pt-3 border-t border-slate-800/80 flex justify-between items-center text-xs">
                    <span className="text-slate-400">Prediksi (15m):</span>
                    <span className="font-mono font-bold text-indigo-300">
                      {predictedPercent}% Okupansi
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {Object.keys(floorsData).length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center text-slate-500">
              Menunggu event stream dari Kafka topic <code>parking.occupancy.stream</code>...
              <br />
              <span className="text-xs text-slate-600 mt-2 block">
                Jalankan script <code>python training/simulate_producer.py</code> untuk memutar rekaman data.
              </span>
            </div>
          )}
        </section>
      </main>
    </div>

);
} 6. Cara Menjalankan SimulasiPastikan Kafka & Redis Berjalan Lokal:Bash# Terminal 1 - Jalankan Redis
redis-server

# Terminal 2 - Jalankan Apache Kafka (Broker di localhost:9092)

kafka-server-start.sh /path/to/server.properties
Jalankan Python ML Inference Server: Bashcd services/ml-inference
python app/main.py

# Listening di port :50051

Jalankan Go Simulation Worker:Bashcd services/stream-worker
go run cmd/simulation_worker.go
Jalankan Go Backend API & Next.js Frontend[cite: 3]:Bash# Jalankan backend API
cd services/backend-api && go run cmd/main.go

# Jalankan frontend

cd services/frontend && npm run dev
Buka Browser & Jalankan Stream Replayer:Akses halaman di browser: http://localhost:3000/simulation.Jalankan skrip pemutar rekaman data CSV di terminal:Bashpython training/simulate_producer.py
Dashboard /simulation akan langsung bergerak memutar tanggal 1 September – 20 Oktober 2026 secara langsung dan menampilkan peringatan dini kemacetan parkir secara otomatis.
