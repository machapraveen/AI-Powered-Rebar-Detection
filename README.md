# AI-Powered Rebar Detection and Counting System

Computer vision system for **detecting, counting, measuring, and estimating costs** of steel rebars in construction images. Built with Faster R-CNN (ResNet-50 FPN backbone) on **PyTorch 2.x** with a full-stack web application.

**Accuracy**: 95% on construction-site rebar images

---

## Algorithm Used

| Component | Details |
|-----------|---------|
| **Architecture** | Faster R-CNN (Region-based Convolutional Neural Network) |
| **Backbone** | ResNet-50 with Feature Pyramid Network (FPN), pretrained on ImageNet/COCO |
| **Detection** | Two-stage: Region Proposal Network (RPN) generates candidate boxes, then classification + bounding box regression |
| **Size Estimation** | Detected bounding box pixel radius mapped to physical diameter via calibration factor, then snapped to nearest IS 1786 standard size (6-40mm) |
| **Weight Formula** | IS standard: `D²/162 × L` (D = diameter in mm, L = rod length in meters, result in kg) |
| **Confidence Threshold** | 0.65 (filters low-quality detections) |
| **Max Detections** | 500 per image |
| **Training** | 4 epochs, Adam optimizer (lr=3e-4), StepLR scheduler, 80-20 train-val split |
| **Dataset Format** | PASCAL VOC XML with "steel" class labels |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| **ML Framework** | PyTorch 2.x, TorchVision |
| **Object Detection** | Faster R-CNN with ResNet-50 FPN |
| **Backend** | FastAPI, Uvicorn, Python 3.10+ |
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **Real-time** | WebSocket (with REST fallback) |
| **Image Processing** | OpenCV, Pillow, NumPy |
| **Export** | jsPDF + autoTable (PDF), SheetJS/xlsx (Excel) |
| **Deployment** | Docker, Docker Compose (CPU & GPU profiles) |
| **GPU Acceleration** | NVIDIA CUDA (auto-detected via setup.sh) |

---

## Packages / Libraries

### Backend (Python)

| Package | Version | Purpose |
|---------|---------|---------|
| `torch` | >= 2.0.0 | Deep learning framework (model training & inference) |
| `torchvision` | >= 0.15.0 | Faster R-CNN model, image transforms, pretrained weights |
| `fastapi` | 0.115.6 | Web API framework with async support |
| `uvicorn` | 0.34.0 | ASGI server for FastAPI |
| `opencv-python-headless` | >= 4.8.0 | Image processing, circle drawing, annotations |
| `pillow` | >= 10.0.0 | Image loading and format conversion |
| `numpy` | >= 1.24.0 | Numerical operations on detection arrays |
| `python-multipart` | 0.0.19 | File upload handling in FastAPI |
| `jinja2` | 3.1.4 | HTML template rendering |
| `aiofiles` | 24.1.0 | Async file operations |
| `pycocotools` | >= 2.0.7 | COCO evaluation metrics for model training |
| `requests` | >= 2.31.0 | HTTP client for downloading vision helpers |

### Frontend (CDN)

| Library | Purpose |
|---------|---------|
| `jsPDF` 2.5.2 | PDF report generation |
| `jsPDF-AutoTable` 3.8.4 | Formatted tables in PDF reports |
| `SheetJS (xlsx)` 0.20.3 | Excel spreadsheet export |
| `Font Awesome` 6.4.0 | Icons throughout the UI |
| `Google Fonts (Inter)` | Typography |

---

## UI

- **Dark theme** with gradient background and grid animation
- **Two modes**: Image upload (drag & drop) and live camera feed
- **Pricing panel**: Collapsible panel with per-kg rate, rod length selector, per-diameter price table with custom overrides, saved to localStorage
- **Detection results**: Count, average diameter, total weight, estimated cost (INR), processing time
- **Cost breakdown table**: Per-size quantity, weight/rod, total weight, rate/rod, subtotal
- **Size distribution chart**: Visual bar chart of detected rebar sizes
- **Detection visualization**: Color-coded circles on the image, sized by detected diameter
- **Edit mode**: Click on any detected circle to mark it as "not a rod" - stats recalculate automatically
- **Export options**: PDF report (with cost breakdown), Excel spreadsheet, annotated image download
- **Responsive design**: Works on desktop and mobile

---

## Backend

- **FastAPI** server with CORS, static file serving, Jinja2 templates
- **RebarDetector class**: Loads Faster R-CNN model, runs inference, estimates diameters, calculates weight & cost
- **WebSocket** endpoint for real-time camera detection with frame throttling
- **Calibration system**: User can calibrate pixel-to-mm ratio using a known rebar size
- **GPU auto-detection**: Uses CUDA when available, falls back to CPU with warnings

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Web UI |
| `GET` | `/api/health` | Health check (device, model status, GPU info) |
| `POST` | `/api/detect` | Upload image for detection |
| `POST` | `/api/detect/frame` | Base64 frame detection (live camera) |
| `WS` | `/ws/live` | WebSocket real-time detection |
| `POST` | `/api/calibrate` | Set pixel-to-mm calibration |
| `GET` | `/api/pricing` | Get current rod pricing |
| `POST` | `/api/pricing` | Update rod pricing per diameter |
| `GET` | `/api/stats` | Statistics & GPU memory usage |
| `DELETE` | `/api/clear` | Clear saved results |

