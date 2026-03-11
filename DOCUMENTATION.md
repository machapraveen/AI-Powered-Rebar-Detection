# AI-Powered Rebar Detection - Technical Documentation

---

## 📦 Packages / Libraries

### Backend (Python)

| Package | Version | Purpose |
|---------|---------|---------|
| `torch` | >= 2.0.0 | PyTorch deep learning framework — powers the Faster R-CNN model for training and inference. Handles tensor operations, GPU acceleration (CUDA), model loading/saving, and gradient computation |
| `torchvision` | >= 0.15.0 | Provides the pre-trained Faster R-CNN model with ResNet-50 FPN backbone, image transformation pipelines, and detection utilities |
| `fastapi` | 0.115.6 | Modern async web framework — serves the REST API endpoints, handles file uploads, WebSocket connections, and CORS middleware |
| `uvicorn` | 0.34.0 | ASGI server that runs the FastAPI application with support for WebSocket, HTTP/2, and auto-reload during development |
| `opencv-python-headless` | >= 4.8.0 | Image processing library — draws detection circles, text overlays, color-coded annotations on result images. Headless variant (no GUI dependencies) for server environments |
| `pillow` | >= 10.0.0 | Python Imaging Library — loads uploaded images, converts between formats (JPEG/PNG/WebP), handles image resizing and RGB conversion |
| `numpy` | >= 1.24.0 | Numerical computing — processes detection arrays, computes bounding box coordinates, handles matrix operations for image data |
| `python-multipart` | 0.0.19 | Parses multipart form data — required by FastAPI to handle file uploads (`POST /api/detect`) |
| `jinja2` | 3.1.4 | Template engine — renders the `index.html` page with server-side variables (GPU name, model status) |
| `aiofiles` | 24.1.0 | Async file I/O — used by FastAPI's `StaticFiles` to serve CSS, JS, and images without blocking the event loop |
| `pycocotools` | >= 2.0.7 | COCO evaluation metrics — used during model training to compute mAP (mean Average Precision) scores |
| `requests` | >= 2.31.0 | HTTP client — downloads PyTorch Vision helper files (engine.py, transforms.py) during training setup |

### Frontend (CDN Libraries)

| Library | Version | Purpose |
|---------|---------|---------|
| `jsPDF` | 2.5.2 | Client-side PDF generation — creates professional detection reports with summary stats, cost breakdown tables, and detailed measurement data |
| `jsPDF-AutoTable` | 3.8.4 | Plugin for jsPDF — renders formatted tables in PDF reports (cost breakdown, per-rod measurements with headers and alignment) |
| `SheetJS (xlsx)` | 0.20.3 | Excel file generation — exports detection data as `.xlsx` spreadsheets with multiple sheets (Summary, Cost Breakdown, Detailed Measurements) |
| `Font Awesome` | 6.4.0 | Icon library — provides all UI icons (upload, camera, chart, currency, export, edit, settings icons) |
| `Google Fonts (Inter)` | - | Typography — clean, modern sans-serif font used across the entire UI for readability |

---

## 🧠 Algorithm Used

### Model Architecture

**Faster R-CNN (Faster Region-based Convolutional Neural Network)**

A two-stage object detection model that first proposes regions of interest, then classifies and refines them.

```
Input Image → ResNet-50 Backbone → Feature Pyramid Network (FPN) → Region Proposal Network (RPN) → ROI Pooling → Classification + Bounding Box Regression → Detected Rebars
```

### Stage-by-Stage Breakdown

| Stage | Component | What It Does |
|-------|-----------|-------------|
| **1. Feature Extraction** | ResNet-50 backbone | Extracts visual features from the input image at multiple scales. Pretrained on ImageNet (1.2M images) for robust feature learning |
| **2. Multi-Scale Features** | Feature Pyramid Network (FPN) | Creates a pyramid of feature maps at different resolutions. Enables detection of both small (6mm) and large (40mm) rebars |
| **3. Region Proposals** | Region Proposal Network (RPN) | Scans feature maps with anchor boxes to propose ~2000 candidate regions that might contain rebars |
| **4. ROI Processing** | ROI Align + FC layers | Crops and resizes each proposed region, then classifies it as rebar or background with a confidence score |
| **5. Output** | NMS (Non-Maximum Suppression) | Removes duplicate detections, keeping only the highest-confidence box for each rebar. Max 500 detections per image |

