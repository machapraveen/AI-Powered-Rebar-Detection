# AI-Powered Rebar Detection and Counting System

Computer vision system for **detecting, counting, measuring, and estimating costs** of steel rebars in construction images. Built with Faster R-CNN (ResNet-50 FPN backbone) on **PyTorch 2.x** with a full-stack web application.

**Accuracy**: 95% on construction-site rebar images

---

## Key Features

- **Rebar Detection & Counting** - Faster R-CNN detects up to 500 rebars per image with 95% accuracy
- **Diameter Estimation** - Estimates rebar diameter (6mm to 40mm) with standard size matching
- **Cost Estimation** - Calculates total cost based on user-configurable per-rod pricing for each diameter
- **Live Camera Detection** - Real-time detection via WebSocket with camera feed overlay
- **Calibration** - Pixel-to-mm calibration for precise physical measurements
- **Cross-sectional Area** - Computes total rebar cross-section area for structural analysis

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **ML Model** | PyTorch 2.x, Faster R-CNN, ResNet-50 FPN |
| **Backend** | FastAPI, Uvicorn, Python 3.10+ |
| **Frontend** | Vanilla JavaScript, HTML5, CSS3 |
| **Real-time** | WebSocket (with REST fallback) |
| **Deployment** | Docker, Docker Compose (CPU & GPU) |

---

## Quick Start

### 1. Install Dependencies

```bash
pip install -r webapp/requirements.txt
```

### 2. Run the Web Application

```bash
cd webapp && python3 run.py
```

Server starts at **http://localhost:8000**

### 3. Docker Deployment

```bash
# CPU only
docker-compose -f webapp/docker-compose.yml up

# With GPU (NVIDIA)
docker-compose -f webapp/docker-compose.yml --profile gpu up
```

---

## Project Structure

```
├── webapp/                          # Web Application
│   ├── backend/
│   │   ├── app.py                   # FastAPI server + RebarDetector class
│   │   └── __init__.py
│   ├── frontend/
│   │   ├── templates/index.html     # Main UI (SPA)
│   │   └── static/
│   │       ├── css/style.css        # Dark theme styling
│   │       └── js/app.js            # Frontend logic
│   ├── run.py                       # Application launcher
│   ├── requirements.txt             # Python dependencies
│   ├── Dockerfile                   # Multi-stage Docker build
│   └── docker-compose.yml           # CPU + GPU profiles
│
├── model/                           # Trained model weights (.pth)
│
├── rebar_detection_modern.py        # Training script (PyTorch 2.x)
├── engine.py                        # Training loop utilities
├── utils.py                         # Collate functions & helpers
├── transforms.py                    # Data augmentation
├── coco_eval.py                     # COCO evaluation metrics
├── coco_utils.py                    # COCO dataset utilities
│
├── rebar_count_datasets/            # Dataset (PASCAL VOC format)
│   ├── VOC2007/
│   │   ├── JPEGImages/              # Training images (~250)
│   │   ├── Annotations/             # XML bounding boxes
│   │   └── ImageSets/Main/          # Train/val/test splits
│   └── test_dataset/                # Inference test images
│
└── example/                         # Sample detection outputs
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Web UI |
| `GET` | `/api/health` | Health check (device, model status) |
| `POST` | `/api/detect` | Upload image for detection |
| `POST` | `/api/detect/frame` | Base64 frame detection (camera) |
| `WS` | `/ws/live` | WebSocket real-time detection |
| `POST` | `/api/calibrate` | Set pixel-to-mm calibration |
| `GET` | `/api/pricing` | Get current rod pricing |
| `POST` | `/api/pricing` | Update rod pricing per diameter |
| `GET` | `/api/stats` | Statistics & GPU memory |
| `DELETE` | `/api/clear` | Clear saved results |

---

## Cost Estimation

The system includes a **cost estimation module** that calculates material costs based on detected rebars:

### How It Works

1. **Set Pricing** - Configure cost per rod for each standard diameter (6mm to 40mm) via the pricing panel
2. **Upload Image** - Upload a rebar cross-section image
3. **Get Results** - System detects rebars, classifies by diameter, and calculates:
   - Count per diameter size
   - Unit price per rod
   - Subtotal per size category
   - **Total estimated cost**

### Default Pricing (INR)

| Size | 6mm | 8mm | 10mm | 12mm | 14mm | 16mm | 20mm | 25mm | 28mm | 32mm | 36mm | 40mm |
|------|-----|-----|------|------|------|------|------|------|------|------|------|------|
| Per rod | 15 | 25 | 40 | 55 | 75 | 100 | 155 | 240 | 300 | 390 | 495 | 610 |

Pricing is fully configurable via the UI or API. Supports rod lengths of 6m, 9m, and 12m (standard).

### API Example

```bash
# Set custom pricing
curl -X POST http://localhost:8000/api/pricing \
  -H "Content-Type: application/json" \
  -d '{"pricing": {"12": 60, "16": 110}, "rod_length_m": 12}'

# Detection returns cost_estimate in response
curl -X POST http://localhost:8000/api/detect \
  -F "file=@rebar_image.jpg"
```

---

## Model Details

| Parameter | Value |
|-----------|-------|
| Architecture | Faster R-CNN |
| Backbone | ResNet-50 FPN (pretrained) |
| Classes | 2 (rebar + background) |
| Confidence threshold | 0.65 |
| Max detections | 500 per image |
| Training epochs | 4 |
| Optimizer | Adam (lr=3e-4) |
| LR scheduler | StepLR (gamma=0.06) |
| Dataset split | 80-20 (train-val) |
| Dataset format | PASCAL VOC XML |

### Model Weights

Model weights (`.pth` files, ~159MB each) are not included in the repository due to GitHub size limits.

**Train from scratch:**
```bash
python3 rebar_detection_modern.py
```

Place the `.pth` files in the `model/` directory. The application automatically loads the latest epoch model.

### Dataset

The training dataset uses PASCAL VOC format with "steel" class labels (~684MB). Run the training script to download automatically, or place manually in `rebar_count_datasets/VOC2007/`.

---

## Detection Results

The system outputs:
- Annotated image with color-coded circles per rebar size
- Summary panel overlay (count, avg diameter, range, total area)
- Detailed measurements table (per-rod diameter, radius, area, confidence, cost)
- Size distribution breakdown
- **Cost estimate with breakdown by diameter**

---

## Hardware Support

- **GPU**: NVIDIA CUDA (recommended for real-time detection)
- **CPU**: Supported with decent performance
- **Tested on**: NVIDIA GeForce GTX 1650

---

## License

MIT
