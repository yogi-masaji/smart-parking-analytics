package main

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	pb "stream-worker/internal/rpc"
)

type OccupancySnapshot struct {
	IDLog        int64  `json:"id_log"`
	LocationCode string `json:"location_code"`
	FloorCode    string `json:"floor_code"`
	FloorName    string `json:"floor_name"`
	Capacity     int32  `json:"capacity"`
	Used         int32  `json:"used"`
	Available    int32  `json:"available"`
	CreatedAt    string `json:"created_at"`
}

type SimulationBroadcast struct {
	Type           string  `json:"type,omitempty"`
	Timestamp      string  `json:"timestamp"`
	FloorCode      string  `json:"floor_code"`
	FloorName      string  `json:"floor_name"`
	Capacity       int32   `json:"capacity"`
	Used           int32   `json:"used"`
	Available      int32   `json:"available"`
	OccupancyRatio float32 `json:"occupancy_ratio"`
	PredictedRatio float32 `json:"predicted_ratio"`
	PredictedClass string  `json:"predicted_class"` // AVAILABLE, PADAT, PENUH
	EarlyWarning   bool    `json:"early_warning"`
	AlertMessage   string  `json:"alert_message"`
	Mode           string  `json:"mode,omitempty"`
	Speed          float64 `json:"speed,omitempty"`
}

type SimulationControl struct {
	Mode   string  `json:"mode"`
	Speed  float64 `json:"speed"`
	Status string  `json:"status"`
}

// In-memory history entry for lag calculation
type HistoryEntry struct {
	Timestamp int64
	Used      int32
}

var (
	memHistory   = make(map[string][]HistoryEntry)
	memHistoryMu sync.RWMutex

	activeControl = SimulationControl{
		Mode:   "15m",
		Speed:  1.0,
		Status: "play",
	}
	controlMu sync.RWMutex
)

func addHistory(floorCode string, unixTime int64, used int32) {
	memHistoryMu.Lock()
	defer memHistoryMu.Unlock()
	memHistory[floorCode] = append(memHistory[floorCode], HistoryEntry{
		Timestamp: unixTime,
		Used:      used,
	})
}

func getLagHistory(floorCode string, targetTime int64, defaultUsed int32) int32 {
	memHistoryMu.RLock()
	defer memHistoryMu.RUnlock()
	entries, exists := memHistory[floorCode]
	if !exists || len(entries) == 0 {
		return defaultUsed
	}

	var bestUsed int32 = defaultUsed
	found := false
	for i := len(entries) - 1; i >= 0; i-- {
		if entries[i].Timestamp <= targetTime {
			bestUsed = entries[i].Used
			found = true
			break
		}
	}
	if !found && len(entries) > 0 {
		bestUsed = entries[0].Used
	}
	return bestUsed
}

func fetchRemoteControl() {
	resp, err := http.Get("http://localhost:8080/api/v1/simulation/config")
	if err == nil && resp != nil {
		defer resp.Body.Close()
		var cfg SimulationControl
		if err := json.NewDecoder(resp.Body).Decode(&cfg); err == nil {
			controlMu.Lock()
			if cfg.Mode != "" {
				activeControl.Mode = cfg.Mode
			}
			if cfg.Speed > 0 {
				activeControl.Speed = cfg.Speed
			}
			if cfg.Status != "" {
				activeControl.Status = cfg.Status
			}
			controlMu.Unlock()
		}
	}
}