### Detection Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Classes | 2 | `rebar` (class 1) + `background` (class 0) |
| Confidence Threshold | 0.65 | Only detections with >65% confidence are shown |
| Max Detections | 500 | Maximum number of rebars detected per image |
| Input Format | RGB image | Any resolution, automatically processed |
| NMS IoU Threshold | 0.5 | Overlap threshold for removing duplicate boxes |

### Training Configuration

| Parameter | Value |
|-----------|-------|
| Epochs | 4 |
| Optimizer | Adam (lr = 3e-4) |
| LR Scheduler | StepLR (step=1, gamma=0.06) |
| Batch Size | 2 |
| Train/Val Split | 80% / 20% |
| Dataset Format | PASCAL VOC XML |
| Object Label | "steel" |
| Pretrained Weights | COCO (FasterRCNN_ResNet50_FPN_Weights.DEFAULT) |

### Size Estimation Algorithm

After detection, the system estimates each rebar's physical diameter:

```
1. Bounding Box → Pixel Radius
   radius_px = (box_width) × 0.5 × 0.6

2. Pixel Radius → Physical Diameter (mm)
   diameter_mm = radius_px × 2 × calibration_factor
   (default calibration: 0.264 mm/pixel)

3. Snap to Standard Size
   Match to nearest IS 1786 standard: [6, 8, 10, 12, 14, 16, 20, 25, 28, 32, 36, 40] mm
```

### Weight Calculation (IS Standard Formula)

```
Weight per rod (kg) = D² / 162 × L
```

Where:
- **D** = Diameter in mm
- **L** = Rod length in meters (6m, 9m, or 12m standard)
- **162** = Constant derived from steel density (7850 kg/m³)

Example: A 12mm rod of 12m length = (12² / 162) × 12 = **10.67 kg**

### Cost Calculation

```
Cost per rod (₹) = Weight per rod (kg) × Price per kg (₹/kg)
Total Cost (₹) = Σ (Cost per rod × Quantity) for each diameter size
```

Default pricing: ₹65/kg (Fe500D TMT bars, Indian market)

---

## 🧰 Technology Stack

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (Browser)                  │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  HTML5 UI   │  │ Canvas   │  │ WebSocket      │  │
│  │  (Jinja2)   │  │ Overlay  │  │ Client         │  │
│  └──────┬──────┘  └────┬─────┘  └───────┬────────┘  │
│         │              │                │            │
│  ┌──────┴──────────────┴────────────────┴─────────┐  │
│  │              JavaScript (app.js)               │  │
│  │         RebarDetectorApp Class                 │  │
│  └────────────────────┬──────────────────────────┘  │
└───────────────────────┼──────────────────────────────┘
                        │ HTTP / WebSocket
