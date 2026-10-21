# 🅿️ Smart Parking Analytics & Congestion Prediction System

Sistem analitik cerdas untuk pemantauan okupansi dan prediksi kemacetan parkir berbasis event streaming, machine learning, dan dashboard visualisasi real-time.

---

## 📑 Daftar Isi

- [Arsitektur Sistem](#-arsitektur-sistem)
- [Struktur Direktori](#-struktur-direktori)
- [Prasyarat Sistem](#-prasyarat-sistem)
- [Langkah Persiapan (Setup)](#-langkah-persiapan-setup)
  - [1. Database MySQL](#1-database-mysql)
  - [2. Model Machine Learning (Training)](#2-model-machine-learning-training)
  - [3. ML Inference Service (Python gRPC)](#3-ml-inference-service-python-grpc)
  - [4. Backend API (Go Gin & WebSocket)](#4-backend-api-go-gin--websocket)
  - [5. Frontend Dashboard (Next.js)](#5-frontend-dashboard-nextjs)
- [Menjalankan Simulasi Replay](#-menjalankan-simulasi-replay)
  - [Opsi A: Direct Replay (Tanpa Kafka / Standalone)](#opsi-a-direct-replay-tanpa-kafka--standalone)
  - [Opsi B: Menggunakan Kafka Stream](#opsi-b-menggunakan-kafka-stream)
- [Daftar Port & Endpoint](#-daftar-port--endpoint)

---

## 🏛️ Arsitektur Sistem

```text
[ Data Historis / IoT Sensors ]
               │
               ▼
   [ Kafka Stream / Direct CSV Replay ]
               │
               ▼
      [ Go Stream Worker ]  ◄──gRPC (50051)──►  [ Python ML Inference ]
         (Kalkulasi Lag/Velocity)                   (LightGBM Booster)
               │
      Redis Pub/Sub & HTTP Emit
               │
               ▼
     [ Go Backend API (:8080) ]
        (Auth, Gin, WebSocket)
               │
          WebSocket
               │
               ▼
   [ Next.js Frontend (:3000) ]
  (Live Dashboard & Simulation View)
```

1. **Frontend (`services/frontend`)**: Next.js 14 (App Router) + Tailwind CSS. Menampilkan dashboard interaktif, status per lantai, notifikasi peringatan dini (*early warning*), dan visualisasi pemutaran ulang simulasi.
2. **Backend API (`services/backend-api`)**: Go REST API (Gin framework), GORM (MySQL), JWT Authentication, serta WebSocket broadcaster (`/ws/simulation` dan `/ws/dashboard`).
3. **ML Inference Service (`services/ml-inference`)**: Python gRPC Microservice menjalankan model LightGBM untuk memprediksi okupansi 15 menit ke depan dan mengklasifikasikan status (`AVAILABLE`, `PADAT`, `PENUH`).
4. **Stream Worker (`services/stream-worker`)**: Go worker bertugas mengonsumsi stream Kafka atau memutar ulang CSV historis, menghitung fitur lag (15/30/60m) dan *velocity*, meminta inferensi via gRPC, dan mem-broadcast hasilnya.
5. **Training Module (`training/`)**: Pipeline pelatihan offline untuk data tabular time-series parkir (`pgs_occupancy_log.csv`) menghasilkan artefak model LightGBM.

---

## 📁 Struktur Direktori

```text
Smart Parking Analytics/
├── protos/
│   └── predictor.proto              # Definisi kontrak gRPC Protobuf
├── database/
│   └── init.sql                     # Skema inisialisasi database MySQL
├── training/
│   ├── data/
│   │   └── pgs_occupancy_log.csv    # Dataset historis okupansi parkir
│   ├── requirements-train.txt       # Dependensi training Python
│   ├── train.py                     # Skrip training model LightGBM
│   └── simulate_producer.py         # Skrip producer replay Kafka / HTTP
├── services/
│   ├── backend-api/                 # Go REST API & WebSocket Server
│   │   ├── cmd/main.go
│   │   └── internal/
│   ├── ml-inference/                # Python gRPC Server (LightGBM)
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   └── models/lgbm_model.txt
│   │   └── requirements.txt
│   ├── stream-worker/               # Go Stream Processor & Feature Calculator
│   │   ├── cmd/
│   │   │   └── simulation_worker.go
│   │   └── internal/rpc/
│   └── frontend/                    # Next.js 14 Real-Time Web Application
│       ├── app/
│       │   ├── login/
│       │   ├── register/
│       │   ├── dashboard/
│       │   └── simulation/
│       └── package.json
└── README.md
```

---

## ⚙️ Prasyarat Sistem

Sebelum menjalankan layanan, pastikan komponen berikut telah terpasang di sistem:

- **Go**: Versi 1.21 atau lebih baru
- **Node.js**: Versi 18+ dan npm
- **Python**: Versi 3.10 atau lebih baru
- **MySQL Server**: Versi 8.0+ (berjalan di `localhost:3306`)
- **Redis Server** (Opsional/Direkomendasikan): Berjalan di `localhost:6379`
- **Apache Kafka** (Opsional): Berjalan di `localhost:9092` jika ingin mode event streaming penuh

---

## 🚀 Langkah Persiapan (Setup)

### 1. Database MySQL

Pastikan MySQL aktif, lalu jalankan skrip inisialisasi:

```bash
mysql -u root -p < database/init.sql
```

> **Konfigurasi Database:** Backend membaca variabel lingkungan `DB_DSN`. Jika tidak diatur, backend menggunakan default:
> `root:root@tcp(127.0.0.1:3306)/parking_db?charset=utf8mb4&parseTime=True&loc=Local`
> (dengan fallback ke password kosong `root:@...`).

---

### 2. Model Machine Learning (Training)

Latih model LightGBM menggunakan dataset historis:

```bash
# Pindah ke direktori training
cd training

# Install dependensi
pip install -r requirements-train.txt

# Jalankan proses pelatihan
python train.py
```

Model hasil pelatihan akan otomatis disimpan di:
`services/ml-inference/app/models/lgbm_model.txt`

---

### 3. ML Inference Service (Python gRPC)

Jalankan microservice inferensi gRPC:

```bash
# Buka terminal baru dan masuk ke direktori ml-inference
cd services/ml-inference

# Install dependensi gRPC dan LightGBM
pip install -r requirements.txt

# Jalankan gRPC Server
python app/main.py
```
> Service akan mendengarkan request gRPC di port `:50051`.

---

### 4. Backend API (Go Gin & WebSocket)

Jalankan API backend dan WebSocket server:

```bash
# Buka terminal baru dan masuk ke direktori backend-api
cd services/backend-api

# Unduh module Go
go mod tidy

# Jalankan server
go run cmd/main.go
```
> Server API akan aktif di port `:8080`.

---

### 5. Frontend Dashboard (Next.js)

Jalankan aplikasi frontend Next.js:

```bash
# Buka terminal baru dan masuk ke direktori frontend
cd services/frontend

# Install node modules
npm install

# Jalankan server development
npm run dev
```
> Aplikasi web dapat diakses melalui browser di: `http://localhost:3000`
> - Halaman Login: `http://localhost:3000/login`
> - Halaman Register: `http://localhost:3000/register`
> - Live Dashboard: `http://localhost:3000/dashboard`
> - Simulasi Time-Series: `http://localhost:3000/simulation`

---

## 🔄 Menjalankan Simulasi Replay

Setelah seluruh service di atas berjalan, Anda dapat memutar ulang data stream simulasi ke halaman `/simulation`.

### Opsi A: Direct Replay (Tanpa Kafka / Standalone)

Mode termudah tanpa perlu setup broker Kafka. Worker membaca langsung data CSV dan menyiarkan hasil prediksi:

```bash
cd services/stream-worker

# Jalankan worker dengan direct CSV replay
go run cmd/simulation_worker.go -csv ../../training/data/pgs_occupancy_log.csv -delay 1000
```
> Parameter `-delay 1000` mengatur jeda 1 detik per snapshot waktu (1 detik simulasi merepresentasikan pergeseran waktu aktual).

Atau menggunakan skrip Python emitter:
```bash
cd training
python simulate_producer.py
```

### Opsi B: Menggunakan Kafka Stream

Jika Apache Kafka berjalan di `localhost:9092`:

1. **Jalankan Stream Worker**:
   ```bash
   cd services/stream-worker
   go run cmd/simulation_worker.go
   ```
2. **Jalankan Replay Producer**:
   ```bash
   cd training
   python simulate_producer.py
   ```

---

## 🌐 Daftar Port & Endpoint

| Komponen | Protokol / Port | Keterangan |
|---|---|---|
| **Frontend Web** | HTTP `:3000` | UI Dashboard & Simulasi (`Next.js`) |
| **Backend API** | HTTP `:8080` | REST API (`/api/v1/login`, `/api/v1/register`, `/api/v1/simulation/emit`) |
| **Backend WebSocket** | WS `:8080` | `/ws/simulation` (Replay Stream), `/ws/dashboard` (Live Logs) |
| **ML Inference Service** | gRPC `:50051` | Prediksi kemacetan `CongestionPredictor` |
| **MySQL Server** | TCP `:3306` | Database `parking_db` |
| **Redis Cache & Pub/Sub** | TCP `:6379` | Saluran `channel:simulation`, `channel:logs`, `channel:alerts` |
| **Kafka Broker** | TCP `:9092` | Topik `parking.occupancy.stream` |

