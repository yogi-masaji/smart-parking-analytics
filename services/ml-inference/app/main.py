import grpc
from concurrent import futures
import lightgbm as lgb
import numpy as np
import os
import sys
import predictor_pb2
import predictor_pb2_grpc

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


class PredictorService(predictor_pb2_grpc.CongestionPredictorServicer):
    def __init__(self):
        model_path = os.path.join(os.path.dirname(__file__), "models", "lgbm_model.txt")
        if os.path.exists(model_path):
            self.model = lgb.Booster(model_file=model_path)
        else:
            self.model = None
            print("⚠️ Model file belum ditemukan, menggunakan simulasi kalkulasi default.")

    def PredictCongestion(self, request, context):
        cap = max(1.0, float(request.total_capacity))
        occ = float(request.current_occupancy)
        current_ratio = occ / cap
        delta_15m = float(request.in_rate_15m - request.out_rate_15m)
        velocity_15m = delta_15m / 15.0
        lag_occ_15m = max(0.0, min(1.0, (occ - delta_15m) / cap))

        level = "AVAILABLE"
        pred_ratio = current_ratio
        should_alert = False
        message = "Kondisi lantai parkir lancar."

        if self.model:
            try:
                features = np.array([[
                    cap,
                    occ,
                    current_ratio,
                    lag_occ_15m,
                    lag_occ_15m, # lag_30m fallback
                    lag_occ_15m, # lag_60m fallback
                    delta_15m,
                    velocity_15m,
                    float(request.hour_of_day),
                    float(request.day_of_week),
                    1.0 if request.is_weekend else 0.0
                ]])
                probs = self.model.predict(features)[0]
                pred_idx = int(np.argmax(probs))
                class_names = ["AVAILABLE", "PADAT", "PENUH"]
                level = class_names[pred_idx]

                # Estimate predicted ratio 15m ahead
                predicted_change = delta_15m / cap
                pred_ratio = max(0.0, min(1.0, current_ratio + predicted_change))

                if level == "PENUH" or pred_ratio >= 0.85:
                    level = "PENUH"
                    should_alert = True
                    message = f"🚨 Peringatan Dini: Lantai diprediksi PENUH ({int(pred_ratio * 100)}%) dalam 15 menit!"
                elif level == "PADAT" or pred_ratio >= 0.70:
                    level = "PADAT"
                    should_alert = (pred_ratio >= 0.80)
                    message = f"⚠️ Perhatian: Arus kendaraan meningkat ({int(pred_ratio * 100)}%)."
                else:
                    level = "AVAILABLE"
                    should_alert = False
                    message = "Kondisi lantai parkir lancar."
            except Exception as e:
                print(f"Error during model prediction: {e}")
                pred_ratio = current_ratio
        else:
            pred_ratio = current_ratio
            if pred_ratio >= 0.85:
                level = "PENUH"
                should_alert = True
                message = f"Peringatan: Okupansi diprediksi mencapai {int(pred_ratio * 100)}%!"
            elif pred_ratio >= 0.70:
                level = "PADAT"
                should_alert = True
                message = f"Perhatian: Arus kendaraan mulai padat ({int(pred_ratio * 100)}%)."

        return predictor_pb2.PredictionResponse(
            predicted_occupancy_ratio=float(pred_ratio),
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