---

## Frontend

- **Single Page Application** built with vanilla JavaScript (no framework)
- **Class-based architecture**: `RebarDetectorApp` manages all state and interactions
- **Modules**:
  - Image upload with drag-and-drop, preview, and file validation
  - Live camera feed with WebSocket connection and overlay canvas
  - Detection results display with stat cards, tables, and charts
  - Edit mode with canvas overlay for false positive correction
  - Pricing manager with localStorage persistence
  - PDF report generator (jsPDF + autoTable)
  - Excel export (SheetJS)
  - Toast notification system

---

## Installation

### Option 1: Automatic Setup (Recommended)

The setup script auto-detects your GPU and installs PyTorch with the correct CUDA version.

```bash
cd webapp
bash setup.sh
```

This will:
1. Install all base dependencies (FastAPI, OpenCV, NumPy, etc.)
2. Detect your NVIDIA GPU via `nvidia-smi`
3. Install PyTorch with the matching CUDA version (cu118, cu121, cu124, or cu126)
4. Verify GPU detection at the end

### Option 2: Manual Installation

#### Step 1 - Install base dependencies (CPU-level packages)

```bash
pip install -r webapp/requirements.txt
```

This installs: FastAPI, Uvicorn, OpenCV, Pillow, NumPy, pycocotools, and other non-GPU packages.

#### Step 2 - Install PyTorch with GPU support

**If you already installed PyTorch (CPU-only) and want to upgrade to GPU:**

```bash
# Uninstall CPU-only PyTorch first
pip uninstall torch torchvision -y

# Install with CUDA support (pick your CUDA version):

# For CUDA 12.1 (most common, works with RTX 3050/3060/3070/3080/4060/4070/4090)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121

# For CUDA 12.4
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124

# For CUDA 11.8 (older drivers)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# For CPU only (no GPU)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
```

#### Step 3 - Verify GPU detection

```bash
python3 -c "import torch; print(f'CUDA: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0)}' if torch.cuda.is_available() else 'CPU only')"
```

Expected output with GPU:
```
CUDA: True
GPU: NVIDIA GeForce RTX 3050
```

If it says `CUDA: False` on a system with NVIDIA GPU:
1. Check NVIDIA drivers: `nvidia-smi`
2. If drivers missing: `sudo apt install nvidia-driver-535` (Ubuntu) and reboot
3. Re-run Step 2 to install CUDA-enabled PyTorch

### How to check your CUDA version

```bash
nvidia-smi
```

Look for "CUDA Version: XX.X" in the top-right of the output. Use this to pick the correct `--index-url` above.

---

## Running the Application

### Local

```bash
cd webapp
bash run.sh
# Or directly:
python3 run.py
```

Server starts at **http://localhost:8000**

The launcher will warn you if a GPU is present but PyTorch is CPU-only, and offer to fix it.

### Docker

```bash
# CPU only
docker-compose -f webapp/docker-compose.yml up

# With GPU (requires nvidia-docker)
docker-compose -f webapp/docker-compose.yml --profile gpu up
```

### Train Model from Scratch

```bash
python3 rebar_detection_modern.py
```

Place the output `.pth` files in the `model/` directory. The app loads the latest epoch automatically.

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
│   ├── run.sh                       # Launch script (with GPU check)
│   ├── setup.sh                     # Auto GPU detection + PyTorch install
│   ├── requirements.txt             # Python dependencies (non-PyTorch)
│   ├── Dockerfile                   # Multi-stage Docker build (CPU/GPU)
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
│   │   ├── JPEGImages/              # Training images
│   │   ├── Annotations/             # XML bounding boxes
│   │   └── ImageSets/Main/          # Train/val/test splits
│   └── test_dataset/                # Inference test images
│
└── example/                         # Sample detection outputs
```

---

## Cost Estimation

The system calculates material costs using the **IS standard weight formula**:

```
Weight per rod (kg) = D² / 162 × L
```

Where D = diameter in mm, L = rod length in meters.

### How It Works

1. **Configure pricing** - Set price per kg (default: INR 65/kg for Fe500D TMT bars) and rod length (6m, 9m, or 12m)
2. **Upload image** - Upload a rebar cross-section image
3. **Get results** - System detects rebars, classifies by diameter, and calculates:
   - Count per diameter size
   - Weight per rod using D²/162 × L
   - Cost per rod (weight × price/kg)
   - **Total estimated cost with full breakdown**
4. **Edit detections** - Remove false positives by clicking on them, costs recalculate automatically
5. **Export** - Download as PDF report or Excel spreadsheet

---

## Hardware Support

- **GPU (Recommended)**: NVIDIA CUDA-capable GPU (RTX 3050, 3060, 4060, etc.)
- **CPU**: Supported but slower and less accurate
- **Tested on**: NVIDIA GeForce GTX 1650, RTX 3050

---

## License

MIT
