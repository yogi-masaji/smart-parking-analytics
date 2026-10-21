# 🅿️ Smart Parking Analytics Prediction & Monitoring System

Sistem pemantauan okupansi dan prediksi kemacetan parkir berbasis Go Backend API (Auth Register/Login & WebSocket), Go Stream Worker, FastAPI/gRPC (LightGBM Inference Service), dan Next.js Dashboard.

> **Catatan:** Setup ini berjalan langsung secara lokal (tanpa Docker) dan berfokus pada flow autentikasi user terlebih dahulu (tabel `parking_logs` dan CDC dilewati sementara).

---

## 📁 Repository Structure

```text
parking-congestion-system/
├── protos/
│   └── predictor.proto
├── database/
│   └── init.sql
├── services/
│   ├── backend-api/             # Go (Gin, GORM, MySQL, JWT Auth, Bcrypt, WebSocket)
│   │   ├── cmd/main.go
│   │   ├── internal/
│   │   │   ├── config/
│   │   │   │   └── database.go
│   │   │   ├── models/
│   │   │   │   └── user.go
│   │   │   ├── auth/
│   │   │   │   ├── handler.go
│   │   │   │   └── middleware.go
│   │   │   └── websocket/
│   │   │       └── hub.go
│   │   └── go.mod
│   │
│   ├── stream-worker/           # Go (Kafka Consumer, Redis Aggregator, gRPC Client)
│   │   ├── cmd/main.go
│   │   ├── internal/
│   │   │   └── rpc/
│   │   └── go.mod
│   │
│   ├── ml-inference/            # Python (gRPC Server, LightGBM Engine)
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── predictor.py
│   │   │   └── models/
│   │   │       └── lgbm_model.txt
│   │   └── requirements.txt
│   │
│   └── frontend/                # Next.js (App Router, Tailwind CSS)
│       ├── app/
│       │   ├── login/page.tsx
│       │   ├── register/page.tsx
│       │   └── dashboard/page.tsx
│       └── package.json
└── training/                    # Offline Training Notebooks & Scripts
    ├── train.py
    └── requirements-train.txt
```

---

## 🗄️ Database Setup (`database/init.sql`)

Jalankan query ini di MySQL lokal Anda. Hanya membuat database dan tabel user untuk flow login & registrasi:

```sql
CREATE DATABASE IF NOT EXISTS parking_db;
USE parking_db;

-- Tabel Users untuk Autentikasi
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(191) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'operator', 'manager') DEFAULT 'operator',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## 📡 Protocol Buffer Definition (`protos/predictor.proto`)

Definisi kontrak komunikasi gRPC antara Go Stream Worker dan Python ML Inference Service:

```protobuf
syntax = "proto3";

package predictor;

option go_package = "services/stream-worker/internal/rpc;rpc";

service CongestionPredictor {
  rpc PredictCongestion (PredictionRequest) returns (PredictionResponse);
}

message PredictionRequest {
  int32 site_id = 1;
  int32 current_occupancy = 2;
  int32 in_rate_15m = 3;
  int32 out_rate_15m = 4;
  int32 hour_of_day = 5;
  int32 day_of_week = 6;
  bool is_weekend = 7;
  int32 total_capacity = 8;
}

message PredictionResponse {
  float predicted_occupancy_ratio = 1; // 0.0 - 1.0
  string congestion_level = 2;         // LOW, MODERATE, HIGH, CRITICAL
  bool should_alert = 3;
  string alert_message = 4;
}
```

---

## 🔐 Backend API Go (`services/backend-api/`)

### 1. User Model (`internal/models/user.go`)

```go
package models

import "time"

type User struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Name      string    `gorm:"type:varchar(100);not null" json:"name"`
	Email     string    `gorm:"type:varchar(191);uniqueIndex;not null" json:"email"`
	Password  string    `gorm:"type:varchar(255);not null" json:"-"`
	Role      string    `gorm:"type:varchar(20);default:'operator'" json:"role"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
```

### 2. Database Connection (`internal/config/database.go`)

```go
package config

import (
	"log"
	"os"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"services/backend-api/internal/models"
)

var DB *gorm.DB

func ConnectDatabase() {
	dsn := os.Getenv("DB_DSN")
	if dsn == "" {
		// Default koneksi MySQL lokal
		dsn = "root:@tcp(127.0.0.1:3306)/parking_db?charset=utf8mb4&parseTime=True&loc=Local"
	}

	database, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Gagal terhubung ke MySQL lokal: %v", err)
	}

	database.AutoMigrate(&models.User{})
	DB = database
	log.Println("✅ MySQL lokal connected & user schema migrated")
}
```

### 3. Auth Handler (`internal/auth/handler.go`)

```go
package auth

import (
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"

	"services/backend-api/internal/config"
	"services/backend-api/internal/models"
)

type RegisterInput struct {
	Name     string `json:"name" binding:"required"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
	Role     string `json:"role"`
}

type LoginInput struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

func Register(c *gin.Context) {
	var input RegisterInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var existingUser models.User
	if err := config.DB.Where("email = ?", input.Email).First(&existingUser).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "Email sudah terdaftar"})
		return
	}

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal mengenkripsi kata sandi"})
		return
	}

	role := "operator"
	if input.Role != "" {
		role = input.Role
	}

	user := models.User{
		Name:     input.Name,
		Email:    input.Email,
		Password: string(hashedPassword),
		Role:     role,
	}

	if err := config.DB.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat user baru"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Registrasi berhasil",
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}

func Login(c *gin.Context) {
	var input LoginInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user models.User
	if err := config.DB.Where("email = ?", input.Email).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email atau password salah"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Email atau password salah"})
		return
	}

	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		secret = "supersecure_local_jwt_secret_key"
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": user.ID,
		"email":   user.Email,
		"role":    user.Role,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString([]byte(secret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Gagal membuat token akses"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Login berhasil",
		"token":   tokenString,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
			"role":  user.Role,
		},
	})
}
```

### 4. Main Entrypoint (`cmd/main.go`)

```go
package main

