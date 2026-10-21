# DATA_TRAINING.md

Panduan pipeline offline untuk data preparation, feature engineering, training model LightGBM, evaluasi, dan ekspor model untuk ML inference service.

## 1. Struktur Direktori

Simpan file dump CSV di `training/data/pgs_occupancy_log.csv`.

```text
training/
├── data/
│   └── pgs_occupancy_log.csv    # CSV dump dari tabel pgs_occupancy_log
├── train.py                     # Script training dan export model
├── requirements-train.txt       # Dependensi pipeline training
└── DATA_TRAINING.md             # Dokumentasi pipeline
```

## 2. Skema Data Mentah

Kolom yang digunakan dari `pgs_occupancy_log`:

| Kolom           | Keterangan                                                 |
| --------------- | ---------------------------------------------------------- |
| `id`            | Integer ID transaksi atau snapshot                         |
| `location_code` | Kode lokasi parkir, contoh `GI`                            |
| `floor_code`    | Kode unik lantai, contoh `B1`, `LG`, `GF1`, `P1.1`, `P1.2` |
| `floor_name`    | Nama deskriptif lantai                                     |
| `capacity`      | Kapasitas maksimal kendaraan pada lantai                   |
| `used`          | Jumlah slot parkir yang terisi pada saat snapshot          |
| `available`     | Sisa slot parkir (`capacity - used`)                       |
| `createdAt`     | Timestamp snapshot IoT, format `YYYY-MM-DD HH:mm:ss`       |

Pastikan nama kolom pada CSV sesuai dengan nama yang digunakan oleh script.

## 3. Target dan Feature Engineering

### A. Target multikelas: okupansi 15 menit ke depan

Target dihitung menggunakan okupansi tiga langkah ke depan setelah data di-resample ke interval 5 menit:

\[
\text{occupancy_ratio}_{t+15} =
\frac{\text{used}_{t+15}}{\text{capacity}}
\]

Kelas target:

| Kelas | Label            | Kondisi                 |
| ----: | ---------------- | ----------------------- |
|   `0` | Available        | Rasio okupansi `< 70%`  |
|   `1` | Padat / Warning  | `70% <= rasio < 90%`    |
|   `2` | Penuh / Critical | Rasio okupansi `>= 90%` |

### B. Fitur model

**Fitur lag — histori okupansi**

- `lag_occ_15m`: okupansi 15 menit sebelumnya (`t-15`)
- `lag_occ_30m`: okupansi 30 menit sebelumnya (`t-30`)
- `lag_occ_60m`: okupansi 60 menit sebelumnya (`t-60`)

**Delta dan filling velocity**

\[
\Delta \text{used}_{15m} = \text{used}\_t - \text{used}_{t-15m}
\]

\[
\text{velocity}_{15m} =
\frac{\Delta \text{used}_{15m}}{15}
\]

`velocity_15m` menunjukkan perubahan bersih jumlah kendaraan per menit. Nilai positif berarti jumlah kendaraan bertambah; nilai negatif berarti jumlah kendaraan berkurang.

**Fitur temporal**

- `hour`: jam (0–23)
- `day_of_week`: hari dalam minggu (0–6, Senin = 0)
- `is_weekend`: akhir pekan (`0` atau `1`)

**Fitur kapasitas dan kondisi saat ini**

- `capacity`
- `used`
- `occupancy_ratio`

> Catatan: `floor_code` dipertahankan saat preprocessing, tetapi tidak digunakan sebagai fitur pada daftar `features` di script training ini.

## 4. Dependensi Training

Buat file `training/requirements-train.txt` dengan isi berikut:

```text
pandas>=2.1.0
numpy>=1.24.0
lightgbm>=4.0.0
scikit-learn>=1.3.0
```

Instal dependensi:

```bash
pip install -r training/requirements-train.txt
```

## 5. Script Training (`training/train.py`)

Simpan kode berikut sebagai `training/train.py`:

