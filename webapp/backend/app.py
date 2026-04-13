"""
Rebar Detection Web Application - Backend API
FastAPI server with:
- Real-time rebar counting
- Diameter/Radius estimation
- Weight & cost calculation
- Live camera support via WebSocket
- PDF/Excel export support
"""

import os
import sys
import uuid
import time
import base64
import io
import json
import math
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from collections import Counter

import torch
import torchvision
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection import FasterRCNN_ResNet50_FPN_Weights
from PIL import Image
import numpy as np
import cv2

from fastapi import FastAPI, File, UploadFile, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ============================================================================
# Configuration
# ============================================================================
BASE_DIR = Path(__file__).resolve().parent.parent
# Check multiple model locations (local dev vs Docker/cloud deploy)
_model_candidates = [BASE_DIR.parent / "model", BASE_DIR / "model", Path("/app/model")]
MODEL_DIR = next((p for p in _model_candidates if p.exists() and list(p.glob("*.pth"))), BASE_DIR.parent / "model")
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# HF model repo for cloud download
HF_MODEL_REPO = "Mpraveen777/rebar-detection-model"
HF_MODEL_FILE = "model_3.pth"
UPLOAD_DIR = BASE_DIR / "uploads"
RESULTS_DIR = BASE_DIR / "results"
FRONTEND_DIR = BASE_DIR / "frontend"

UPLOAD_DIR.mkdir(exist_ok=True)
RESULTS_DIR.mkdir(exist_ok=True)

DEVICE = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')

# Standard rebar diameters in mm (IS 1786 standard)
STANDARD_REBAR_SIZES = [6, 8, 10, 12, 14, 16, 20, 25, 28, 32, 36, 40]

# Standard rod lengths in meters
STANDARD_LENGTHS = [6, 9, 12]

# Indian market reference prices (INR per kg) - Fe500D TMT bars
DEFAULT_PRICE_PER_KG = 65.0

# Steel density constant: Weight (kg) = D*D / 162 * L
# where D = diameter in mm, L = length in meters
WEIGHT_CONSTANT = 162.0


def calc_weight_per_rod(diameter_mm: int, length_m: float) -> float:
    """Calculate weight of a single rod using IS standard formula"""
    return round((diameter_mm * diameter_mm) / WEIGHT_CONSTANT * length_m, 2)


def calc_price_per_rod(diameter_mm: int, length_m: float, price_per_kg: float) -> float:
    """Calculate price of a single rod"""
    weight = calc_weight_per_rod(diameter_mm, length_m)
    return round(weight * price_per_kg, 2)


def build_pricing_table(price_per_kg: float, length_m: float) -> Dict[int, Dict]:
    """Build full pricing table for all standard sizes"""
    table = {}
    for d in STANDARD_REBAR_SIZES:
        weight = calc_weight_per_rod(d, length_m)
        table[d] = {
            "diameter_mm": d,
            "weight_per_rod_kg": weight,
            "price_per_rod": round(weight * price_per_kg, 2),
            "price_per_kg": price_per_kg
        }
    return table