import (
	"context"
	"net/http"
	"os"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"

	"services/backend-api/internal/auth"
	"services/backend-api/internal/config"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	config.ConnectDatabase()

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})

	r := gin.Default()

	// CORS Setup untuk Frontend Next.js lokal
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Auth Endpoints
	api := r.Group("/api/v1")
	{
		api.POST("/register", auth.Register)
		api.POST("/login", auth.Login)
	}

	// WebSocket Channel Dashboard (Logs & Alerts)
	r.GET("/ws/dashboard", func(c *gin.Context) {
		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer ws.Close()

		pubsub := rdb.Subscribe(context.Background(), "channel:logs", "channel:alerts")
		defer pubsub.Close()

		ch := pubsub.Channel()
		for msg := range ch {
			ws.WriteJSON(gin.H{
				"channel": msg.Channel,
				"payload": msg.Payload,
			})
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	r.Run(":" + port)
}
```

---

## 🧠 ML Inference Service (`services/ml-inference/app/main.py`)

```python
import grpc
from concurrent import futures
import lightgbm as lgb
import numpy as np
import os
import predictor_pb2
import predictor_pb2_grpc

class PredictorService(predictor_pb2_grpc.CongestionPredictorServicer):
    def __init__(self):
        model_path = "app/models/lgbm_model.txt"
        if os.path.exists(model_path):
            self.model = lgb.Booster(model_file=model_path)
        else:
            self.model = None
            print("⚠️ Model file belum ditemukan, menggunakan simulasi kalkulasi default.")

    def PredictCongestion(self, request, context):
        if self.model:
            features = np.array([[
                request.current_occupancy,
                request.in_rate_15m,
                request.out_rate_15m,
                request.hour_of_day,
                request.day_of_week,
                1 if request.is_weekend else 0,
                request.total_capacity
            ]])
            pred_ratio = float(self.model.predict(features)[0])
        else:
            # Fallback kalkulasi sederhana jika model belum ditraining
            pred_ratio = request.current_occupancy / max(1, request.total_capacity)

        pred_ratio = max(0.0, min(1.0, pred_ratio))
        level = "LOW"
        should_alert = False
        message = "Kondisi parkir lancar."

        if pred_ratio >= 0.85:
            level = "CRITICAL"
            should_alert = True
            message = f"Peringatan: Okupansi diprediksi mencapai {int(pred_ratio * 100)}%!"
        elif pred_ratio >= 0.70:
            level = "HIGH"
            should_alert = True
            message = f"Perhatian: Arus kendaraan mulai padat ({int(pred_ratio * 100)}%)."

        return predictor_pb2.PredictionResponse(
            predicted_occupancy_ratio=pred_ratio,
            congestion_level=level,
            should_alert=should_alert,
            alert_message=message
        )

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    predictor_pb2_grpc.add_CongestionPredictorServicer_to_server(PredictorService(), server)
    server.add_insecure_port("[::]:50051")
    server.start()
    print("🚀 ML Inference Service running on port 50051")
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
```

---

## 🎨 Next.js Frontend (`services/frontend/`)

### 1. Register Page (`app/register/page.tsx`)

```tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:8080/api/v1/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal melakukan registrasi");
      }

      router.push("/login");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
          Register Account
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Daftarkan akun operator monitoring parkir.
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-950/50 border border-red-500/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Nama Lengkap
            </label>
            <input
              type="text"
              required
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Daftar"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Sudah punya akun?{" "}
          <Link href="/login" className="text-blue-400 hover:underline">
            Login di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
```

### 2. Login Page (`app/login/page.tsx`)

```tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:8080/api/v1/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Gagal masuk");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 font-sans text-slate-100">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
          Login Command Center
        </h2>
        <p className="text-sm text-slate-400 mb-6">
          Masuk untuk mengakses dashboard.
        </p>

        {error && (
          <div className="mb-4 rounded bg-red-950/50 border border-red-500/50 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full rounded bg-slate-800 border border-slate-700 px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              value={formData.password}
              onChange={(e) =>
                setFormData({ ...formData, password: e.target.value })
              }
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-500 transition disabled:opacity-50"
          >
            {loading ? "Memverifikasi..." : "Login"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-400">
          Belum punya akun?{" "}
          <Link href="/register" className="text-blue-400 hover:underline">
            Daftar baru
          </Link>
        </p>
      </div>
    </div>
  );
}
```

### 3. Dashboard Page Kosong (`app/dashboard/page.tsx`)

```tsx
"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token) {
      router.push("/login");
      return;
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/50 px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight text-white">
            🅿️ SmartParking
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase font-semibold">
            {user?.role || "OPERATOR"}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            Halo, <span className="text-white font-medium">{user?.name}</span>
          </span>
          <button
            onClick={handleLogout}
            className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded transition"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main Empty State Dashboard */}
      <main className="flex-1 p-8 flex items-center justify-center">
        <div className="max-w-md w-full rounded-xl border border-dashed border-slate-800 p-12 text-center flex flex-col items-center justify-center">
          <div className="h-14 w-14 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-2xl text-slate-400">
            📊
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">
            Workspace Dashboard Kosong
          </h3>
          <p className="text-sm text-slate-500 leading-relaxed">
            Halaman ini telah terproteksi autentikasi JWT. Nantinya bagian ini
            akan dihubungkan ke WebSocket (`/ws/dashboard`) untuk menampilkan
            stream log parkir dan peringatan kemacetan.
          </p>
        </div>
      </main>
    </div>
  );
}
```