```python
import os
import pandas as pd
import numpy as np
import lightgbm as lgb
from sklearn.metrics import classification_report, confusion_matrix

CSV_PATH = "training/data/pgs_occupancy_log.csv"
MODEL_OUTPUT_DIR = "services/ml-inference/app/models"
MODEL_OUTPUT_FILE = os.path.join(MODEL_OUTPUT_DIR, "lgbm_model.txt")


def load_and_preprocess(filepath):
    print("Membaca dataset CSV...")
    df = pd.read_csv(filepath)
    df["createdAt"] = pd.to_datetime(df["createdAt"])
    df = df.sort_values(by=["floor_code", "createdAt"])

    processed_groups = []

    print("Resampling interval 5 menit dan membuat fitur lag...")
    for floor_code, group in df.groupby("floor_code"):
        # Resampling interval 5 menit per lantai.
        g = (
            group.set_index("createdAt")
            .resample("5min")
            .last()
            .ffill()
            .reset_index()
        )
        g["floor_code"] = floor_code
        g["occupancy_ratio"] = (
            g["used"] / g["capacity"].replace(0, np.nan)
        )
        g["occupancy_ratio"] = g["occupancy_ratio"].fillna(0).clip(0.0, 1.0)

        # Satu langkah = 5 menit.
        # 3 langkah = 15 menit, 6 = 30 menit, 12 = 60 menit.
        g["lag_occ_15m"] = g["occupancy_ratio"].shift(3)
        g["lag_occ_30m"] = g["occupancy_ratio"].shift(6)
        g["lag_occ_60m"] = g["occupancy_ratio"].shift(12)

        # Delta dan velocity kendaraan selama 15 menit.
        g["delta_used_15m"] = g["used"] - g["used"].shift(3)
        g["velocity_15m"] = g["delta_used_15m"] / 15.0

        # Target status 15 menit ke depan (shift -3 langkah).
        target_ratio = g["occupancy_ratio"].shift(-3)
        conditions = [
            target_ratio < 0.70,
            (target_ratio >= 0.70) & (target_ratio < 0.90),
            target_ratio >= 0.90,
        ]
        g["target_class"] = np.select(
            conditions, [0, 1, 2], default=np.nan
        )

        processed_groups.append(g)

    data = pd.concat(processed_groups).dropna().reset_index(drop=True)

    # Fitur temporal.
    data["hour"] = data["createdAt"].dt.hour
    data["day_of_week"] = data["createdAt"].dt.dayofweek
    data["is_weekend"] = data["day_of_week"].isin([5, 6]).astype(int)
    data["floor_code"] = data["floor_code"].astype("category")

    return data


def train_and_export():
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(
            f"File {CSV_PATH} tidak ditemukan. "
            "Letakkan file dataset terlebih dahulu."
        )

    df = load_and_preprocess(CSV_PATH)

    features = [
        "capacity",
        "used",
        "occupancy_ratio",
        "lag_occ_15m",
        "lag_occ_30m",
        "lag_occ_60m",
        "delta_used_15m",
        "velocity_15m",
        "hour",
        "day_of_week",
        "is_weekend",
    ]
    target = "target_class"

    # Split berbasis urutan waktu: 80% awal untuk training, 20% akhir testing.
    # Catatan: untuk dataset multi-lantai, split yang lebih kuat sebaiknya
    # dilakukan secara kronologis berdasarkan timestamp global.
    split_index = int(len(df) * 0.8)
    train_data = df.iloc[:split_index]
    test_data = df.iloc[split_index:]

    X_train = train_data[features]
    y_train = train_data[target].astype(int)
    X_test = test_data[features]
    y_test = test_data[target].astype(int)

    print(f"Dataset summary: Train={len(X_train)}, Test={len(X_test)}")

    clf = lgb.LGBMClassifier(
        objective="multiclass",
        num_class=3,
        n_estimators=300,
        learning_rate=0.05,
        num_leaves=31,
        max_depth=6,
        random_state=42,
    )

    print("Melatih model LightGBM...")
    clf.fit(
        X_train,
        y_train,
        eval_set=[(X_test, y_test)],
        callbacks=[lgb.early_stopping(stopping_rounds=20, verbose=False)],
    )

    y_pred = clf.predict(X_test)

    print("\\n--- Model Evaluation Report ---")
    print(
        classification_report(
            y_test,
            y_pred,
            labels=[0, 1, 2],
            target_names=["Available", "Padat", "Penuh"],
            zero_division=0,
        )
    )
    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred, labels=[0, 1, 2]))

    # Ekspor model Booster native ke file teks LightGBM.
    os.makedirs(MODEL_OUTPUT_DIR, exist_ok=True)
    clf.booster_.save_model(MODEL_OUTPUT_FILE)
    print(f"Model berhasil disimpan ke: {MODEL_OUTPUT_FILE}")


if __name__ == "__main__":
    train_and_export()
```

## 6. Menjalankan Pipeline Training

Jalankan perintah berikut dari root direktori proyek.

### A. Siapkan direktori data

```bash
mkdir -p training/data
```

Letakkan file `pgs_occupancy_log.csv` di direktori `training/data/`.

### B. Jalankan training

```bash
pip install -r training/requirements-train.txt
python training/train.py
```

### C. Verifikasi model hasil ekspor

```bash
ls -la services/ml-inference/app/models/lgbm_model.txt
```

### D. Jalankan ML inference service

```bash
cd services/ml-inference
python app/main.py
```

## 7. Catatan Implementasi

- Jalankan perintah dari root proyek, kecuali jika disebutkan lain.
- Pastikan `capacity` valid dan lebih besar dari nol. Script mengubah rasio dengan kapasitas nol menjadi `0` setelah penanganan nilai kosong.
- Resampling menggunakan `last().ffill()` untuk mengisi snapshot yang hilang. Validasi data mentah terlebih dahulu agar tidak mengisi terlalu jauh melewati periode yang semestinya.
- Pembagian data saat ini menggunakan 80% baris pertama dan 20% baris terakhir. Karena data digabung per lantai, urutan hasil gabungan belum tentu merupakan split kronologis global yang benar-benar konsisten. Untuk evaluasi time-series yang lebih akurat, urutkan data gabungan berdasarkan `createdAt` sebelum split atau gunakan batas timestamp.
- Pastikan kelas target yang diperlukan tersedia pada data training. Jika salah satu kelas tidak muncul, konfigurasi klasifikasi multikelas dan evaluasi perlu diperiksa.
- File `lgbm_model.txt` adalah model Booster LightGBM. Pastikan kode inference memuat model dengan cara yang sesuai, misalnya melalui `lightgbm.Booster(model_file=...)`.