┌───────────────────────┼──────────────────────────────┐
│                 SERVER (FastAPI)                      │
│  ┌────────────────────┴──────────────────────────┐   │
│  │              backend/app.py                   │   │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────┐  │   │
│  │  │ REST API │  │ WebSocket │  │ Static    │  │   │
│  │  │ Endpoints│  │ Handler   │  │ Files     │  │   │
│  │  └────┬─────┘  └─────┬─────┘  └───────────┘  │   │
│  │       └──────┬────────┘                       │   │
│  │       ┌──────┴──────┐                         │   │
│  │       │ RebarDetector│                        │   │
│  │       │    Class     │                        │   │
│  │       └──────┬──────┘                         │   │
│  └──────────────┼────────────────────────────────┘   │
│          ┌──────┴──────┐                             │
│          │  PyTorch    │                             │
│          │ Faster RCNN │                             │
│          │ (GPU/CPU)   │                             │
│          └─────────────┘                             │
└──────────────────────────────────────────────────────┘
```

### Layer Breakdown

| Layer | Technology | Role |
|-------|-----------|------|
| **ML Framework** | PyTorch 2.x | Model definition, training, inference, GPU management |
| **Object Detection** | Faster R-CNN + ResNet-50 FPN | Pretrained model fine-tuned on rebar dataset |
| **Image Processing** | OpenCV + Pillow | Image loading, annotation drawing, format conversion |
| **Numerical** | NumPy | Array operations for bounding boxes and detection data |
| **Web Server** | FastAPI + Uvicorn | Async REST API, WebSocket, static file serving |
| **Templating** | Jinja2 | Server-side HTML rendering with dynamic variables |
| **Frontend** | Vanilla JavaScript (ES6+) | SPA with class-based architecture, no framework |
| **UI** | HTML5 + CSS3 | Responsive dark theme with animations |
| **PDF Export** | jsPDF + AutoTable | Client-side PDF report generation |
| **Excel Export** | SheetJS (xlsx) | Client-side spreadsheet generation |
| **Real-time** | WebSocket | Live camera feed detection stream |
| **Deployment** | Docker + Docker Compose | Containerized CPU and GPU profiles |
| **GPU** | NVIDIA CUDA | Hardware acceleration (auto-detected via setup.sh) |

### Communication Flow

```
Image Upload:    Browser → POST /api/detect → FastAPI → RebarDetector → PyTorch → Response JSON
Live Camera:     Browser → WS /ws/live → FastAPI → RebarDetector → PyTorch → WS frame response
Calibration:     Browser → POST /api/calibrate → FastAPI → Update calibration_factor
Health Check:    Browser → GET /api/health → FastAPI → Device/Model/GPU status
```

---

## 🎨 UI

### Design System

| Element | Specification |
|---------|--------------|
| **Theme** | Dark mode with deep navy/black gradient background |
| **Primary Color** | `#667eea` (blue-purple) → `#764ba2` (purple gradient) |
| **Accent Color** | `#00d4aa` (teal/green for success states) |
| **Warning Color** | `#f59e0b` (amber for edit mode) |
| **Font** | Inter (Google Fonts) — weights: 300, 400, 500, 600, 700, 800 |
| **Border Radius** | 16px (cards), 12px (buttons), 8px (inputs) |
| **Backdrop Filter** | `blur(20px)` glass-morphism effect on cards |
| **Background** | Animated CSS grid pattern with gradient overlay |

### Page Sections (Top to Bottom)

```
┌──────────────────────────────────────────┐
│  HEADER: Logo + GPU Badge               │
├──────────────────────────────────────────┤
│  HERO: Title + Description              │
├──────────────────────────────────────────┤
│  MODE SELECTOR: [Upload] [Camera]       │
├──────────────────────────────────────────┤
│  PRICING PANEL (collapsible):           │
│    Quick summary bar (Rate/Length/Sizes) │
│    Expanded: Price/kg input, rod length  │
│    selector, per-diameter price table    │
├──────────────────────────────────────────┤
│  UPLOAD AREA / CAMERA FEED              │
│    Drag & drop zone with preview        │
│    [Analyze Image] button               │
├──────────────────────────────────────────┤
│  RESULTS SECTION:                       │
│  ┌────────────────────────────────────┐  │
│  │ Header: [Edit Detections] [PDF]   │  │
│  │         [Excel] [Image]           │  │
│  ├────────────────────────────────────┤  │
│  │ Stat Cards: Count | Avg Dia |     │  │
│  │   Total Weight | Cost | Time      │  │
│  ├────────────────────────────────────┤  │
│  │ Cost Breakdown Table              │  │
│  ├────────────────────────────────────┤  │
│  │ Size Distribution Chart           │  │
│  ├────────────────────────────────────┤  │
│  │ Detection Image + Canvas Overlay  │  │
│  ├────────────────────────────────────┤  │
│  │ Detailed Measurements Table       │  │
│  └────────────────────────────────────┘  │
├──────────────────────────────────────────┤
│  FEATURES SECTION: 4 feature cards      │
├──────────────────────────────────────────┤
│  FOOTER                                 │
└──────────────────────────────────────────┘
```