# ============================================================================
# Model Loading with Diameter Estimation
# ============================================================================
class RebarDetector:
    """Enhanced Rebar Detection Model with Diameter & Cost Estimation"""

    def __init__(self, model_path: Optional[str] = None):
        self.model = None
        self.device = DEVICE
        self.confidence_threshold = 0.65
        self.pixels_per_mm = None
        self.price_per_kg = DEFAULT_PRICE_PER_KG
        self.rod_length = 12.0
        # Allow per-size price overrides (None means use calculated)
        self.price_overrides: Dict[int, Optional[float]] = {}
        self._load_model(model_path)

    def _load_model(self, model_path: Optional[str] = None):
        print(f"Loading model on {self.device}...")

        # Resolve custom weights first so we can skip pretrained download
        if model_path is None:
            model_files = list(MODEL_DIR.glob("model_*.pth"))
            if model_files:
                model_path = max(model_files, key=lambda x: int(x.stem.split('_')[1]))

        # Auto-download from HF if no local model found
        if not model_path or not Path(model_path).exists():
            try:
                from huggingface_hub import hf_hub_download
                print(f"Downloading model from HF: {HF_MODEL_REPO}/{HF_MODEL_FILE}...")
                model_path = hf_hub_download(
                    repo_id=HF_MODEL_REPO,
                    filename=HF_MODEL_FILE,
                    cache_dir=str(MODEL_DIR)
                )
                print(f"Model downloaded to: {model_path}")
            except Exception as e:
                print(f"Could not download model: {e}")

        has_custom_weights = model_path and Path(model_path).exists()

        # Skip 160MB pretrained download when custom weights will overwrite them
        weights = None if has_custom_weights else FasterRCNN_ResNet50_FPN_Weights.DEFAULT
        self.model = torchvision.models.detection.fasterrcnn_resnet50_fpn(
            weights=weights, progress=True)

        num_classes = 2
        in_features = self.model.roi_heads.box_predictor.cls_score.in_features
        self.model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
        self.model.roi_heads.detections_per_img = 500

        if has_custom_weights:
            print(f"Loading weights from: {model_path}")
            state_dict = torch.load(model_path, map_location=self.device, weights_only=True)
            self.model.load_state_dict(state_dict)

        self.model.to(self.device)
        self.model.eval()
        print("Model loaded successfully!")

    def get_price_for_size(self, diameter_mm: int) -> float:
        """Get price per rod - uses override if set, otherwise calculates from per-kg"""
        override = self.price_overrides.get(diameter_mm)
        if override is not None:
            return override
        return calc_price_per_rod(diameter_mm, self.rod_length, self.price_per_kg)

    def get_pricing_table(self) -> Dict:
        """Get full pricing table with any overrides applied"""
        table = build_pricing_table(self.price_per_kg, self.rod_length)
        for size, info in table.items():
            override = self.price_overrides.get(size)
            if override is not None:
                info["price_per_rod"] = override
                info["is_override"] = True
            else:
                info["is_override"] = False
        return table

    def estimate_diameter(self, box: List[float], image_width: int, image_height: int) -> Dict[str, Any]:
        x1, y1, x2, y2 = [float(x) for x in box]
        width_px = x2 - x1
        height_px = y2 - y1
        diameter_px = (width_px + height_px) / 2
        radius_px = diameter_px / 2

        if self.pixels_per_mm:
            diameter_mm = diameter_px / self.pixels_per_mm
        else:
            diameter_mm = self._match_to_standard_size(diameter_px, image_width)

        standard_size = int(self._get_nearest_standard(diameter_mm))
        weight = calc_weight_per_rod(standard_size, self.rod_length)

        return {
            "diameter_px": float(round(diameter_px, 2)),
            "radius_px": float(round(radius_px, 2)),
            "diameter_mm": float(round(diameter_mm, 1)),
            "radius_mm": float(round(diameter_mm / 2, 1)),
            "area_mm2": float(round(math.pi * (diameter_mm / 2) ** 2, 2)),
            "standard_size": standard_size,
            "weight_kg": weight
        }

    def _match_to_standard_size(self, diameter_px: float, image_width: int) -> float:
        relative_size = diameter_px / image_width
        if relative_size < 0.01:
            return 8.0
        elif relative_size < 0.02:
            return 10.0
        elif relative_size < 0.03:
            return 12.0
        elif relative_size < 0.04:
            return 16.0
        elif relative_size < 0.05:
            return 20.0
        elif relative_size < 0.07:
            return 25.0
        else:
            return 32.0

    def _get_nearest_standard(self, diameter_mm: float) -> int:
        return min(STANDARD_REBAR_SIZES, key=lambda x: abs(x - diameter_mm))

    def calibrate(self, known_diameter_mm: float, measured_diameter_px: float):
        self.pixels_per_mm = measured_diameter_px / known_diameter_mm
        return self.pixels_per_mm

    def detect(self, image: Image.Image, estimate_size: bool = True) -> dict:
        start_time = time.time()
        img_width, img_height = image.size
        img_tensor = torchvision.transforms.ToTensor()(image)

        with torch.no_grad():
            results = self.model([img_tensor.to(self.device)])

        boxes = results[0]["boxes"].cpu().numpy()
        scores = results[0]["scores"].cpu().numpy()

        mask = scores > self.confidence_threshold
        filtered_boxes = boxes[mask]
        filtered_scores = scores[mask]

        detections = []
        diameter_counts = Counter()
        total_area = 0.0
        total_weight = 0.0

        for i, (box, score) in enumerate(zip(filtered_boxes, filtered_scores)):
            box_list = [float(x) for x in box]
            detection = {
                "id": i + 1,
                "box": box_list,
                "confidence": round(float(score), 3),
                "center": [
                    round((box_list[0] + box_list[2]) / 2, 1),
                    round((box_list[1] + box_list[3]) / 2, 1)
                ]
            }

            if estimate_size:
                size_info = self.estimate_diameter(box.tolist(), img_width, img_height)
                detection.update(size_info)
                diameter_counts[size_info["standard_size"]] += 1
                total_area += size_info["area_mm2"]
                total_weight += size_info["weight_kg"]

            detections.append(detection)

        inference_time = time.time() - start_time

        summary = {
            "total_count": len(detections),
            "inference_time": round(inference_time, 3),
            "confidence_threshold": self.confidence_threshold,
            "image_size": {"width": img_width, "height": img_height}
        }

        if estimate_size and detections:
            diameters = [d["diameter_mm"] for d in detections]

            # Cost breakdown by size
            cost_breakdown = {}
            total_cost = 0.0
            for size, count in diameter_counts.items():
                unit_price = self.get_price_for_size(size)
                weight_per = calc_weight_per_rod(size, self.rod_length)
                size_cost = unit_price * count
                total_cost += size_cost
                cost_breakdown[str(size)] = {
                    "count": count,
                    "weight_per_rod_kg": weight_per,
                    "weight_total_kg": round(weight_per * count, 2),
                    "unit_price": round(unit_price, 2),
                    "subtotal": round(size_cost, 2)
                }

            summary["size_stats"] = {
                "min_diameter_mm": round(min(diameters), 1),
                "max_diameter_mm": round(max(diameters), 1),
                "avg_diameter_mm": round(sum(diameters) / len(diameters), 1),
                "total_cross_section_area_mm2": round(total_area, 2),
                "size_distribution": dict(diameter_counts.most_common())
            }

            summary["cost_estimate"] = {
                "total_cost": round(total_cost, 2),
                "total_weight_kg": round(total_weight, 2),
                "rod_length_m": self.rod_length,
                "price_per_kg": self.price_per_kg,
                "cost_breakdown": cost_breakdown
            }

            for det in detections:
                std_size = det.get("standard_size", 12)
                det["unit_price"] = round(self.get_price_for_size(std_size), 2)

        return {"summary": summary, "detections": detections}

    def detect_and_visualize(self, image: Image.Image, output_path: str, show_sizes: bool = True) -> dict:
        results = self.detect(image, estimate_size=show_sizes)
        img_array = np.array(image.copy())

        size_colors = {
            6: (255, 200, 200), 8: (255, 150, 150), 10: (255, 100, 100),
            12: (255, 50, 50), 14: (230, 50, 50), 16: (200, 50, 50),
            20: (150, 50, 50), 25: (100, 50, 100), 28: (80, 50, 130),
            32: (50, 50, 150), 36: (50, 100, 150), 40: (50, 150, 200)
        }

        for det in results["detections"]:
            box = det["box"]
            x1, y1, x2, y2 = [int(c) for c in box]
            center_x, center_y = int(det["center"][0]), int(det["center"][1])
            std_size = det.get("standard_size", 12)
            color = size_colors.get(std_size, (255, 50, 50))
            radius = max(int((x2 - x1 + y2 - y1) / 4 * 0.6), 5)

            cv2.circle(img_array, (center_x, center_y), radius, color, -1)
            cv2.circle(img_array, (center_x, center_y), radius, (255, 255, 255), 2)

            if show_sizes and radius > 10:
                size_text = f"{det.get('diameter_mm', '?')}mm"
                cv2.putText(img_array, size_text, (center_x - 15, center_y + radius + 15),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)

        self._draw_summary_panel(img_array, results)
        result_image = Image.fromarray(img_array)
        result_image.save(output_path, quality=95)
        results["output_path"] = output_path
        return results

    def _draw_summary_panel(self, img_array: np.ndarray, results: dict):
        h, w = img_array.shape[:2]
        panel_height = 140
        panel_width = min(450, w - 20)

        overlay = img_array.copy()
        cv2.rectangle(overlay, (10, 10), (panel_width, panel_height), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, img_array, 0.3, 0, img_array)
        cv2.rectangle(img_array, (10, 10), (panel_width, panel_height), (0, 255, 0), 2)

        font = cv2.FONT_HERSHEY_SIMPLEX
        count = results["summary"]["total_count"]
        cv2.putText(img_array, f"Rebar Count: {count}", (20, 40), font, 0.8, (0, 255, 0), 2)

        time_val = results["summary"]["inference_time"]
        cv2.putText(img_array, f"Time: {time_val}s", (20, 65), font, 0.5, (255, 255, 255), 1)

        if "size_stats" in results["summary"]:
            stats = results["summary"]["size_stats"]
            cv2.putText(img_array,
                       f"Avg: {stats['avg_diameter_mm']}mm | Range: {stats['min_diameter_mm']}-{stats['max_diameter_mm']}mm",
                       (20, 90), font, 0.45, (200, 200, 255), 1)
            cv2.putText(img_array,
                       f"Total Area: {stats['total_cross_section_area_mm2']} mm2",
                       (20, 110), font, 0.45, (200, 255, 200), 1)

        if "cost_estimate" in results["summary"]:
            cost = results["summary"]["cost_estimate"]
            cv2.putText(img_array,
                       f"Est. Cost: Rs.{cost['total_cost']:,.0f} | Weight: {cost['total_weight_kg']:.1f}kg",
                       (20, 130), font, 0.45, (255, 255, 150), 1)