func processSnapshot(ctx context.Context, logData OccupancySnapshot, rdb *redis.Client, mlClient pb.CongestionPredictorClient, mode string, speed float64) {
	parsedTime, err := time.Parse("2006-01-02 15:04:05", logData.CreatedAt)
	if err != nil {
		parsedTime = time.Now()
	}
	ratio := float32(logData.Used) / float32(math.Max(1, float64(logData.Capacity)))

	// 1. Simpan history ke Redis Sorted Set & In-memory backup
	floorKey := fmt.Sprintf("sim:history:%s", logData.FloorCode)
	if rdb != nil {
		rdb.ZAdd(ctx, floorKey, redis.Z{
			Score:  float64(parsedTime.Unix()),
			Member: fmt.Sprintf("%d", logData.Used),
		})
	}
	addHistory(logData.FloorCode, parsedTime.Unix(), logData.Used)

	// 2. Hitung lag 15m, 30m, 60m
	getLagUsed := func(minutesAgo int64) float32 {
		targetScore := parsedTime.Add(-time.Duration(minutesAgo) * time.Minute).Unix()

		if rdb != nil {
			vals, err := rdb.ZRevRangeByScore(ctx, floorKey, &redis.ZRangeBy{
				Min:   "-inf",
				Max:   fmt.Sprintf("%d", targetScore),
				Count: 1,
			}).Result()
			if err == nil && len(vals) > 0 {
				usedVal, _ := strconv.Atoi(vals[0])
				return float32(usedVal) / float32(math.Max(1, float64(logData.Capacity)))
			}
		}

		usedVal := getLagHistory(logData.FloorCode, targetScore, logData.Used)
		return float32(usedVal) / float32(math.Max(1, float64(logData.Capacity)))
	}

	lag15Ratio := getLagUsed(15)
	deltaUsed15m := float32(logData.Used) - (lag15Ratio * float32(logData.Capacity))

	// 3. Panggil Model LightGBM via gRPC
	predictedRatio := ratio
	predictedClass := "AVAILABLE"
	earlyWarning := false
	alertMsg := "Kondisi lantai parkir lancar."

	if mlClient != nil {
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
		if err == nil && res != nil {
			predictedRatio = res.PredictedOccupancyRatio
			predictedClass = res.CongestionLevel
			earlyWarning = res.ShouldAlert
			alertMsg = res.AlertMessage
		}
	}

	// 4. Broadcast Data
	broadcastData := SimulationBroadcast{
		Type:           "event",
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
		Mode:           mode,
		Speed:          speed,
	}

	payloadJSON, _ := json.Marshal(broadcastData)

	// Redis Pub/Sub
	if rdb != nil {
		rdb.Publish(ctx, "channel:simulation", payloadJSON)
	}

	// Direct emit to Backend API
	go func(body []byte) {
		resp, err := http.Post("http://localhost:8080/api/v1/simulation/emit", "application/json", bytes.NewReader(body))
		if err == nil && resp != nil {
			resp.Body.Close()
		}
	}(payloadJSON)

	log.Printf("📊 [%s][%s @ %.1fx] %s: %d/%d (%.1f%%) -> Pred: %s (%.1f%%)",
		mode, logData.CreatedAt, speed, logData.FloorName, logData.Used, logData.Capacity,
		ratio*100, predictedClass, predictedRatio*100)
}

type RawFloorPoint struct {
	Timestamp time.Time
	Used      int32
}

