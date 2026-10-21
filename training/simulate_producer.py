import argparse
import json
import os
import sys
import time
import pandas as pd
import requests

CSV_PATH = "training/data/pgs_occupancy_log.csv"
KAFKA_BROKER = "localhost:9092"
TOPIC_NAME = "parking.occupancy.stream"

def load_and_resample(csv_path, mode="15m"):
    print(f"⏳ Membaca data historis dari {csv_path}...")
    df = pd.read_csv(csv_path)
    df['createdAt'] = pd.to_datetime(df['createdAt'])
    df = df.sort_values(by=['floor_code', 'createdAt'])

    freq_map = {
        "realtime": "5min",
        "15m": "15min",
        "30m": "30min",
        "60m": "60min"
    }
    freq = freq_map.get(mode, "15min")
    print(f"🔄 Resampling time-series ke interval: [{freq}]...")

    groups = []
    for floor_code, g in df.groupby('floor_code'):
        resampled = g.set_index('createdAt').resample(freq).asfreq()
        resampled['floor_code'] = floor_code
        resampled['floor_name'] = g['floor_name'].iloc[0]
        resampled['location_code'] = g['location_code'].iloc[0]
        resampled['capacity'] = g['capacity'].iloc[0]
        # Smooth interpolation
        resampled['used'] = resampled['used'].interpolate(method='linear').bfill().ffill().round().astype(int)
        resampled['available'] = (resampled['capacity'] - resampled['used']).clip(lower=0)
        resampled['id_log'] = range(len(resampled))
        groups.append(resampled.reset_index())

    combined = pd.concat(groups).sort_values(by=['createdAt', 'floor_code'])
    return combined

def run_simulation(mode="15m", speed=1.0, base_delay=1.0):
    if not os.path.exists(CSV_PATH):
        alt_path = os.path.join(os.path.dirname(__file__), "data", "pgs_occupancy_log.csv")
        if os.path.exists(alt_path):
            path = alt_path
        else:
            print(f"❌ File CSV tidak ditemukan di {CSV_PATH}")
            return
    else:
        path = CSV_PATH

    df = load_and_resample(path, mode=mode)

    producer = None
    try:
        from kafka import KafkaProducer
        producer = KafkaProducer(
            bootstrap_servers=[KAFKA_BROKER],
            value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            request_timeout_ms=2000
        )
        print(f"🚀 Terhubung ke Kafka Broker [{KAFKA_BROKER}]. Topic: [{TOPIC_NAME}]")
    except Exception as e:
        print(f"⚠️ Kafka Broker ({KAFKA_BROKER}) tidak aktif: {e}")
        print("🔄 Menggunakan fallback direct stream ke backend WebSocket (/api/v1/simulation/emit)...")

    # Update backend configuration
    try:
        requests.post("http://localhost:8080/api/v1/simulation/control", json={
            "mode": mode,
            "speed": speed,
            "status": "play"
        }, timeout=1)
    except Exception:
        pass

    grouped = df.groupby('createdAt')
    step_delay = max(0.01, base_delay / speed)
    print(f"▶️ Memulai replay: Mode=[{mode}], Speed=[{speed}x], Delay={step_delay:.3f}s per snapshot...")

    for timestamp, batch in grouped:
        ts_str = str(timestamp)
        print(f"📡 Snapshot: {ts_str} ({len(batch)} lantai) [Mode: {mode} @ {speed}x]")

        for _, row in batch.iterrows():
            payload = {
                "id_log": int(row['id_log']),
                "location_code": str(row['location_code']),
                "floor_code": str(row['floor_code']),
                "floor_name": str(row['floor_name']),
                "capacity": int(row['capacity']),
                "used": int(row['used']),
                "available": int(row['available']),
                "created_at": ts_str
            }

            if producer:
                try:
                    producer.send(TOPIC_NAME, value=payload)
                except Exception:
                    producer = None

            if not producer:
                cap = max(1, int(payload["capacity"]))
                used = int(payload["used"])
                ratio = float(used) / float(cap)
                predicted_ratio = ratio
                pred_class = "AVAILABLE"
                early_warning = False
                alert_msg = "Kondisi lantai parkir lancar."

                if ratio >= 0.85:
                    pred_class = "PENUH"
                    early_warning = True
                    alert_msg = f"🚨 Peringatan: {payload['floor_name']} hampir penuh ({int(ratio*100)}%)!"
                elif ratio >= 0.70:
                    pred_class = "PADAT"
                    alert_msg = f"⚠️ Perhatian: Arus kendaraan meningkat ({int(ratio*100)}%)."

                broadcast = {
                    "type": "event",
                    "timestamp": payload["created_at"],
                    "floor_code": payload["floor_code"],
                    "floor_name": payload["floor_name"],
                    "capacity": payload["capacity"],
                    "used": payload["used"],
                    "available": payload["available"],
                    "occupancy_ratio": ratio,
                    "predicted_ratio": predicted_ratio,
                    "predicted_class": pred_class,
                    "early_warning": early_warning,
                    "alert_message": alert_msg,
                    "mode": mode,
                    "speed": speed
                }
                try:
                    requests.post("http://localhost:8080/api/v1/simulation/emit", json=broadcast, timeout=1)
                except Exception:
                    pass

        if producer:
            producer.flush()

        time.sleep(step_delay)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Parking Occupancy Simulation Producer")
    parser.add_argument("--mode", choices=["realtime", "15m", "30m", "60m"], default="15m",
                        help="Interval sampling: realtime (5m), 15m, 30m, 60m (hourly)")
    parser.add_argument("--speed", type=float, default=1.0,
                        help="Kecepatan replay: 1.0, 2.0, 5.0, 10.0, 60.0")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="Base delay per snapshot in seconds (default: 1.0)")
    args = parser.parse_args()

    run_simulation(mode=args.mode, speed=args.speed, base_delay=args.delay)