### Key UI Features

| Feature | Description |
|---------|-------------|
| **Drag & Drop Upload** | Drop zone accepts JPG, PNG, WebP (max 50MB). Shows image preview with file info before analysis |
| **Live Camera** | Browser camera access with real-time WebSocket detection overlay. Switch between front/back cameras. FPS counter and live stats |
| **Pricing Panel** | Collapsible panel showing quick rate/length summary. Expand to edit price/kg (₹), rod length (6/9/12m), and custom per-diameter prices. Settings persist in localStorage |
| **Stat Cards** | 5 cards showing: Rebar count, average diameter, total weight (kg), estimated cost (₹), processing time |
| **Cost Breakdown** | Table with columns: Size, Qty, Wt/Rod, Total Wt, Rate/Rod, Subtotal. Footer shows grand total |
| **Size Distribution** | Horizontal bar chart showing count per diameter size, color-coded |
| **Edit Mode** | Amber "Edit Detections" button. Click any circle on the image to mark as "not a rod" (red X). Stats recalculate live. "X removed" badge shows count |
| **Export** | PDF report (jsPDF), Excel spreadsheet (SheetJS), annotated image download |
| **Toast Notifications** | Slide-in notifications for success/error/info messages |
| **Responsive** | Adapts to mobile, tablet, and desktop screen sizes |

### Color-Coded Detection Circles

Rebars are drawn as filled circles on the result image, color-coded by estimated diameter:

| Size Range | Color | Hex |
|-----------|-------|-----|
| 6-8mm | Green | `#00ff88` |
| 10-12mm | Cyan | `#00ddff` |
| 14-16mm | Blue | `#4488ff` |
| 20-25mm | Orange | `#ffaa00` |
| 28-32mm | Red | `#ff4444` |
| 36-40mm | Magenta | `#ff00ff` |

---

## ⚙ Backend

### File: `webapp/backend/app.py`

### Core Class: `RebarDetector`

The central class that handles all ML operations:

```python
class RebarDetector:
    ├── __init__()           # Loads model, sets device (GPU/CPU)
    ├── load_model()         # Loads Faster R-CNN with trained weights
    ├── detect(image)        # Runs inference, returns detections
    ├── estimate_diameter()  # Converts pixel radius to mm
    ├── calculate_weight()   # D²/162 × L formula
    ├── calculate_cost()     # Weight × price/kg
    ├── draw_detections()    # Annotates image with circles + labels
    └── calibrate()          # Updates pixel-to-mm ratio
```

### API Endpoints

| Method | Endpoint | Request | Response | Description |
|--------|----------|---------|----------|-------------|
| `GET` | `/` | - | HTML page | Serves the main web UI with GPU info injected via Jinja2 |
| `GET` | `/api/health` | - | `{status, device, gpu_available, gpu_name, model_loaded}` | Health check for monitoring |
| `POST` | `/api/detect` | `multipart/form-data` with image file | `{count, detections[], image_url, cost_estimate{}}` | Main detection endpoint — uploads image, runs inference, returns all results |
| `POST` | `/api/detect/frame` | `{image: base64_string}` | `{count, detections[], image_base64}` | Base64 frame detection for camera mode (REST fallback) |
| `WS` | `/ws/live` | WebSocket frames (base64) | `{count, detections[], image_base64}` per frame | Real-time detection stream for live camera |
| `POST` | `/api/calibrate` | `{known_diameter_mm, pixel_radius}` | `{calibration_factor}` | Calibrate pixel-to-mm conversion using a known rebar |
| `GET` | `/api/pricing` | - | `{price_per_kg, rod_length, prices{}}` | Get current pricing configuration |
| `POST` | `/api/pricing` | `{price_per_kg, rod_length_m, pricing{}}` | `{status, prices{}}` | Update pricing (per-kg rate, rod length, custom per-size prices) |
| `GET` | `/api/stats` | - | `{total_detections, device, gpu_memory{}}` | Runtime statistics and GPU memory usage |
| `DELETE` | `/api/clear` | - | `{status}` | Clear uploaded files and saved results |