func generateResampledSeries(csvPath string, stepMinutes int) (map[string][]OccupancySnapshot, []string) {
	file, err := os.Open(csvPath)
	if err != nil {
		log.Fatalf("Gagal membuka file CSV: %v", err)
	}
	defer file.Close()

	reader := csv.NewReader(file)
	header, err := reader.Read()
	if err != nil {
		log.Fatalf("Gagal membaca header CSV: %v", err)
	}

	colIdx := make(map[string]int)
	for i, col := range header {
		colIdx[col] = i
	}

	floorMetadata := make(map[string]OccupancySnapshot)
	floorPoints := make(map[string][]RawFloorPoint)

	var minTime, maxTime time.Time

	for {
		rec, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			continue
		}

		t, err := time.Parse("2006-01-02 15:04:05", rec[colIdx["createdAt"]])
		if err != nil {
			continue
		}

		fCode := rec[colIdx["floor_code"]]
		capVal, _ := strconv.Atoi(rec[colIdx["capacity"]])
		usedVal, _ := strconv.Atoi(rec[colIdx["used"]])

		if _, exists := floorMetadata[fCode]; !exists {
			floorMetadata[fCode] = OccupancySnapshot{
				LocationCode: rec[colIdx["location_code"]],
				FloorCode:    fCode,
				FloorName:    rec[colIdx["floor_name"]],
				Capacity:     int32(capVal),
			}
		}

		floorPoints[fCode] = append(floorPoints[fCode], RawFloorPoint{
			Timestamp: t,
			Used:      int32(usedVal),
		})

		if minTime.IsZero() || t.Before(minTime) {
			minTime = t
		}
		if maxTime.IsZero() || t.After(maxTime) {
			maxTime = t
		}
	}

	// Sort each floor points
	for f := range floorPoints {
		pts := floorPoints[f]
		sort.Slice(pts, func(i, j int) bool {
			return pts[i].Timestamp.Before(pts[j].Timestamp)
		})
		floorPoints[f] = pts
	}

	// Generate uniform timestamps with stepMinutes
	if stepMinutes <= 0 {
		stepMinutes = 15
	}
	stepDur := time.Duration(stepMinutes) * time.Minute

	var timestamps []string
	groups := make(map[string][]OccupancySnapshot)

	for curr := minTime; !curr.After(maxTime); curr = curr.Add(stepDur) {
		tsStr := curr.Format("2006-01-02 15:04:05")
		timestamps = append(timestamps, tsStr)

		for fCode, meta := range floorMetadata {
			pts := floorPoints[fCode]
			used := interpolateUsed(pts, curr)
			avail := meta.Capacity - used
			if avail < 0 {
				avail = 0
			}

			groups[tsStr] = append(groups[tsStr], OccupancySnapshot{
				LocationCode: meta.LocationCode,
				FloorCode:    meta.FloorCode,
				FloorName:    meta.FloorName,
				Capacity:     meta.Capacity,
				Used:         used,
				Available:    avail,
				CreatedAt:    tsStr,
			})
		}
	}

	return groups, timestamps
}

func interpolateUsed(pts []RawFloorPoint, target time.Time) int32 {
	if len(pts) == 0 {
		return 0
	}
	if !target.After(pts[0].Timestamp) {
		return pts[0].Used
	}
	if !target.Before(pts[len(pts)-1].Timestamp) {
		return pts[len(pts)-1].Used
	}

	// Find bracket
	for i := 0; i < len(pts)-1; i++ {
		p1 := pts[i]
		p2 := pts[i+1]
		if (target.Equal(p1.Timestamp) || target.After(p1.Timestamp)) && target.Before(p2.Timestamp) {
			totalSpan := p2.Timestamp.Sub(p1.Timestamp).Seconds()
			if totalSpan <= 0 {
				return p1.Used
			}
			fraction := target.Sub(p1.Timestamp).Seconds() / totalSpan
			interpolated := float64(p1.Used) + fraction*float64(p2.Used-p1.Used)
			return int32(math.Round(interpolated))
		}
	}
	return pts[len(pts)-1].Used
}