# ============================================================================
# FastAPI Application
# ============================================================================
app = FastAPI(
    title="Rebar Detection API",
    description="AI-powered rebar counting with cost estimation and live camera",
    version="2.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")
app.mount("/results", StaticFiles(directory=RESULTS_DIR), name="results")

templates = Jinja2Templates(directory=FRONTEND_DIR / "templates")


# PWA: Serve service worker from root scope
@app.get("/sw.js")
async def service_worker():
    sw_path = FRONTEND_DIR / "static" / "sw.js"
    return FileResponse(
        sw_path,
        media_type="application/javascript",
        headers={"Service-Worker-Allowed": "/"}
    )

detector: Optional[RebarDetector] = None

def get_detector() -> RebarDetector:
    global detector
    if detector is None:
        detector = RebarDetector()
    return detector


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_json(self, websocket: WebSocket, data: dict):
        await websocket.send_json(data)

manager = ConnectionManager()


@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {
        "request": request,
        "device": str(DEVICE),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
    })


@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "2.1.0",
        "device": str(DEVICE),
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "model_loaded": detector is not None,
        "features": ["counting", "diameter_estimation", "cost_estimation", "live_camera", "export"]
    }


@app.post("/api/detect")
async def detect_rebars(file: UploadFile = File(...), estimate_size: bool = True):
    allowed_types = ["image/jpeg", "image/png", "image/jpg", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type")

    try:
        file_id = str(uuid.uuid4())[:8]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")

        model = get_detector()
        result_filename = f"result_{timestamp}_{file_id}.jpg"
        result_path = RESULTS_DIR / result_filename
        results = model.detect_and_visualize(image, str(result_path), show_sizes=estimate_size)

        return {
            "success": True,
            "data": {
                "rebar_count": results["summary"]["total_count"],
                "inference_time": results["summary"]["inference_time"],
                "confidence_threshold": results["summary"]["confidence_threshold"],
                "result_image": f"/results/{result_filename}",
                "image_size": results["summary"]["image_size"],
                "size_stats": results["summary"].get("size_stats"),
                "cost_estimate": results["summary"].get("cost_estimate"),
                "detections": results["detections"]
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/detect/frame")
async def detect_frame(request: Request):
    try:
        data = await request.json()
        image_data = data.get("image")
        if not image_data:
            raise HTTPException(status_code=400, detail="No image data provided")
        if "," in image_data:
            image_data = image_data.split(",")[1]
        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        model = get_detector()
        results = model.detect(image, estimate_size=True)
        return {"success": True, "data": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.websocket("/ws/live")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    model = get_detector()
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "frame":
                image_data = data.get("image", "")
                if "," in image_data:
                    image_data = image_data.split(",")[1]
                try:
                    image_bytes = base64.b64decode(image_data)
                    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
                    results = model.detect(image, estimate_size=True)
                    await manager.send_json(websocket, {"type": "detection", "data": results})
                except Exception as e:
                    await manager.send_json(websocket, {"type": "error", "message": str(e)})
            elif data.get("type") == "calibrate":
                known_size = data.get("known_diameter_mm", 12)
                measured_px = data.get("measured_diameter_px", 50)
                ppm = model.calibrate(known_size, measured_px)
                await manager.send_json(websocket, {"type": "calibration", "pixels_per_mm": ppm})
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/api/calibrate")
async def calibrate_detector(known_diameter_mm: float = 12.0, measured_diameter_px: float = 50.0):
    model = get_detector()
    ppm = model.calibrate(known_diameter_mm, measured_diameter_px)
    return {"success": True, "pixels_per_mm": ppm}


@app.get("/api/stats")
async def get_stats():
    result_files = list(RESULTS_DIR.glob("*.jpg"))
    gpu_memory = None
    if torch.cuda.is_available():
        gpu_memory = {
            "allocated": round(torch.cuda.memory_allocated() / 1024**2, 2),
            "cached": round(torch.cuda.memory_reserved() / 1024**2, 2),
            "total": round(torch.cuda.get_device_properties(0).total_memory / 1024**2, 2)
        }
    return {
        "total_detections": len(result_files),
        "device": str(DEVICE),
        "gpu_memory_mb": gpu_memory,
        "model_loaded": detector is not None
    }


@app.delete("/api/clear")
async def clear_results():
    count = 0
    for f in RESULTS_DIR.glob("*.jpg"):
        f.unlink()
        count += 1
    return {"cleared": count}


@app.get("/api/pricing")
async def get_pricing():
    model = get_detector()
    table = model.get_pricing_table()
    return {
        "price_per_kg": model.price_per_kg,
        "rod_length_m": model.rod_length,
        "standard_sizes": STANDARD_REBAR_SIZES,
        "standard_lengths": STANDARD_LENGTHS,
        "pricing_table": {str(k): v for k, v in table.items()},
        "overrides": {str(k): v for k, v in model.price_overrides.items() if v is not None}
    }


@app.post("/api/pricing")
async def update_pricing(request: Request):
    model = get_detector()
    data = await request.json()

    if "price_per_kg" in data:
        pkg = float(data["price_per_kg"])
        if pkg > 0:
            model.price_per_kg = pkg

    if "rod_length_m" in data:
        length = float(data["rod_length_m"])
        if length > 0:
            model.rod_length = length

    if "overrides" in data:
        for size_str, price in data["overrides"].items():
            size = int(size_str)
            if size in STANDARD_REBAR_SIZES:
                if price is None:
                    model.price_overrides.pop(size, None)
                elif isinstance(price, (int, float)) and price >= 0:
                    model.price_overrides[size] = float(price)

    table = model.get_pricing_table()
    return {
        "success": True,
        "price_per_kg": model.price_per_kg,
        "rod_length_m": model.rod_length,
        "pricing_table": {str(k): v for k, v in table.items()}
    }


if __name__ == "__main__":
    print("=" * 60)
    print("REBAR DETECTION WEB APPLICATION v2.1")
    print("Features: Counting, Measurement, Cost Estimation, Export")
    print("=" * 60)
    print(f"Device: {DEVICE}")
    if torch.cuda.is_available():
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    print("=" * 60)
    get_detector()
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