### Detection Response Format

```json
{
  "count": 45,
  "inference_time": 0.234,
  "device": "cuda",
  "image_url": "/results/abc123.jpg",
  "detections": [
    {
      "id": 1,
      "center_x": 150,
      "center_y": 200,
      "radius": 18,
      "diameter_mm": 12.0,
      "area_mm2": 113.1,
      "standard_size": 12,
      "confidence": 0.92,
      "weight_kg": 10.67,
      "cost_inr": 693.3
    }
  ],
  "cost_estimate": {
    "total_cost": 31198.5,
    "total_weight": 479.97,
    "price_per_kg": 65,
    "rod_length_m": 12,
    "breakdown": [
      {"size": 12, "count": 30, "weight_per_rod": 10.67, "total_weight": 320.0, "cost_per_rod": 693.3, "subtotal": 20800.0},
      {"size": 16, "count": 15, "weight_per_rod": 18.96, "total_weight": 284.4, "cost_per_rod": 1232.6, "subtotal": 18489.0}
    ]
  }
}
```

### GPU Detection Flow

```
Server Start
    │
    ├── torch.cuda.is_available()?
    │   ├── Yes → DEVICE = "cuda", load model to GPU
    │   └── No  → DEVICE = "cpu", load model to CPU
    │
    ├── Log device info (GPU name, memory, or CPU warning)
    │
    └── Health endpoint reports device status
```

### Standard Rebar Sizes (IS 1786)

```python
STANDARD_REBAR_SIZES = [6, 8, 10, 12, 14, 16, 20, 25, 28, 32, 36, 40]  # mm
STANDARD_LENGTHS = [6, 9, 12]  # meters
```

---

## 💻 Frontend

### File: `webapp/frontend/static/js/app.js`

### Core Class: `RebarDetectorApp`

Single class managing the entire frontend application:

```
RebarDetectorApp
│
├── State Management
│   ├── currentMode          # "upload" or "camera"
│   ├── selectedFile         # Uploaded image file
│   ├── detections[]         # Array of detection objects from API
│   ├── excludedIds          # Set of IDs marked as "not a rod"
│   ├── editMode             # Boolean — edit mode active
│   ├── pricingConfig        # {pricePerKg, rodLength, customPrices}
│   └── imageSize            # {width, height} of result image
│
├── Image Upload Module
│   ├── setupUploadHandlers()  # Drag/drop + click-to-browse
│   ├── handleFileSelect()     # Validate file type/size
│   ├── showPreview()          # Display selected image
│   └── analyzeImage()        # POST to /api/detect
│
├── Camera Module
│   ├── startCamera()          # getUserMedia API
│   ├── switchCamera()         # Toggle front/back
│   ├── startDetection()       # Open WebSocket to /ws/live
│   ├── stopDetection()        # Close WebSocket
│   ├── captureFrame()         # Snapshot current frame
│   └── drawOverlay()          # Canvas overlay on video
│
├── Results Display Module
│   ├── displayResults()       # Populate all result sections
│   ├── displayDetectionsTable()  # Detailed measurements table
│   ├── displaySizeDistribution() # Bar chart by size
│   ├── displayCostBreakdown()    # Cost table with totals
│   └── updateStatCards()      # Count, weight, cost, time cards
│
├── Edit Mode Module
│   ├── toggleEditMode()       # Enter/exit edit mode
│   ├── setupEditCanvas()      # Size canvas to match image
│   ├── drawEditOverlay()      # Purple circles + red X for excluded
│   ├── handleCanvasClick()    # Find nearest detection, toggle exclude
│   └── recalcAfterEdit()     # Recalculate all stats from active detections
│
├── Pricing Module
│   ├── initPricing()          # Load from localStorage or defaults
│   ├── renderPricingTable()   # Per-diameter price table
│   ├── savePricing()          # Save to localStorage
│   ├── resetPricing()         # Restore defaults
│   └── recalculatePrices()    # Update costs with new rates
│
├── Export Module
│   ├── exportPDF()            # Generate PDF report (jsPDF)
│   ├── exportExcel()          # Generate XLSX (SheetJS)
│   └── downloadImage()       # Download annotated image
│
└── Utilities
    ├── showToast()            # Notification popups
    ├── formatCurrency()       # ₹ formatting
    └── getStandardSize()      # Snap to nearest IS size
```