func runSimulationLoop(ctx context.Context, csvPath string, baseDelayMs int, rdb *redis.Client, mlClient pb.CongestionPredictorClient) {
	log.Printf("⏳ Menginisialisasi dataset dari: %s", csvPath)

	currentMode := ""
	var groups map[string][]OccupancySnapshot
	var timestamps []string
	currentIndex := 0

	for {
		// Poll control changes
		fetchRemoteControl()
		controlMu.RLock()
		mode := activeControl.Mode
		speed := activeControl.Speed
		status := activeControl.Status
		controlMu.RUnlock()

		if status == "pause" {
			time.Sleep(500 * time.Millisecond)
			continue
		}

		if status == "restart" {
			currentIndex = 0
			controlMu.Lock()
			activeControl.Status = "play"
			controlMu.Unlock()
		}

		// Rebuild dataset if mode changed
		if mode != currentMode {
			var stepMin int
			switch mode {
			case "realtime":
				stepMin = 5
			case "15m":
				stepMin = 15
			case "30m":
				stepMin = 30
			case "60m":
				stepMin = 60
			default:
				stepMin = 15
			}

			log.Printf("🔄 Memuat ulang data replay untuk mode: [%s] (interval: %d menit)...", mode, stepMin)
			groups, timestamps = generateResampledSeries(csvPath, stepMin)
			currentMode = mode
			if currentIndex >= len(timestamps) {
				currentIndex = 0
			}
			log.Printf("✅ Replay siap dengan %d snapshot waktu (interval: %d menit).", len(timestamps), stepMin)
		}

		if len(timestamps) == 0 {
			time.Sleep(1 * time.Second)
			continue
		}

		if currentIndex >= len(timestamps) {
			log.Println("🔄 Replay selesai, mengulang dari awal...")
			currentIndex = 0
		}

		ts := timestamps[currentIndex]
		batch := groups[ts]

		for _, snap := range batch {
			processSnapshot(ctx, snap, rdb, mlClient, mode, speed)
		}

		currentIndex++

		// Calculate adaptive delay based on speed
		if speed <= 0 {
			speed = 1.0
		}
		delay := time.Duration(float64(baseDelayMs)/speed) * time.Millisecond
		if delay < 10*time.Millisecond {
			delay = 10 * time.Millisecond
		}
		time.Sleep(delay)
	}
}

func main() {
	replayCSV := flag.String("csv", "../../training/data/pgs_occupancy_log.csv", "Path ke CSV")
	modeFlag := flag.String("mode", "15m", "Mode simulasi: realtime, 15m, 30m, 60m")
	speedFlag := flag.Float64("speed", 1.0, "Multiplier percepatan: 1.0, 2.0, 5.0, 10.0, 60.0")
	delayMs := flag.Int("delay", 1000, "Base delay per step dalam ms")
	flag.Parse()

	ctx := context.Background()

	controlMu.Lock()
	if *modeFlag != "" {
		activeControl.Mode = *modeFlag
	}
	if *speedFlag > 0 {
		activeControl.Speed = *speedFlag
	}
	controlMu.Unlock()

	// 1. Redis Client
	rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
	if err := rdb.Ping(ctx).Err(); err != nil {
		log.Println("ℹ️ Redis lokal standby (fallback ke memory history & HTTP backend broadcaster).")
		rdb = nil
	} else {
		log.Println("✅ Terhubung ke Redis localhost:6379")
	}

	// 2. gRPC Connection ke Python ML Inference
	conn, err := grpc.Dial("localhost:50051", grpc.WithTransportCredentials(insecure.NewCredentials()))
	var mlClient pb.CongestionPredictorClient
	if err != nil {
		log.Printf("⚠️ Gagal terhubung ke gRPC Python: %v. Fallback pred kalkulasi default.", err)
	} else {
		defer conn.Close()
		mlClient = pb.NewCongestionPredictorClient(conn)
		log.Println("✅ Terhubung ke Python ML Inference gRPC localhost:50051")
	}

	// Find CSV path
	csvPath := *replayCSV
	if _, err := os.Stat(csvPath); err != nil {
		altCSV := "training/data/pgs_occupancy_log.csv"
		if _, err := os.Stat(altCSV); err == nil {
			csvPath = altCSV
		}
	}

	log.Printf("🚀 Memulai Simulation Worker Replay: Mode=[%s], Speed=[%.1fx], Delay=[%dms]",
		activeControl.Mode, activeControl.Speed, *delayMs)

	runSimulationLoop(ctx, csvPath, *delayMs, rdb, mlClient)
}
