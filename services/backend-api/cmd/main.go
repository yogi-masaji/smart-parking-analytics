package main

import (
	"context"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"sync"

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

type SimulationHub struct {
	clients map[*websocket.Conn]bool
	mu      sync.Mutex
}

var simHub = &SimulationHub{
	clients: make(map[*websocket.Conn]bool),
}

func (h *SimulationHub) Broadcast(msg []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for client := range h.clients {
		if err := client.WriteMessage(websocket.TextMessage, msg); err != nil {
			client.Close()
			delete(h.clients, client)
		}
	}
}

func (h *SimulationHub) Add(conn *websocket.Conn) {
	h.mu.Lock()
	h.clients[conn] = true
	h.mu.Unlock()
}

func (h *SimulationHub) Remove(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
}

type SimulationConfig struct {
	Mode   string  `json:"mode"`   // "realtime", "15m", "30m", "60m"
	Speed  float64 `json:"speed"`  // 1.0, 2.0, 5.0, 10.0, 60.0
	Status string  `json:"status"` // "play", "pause", "restart"
}

var (
	currentSimConfig = SimulationConfig{
		Mode:   "15m",
		Speed:  1.0,
		Status: "play",
	}
	simConfigMu sync.RWMutex
)

func main() {
	config.ConnectDatabase()

	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}
	rdb := redis.NewClient(&redis.Options{Addr: redisAddr})

	// Background worker for Redis Pub/Sub simulation channel
	go func() {
		ctx := context.Background()
		pubsub := rdb.Subscribe(ctx, "channel:simulation")
		defer pubsub.Close()
		ch := pubsub.Channel()
		for msg := range ch {
			if msg != nil && msg.Payload != "" {
				simHub.Broadcast([]byte(msg.Payload))
			}
		}
	}()

	r := gin.Default()

	// CORS Setup untuk Frontend Next.js lokal
	r.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:3000"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
	}))

	// Auth & Simulation Endpoints
	api := r.Group("/api/v1")
	{
		api.POST("/register", auth.Register)
		api.POST("/login", auth.Login)

		// Emission endpoint from worker or producer
		api.POST("/simulation/emit", func(c *gin.Context) {
			body, err := io.ReadAll(c.Request.Body)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
				return
			}
			// Attempt Redis publish if available
			_ = rdb.Publish(c.Request.Context(), "channel:simulation", body).Err()
			// Direct WebSocket broadcast
			simHub.Broadcast(body)
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		// Config endpoint
		api.GET("/simulation/config", func(c *gin.Context) {
			simConfigMu.RLock()
			defer simConfigMu.RUnlock()
			c.JSON(http.StatusOK, currentSimConfig)
		})

		// Control endpoint (mode: realtime, 15m, 30m, 60m; speed: 1.0, 2.0, 5.0, 10.0; status: play, pause, restart)
		api.POST("/simulation/control", func(c *gin.Context) {
			var req SimulationConfig
			if err := c.ShouldBindJSON(&req); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload"})
				return
			}

			simConfigMu.Lock()
			if req.Mode != "" {
				currentSimConfig.Mode = req.Mode
			}
			if req.Speed > 0 {
				currentSimConfig.Speed = req.Speed
			}
			if req.Status != "" {
				currentSimConfig.Status = req.Status
			}
			updated := currentSimConfig
			simConfigMu.Unlock()

			payload, _ := json.Marshal(gin.H{
				"type":   "control",
				"config": updated,
			})
			_ = rdb.Publish(c.Request.Context(), "channel:simulation:control", payload).Err()
			simHub.Broadcast(payload)

			c.JSON(http.StatusOK, gin.H{"status": "updated", "config": updated})
		})
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

	// WebSocket Channel Simulation (Historic Replay Stream & Real-time Control)
	r.GET("/ws/simulation", func(c *gin.Context) {
		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("WS upgrade error: %v", err)
			return
		}
		defer ws.Close()

		simHub.Add(ws)
		defer simHub.Remove(ws)

		// Send initial config to client on connect
		simConfigMu.RLock()
		initialCfg, _ := json.Marshal(gin.H{
			"type":   "control",
			"config": currentSimConfig,
		})
		simConfigMu.RUnlock()
		ws.WriteMessage(websocket.TextMessage, initialCfg)

		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				break
			}
			// If client sends control command via WS
			var ctrl SimulationConfig
			if err := json.Unmarshal(msg, &ctrl); err == nil && (ctrl.Mode != "" || ctrl.Speed > 0 || ctrl.Status != "") {
				simConfigMu.Lock()
				if ctrl.Mode != "" {
					currentSimConfig.Mode = ctrl.Mode
				}
				if ctrl.Speed > 0 {
					currentSimConfig.Speed = ctrl.Speed
				}
				if ctrl.Status != "" {
					currentSimConfig.Status = ctrl.Status
				}
				updated := currentSimConfig
				simConfigMu.Unlock()

				resp, _ := json.Marshal(gin.H{
					"type":   "control",
					"config": updated,
				})
				_ = rdb.Publish(context.Background(), "channel:simulation:control", resp).Err()
				simHub.Broadcast(resp)
			}
		}
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("🚀 Backend API server running on port :%s", port)
	r.Run(":" + port)
}