### Key Frontend Interactions

| User Action | What Happens |
|------------|--------------|
| Drop/select image | File validated → preview shown → "Analyze" button enabled |
| Click "Analyze Image" | Image POSTed to `/api/detect` → loading spinner → results displayed |
| Click "Live Camera" | Camera permission requested → video feed starts → WebSocket opened |
| Click "Edit Detections" | Canvas overlay appears on result image → edit banner shown |
| Click on a circle (edit mode) | Nearest detection found → toggled in `excludedIds` → circle turns red X → all stats recalculate |
| Click "Done Editing" | Canvas hidden → edit banner hidden → final stats preserved |
| Click "PDF Report" | jsPDF generates multi-page report → auto-downloads |
| Click "Excel" | SheetJS creates 3-sheet workbook → auto-downloads |
| Change price/kg | localStorage updated → cost breakdown recalculated → display updated |
| Click "Recalculate" | New pricing applied to current detections → all cost displays refreshed |

### Data Flow: Image Detection

```
User drops image
    │
    ├── handleFileSelect()
    │   ├── Validate: JPG/PNG/WebP, <50MB
    │   └── Show preview
    │
    ├── analyzeImage()
    │   ├── Create FormData with file
    │   ├── POST /api/detect
    │   ├── Show loading spinner
    │   └── Wait for response
    │
    ├── displayResults(response)
    │   ├── Store detections[] and imageSize
    │   ├── Reset excludedIds
    │   ├── updateStatCards(count, avgDia, weight, cost, time)
    │   ├── displayCostBreakdown(cost_estimate)
    │   ├── displaySizeDistribution(detections)
    │   ├── Show annotated image
    │   └── displayDetectionsTable(detections)
    │
    └── Results visible, export buttons enabled
```

### localStorage Keys

| Key | Data | Purpose |
|-----|------|---------|
| `rebar_price_per_kg` | Number (e.g., 65) | User's custom price per kg rate |
| `rebar_rod_length` | Number (e.g., 12) | Selected rod length in meters |
| `rebar_custom_prices` | JSON object `{"12": 700, "16": 1200}` | Per-diameter custom price overrides |

---

## Installation & Setup

### Quick Start

```bash
git clone https://github.com/machapraveen/AI-Powered-Rebar-Detection.git
cd AI-Powered-Rebar-Detection/webapp
bash setup.sh     # Auto-detects GPU, installs everything
bash run.sh       # Starts server at http://localhost:8000
```

### Step-by-Step (Manual)

**Step 1** — Install base dependencies (CPU-level packages):
```bash
pip install -r webapp/requirements.txt
```
This installs: FastAPI, Uvicorn, OpenCV, Pillow, NumPy, pycocotools, aiofiles, Jinja2

**Step 2** — Install PyTorch with GPU support:
```bash
# If you already have CPU-only PyTorch, uninstall first:
pip uninstall torch torchvision -y

# Then install with CUDA (check your version with: nvidia-smi)
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121    # CUDA 12.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124    # CUDA 12.4
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118    # CUDA 11.8
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu      # CPU only
```

**Step 3** — Verify GPU:
```bash
python3 -c "import torch; print('CUDA:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU only')"
```

**Step 4** — Run:
```bash
cd webapp && python3 run.py
```
