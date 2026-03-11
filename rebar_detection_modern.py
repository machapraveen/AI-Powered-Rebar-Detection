#!/usr/bin/env python3
"""
Rebar Counting Computer Vision using Faster RCNN with ResNet-50 Pretrained Backbone
PyTorch 2.x Training Script
"""

import os
import sys
import requests
import zipfile
import shutil
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
import cv2
import random

import torch
import torchvision
from torchvision.models.detection.faster_rcnn import FastRCNNPredictor
from torchvision.models.detection import FasterRCNN_ResNet50_FPN_Weights
import pycocotools.cocoeval

print(f"PyTorch version: {torch.__version__}")
print(f"Torchvision version: {torchvision.__version__}")

# Device configuration
DEVICE = torch.device('cuda') if torch.cuda.is_available() else torch.device('cpu')
print(f"Using device: {DEVICE}")
if DEVICE.type == 'cuda':
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"Memory: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")

# ============================================================================
# STEP 1: Download datasets
# ============================================================================
def download_datasets():
    """Download the rebar count datasets"""
    if not os.path.exists('./rebar_count_datasets'):
        print('Downloading datasets...')
        url = 'https://cnnorth4-modelhub-datasets-obsfs-sfnua.obs.cn-north-4.myhuaweicloud.com/content/c2c1853f-d6a6-4c9d-ac0e-203d4c304c88/NkxX5K/dataset/rebar_count_datasets.zip'
        try:
            r = requests.get(url, allow_redirects=True, timeout=300)
            r.raise_for_status()
            with open('./rebar_count_datasets.zip', 'wb') as f:
                f.write(r.content)

            with zipfile.ZipFile('./rebar_count_datasets.zip', 'r') as zip_ref:
                zip_ref.extractall('./')

            os.remove('./rebar_count_datasets.zip')

            if os.path.exists('./rebar_count_datasets'):
                print('Dataset download successful!')
                return True
            else:
                print('Dataset extraction failed!')
                return False
        except Exception as e:
            print(f'Dataset download failed: {e}')
            return False
    else:
        print('./rebar_count_datasets already exists')
        return True

# ============================================================================
# STEP 2: Download PyTorch Vision API helpers
# ============================================================================
def download_vision_helpers():
    """Download PyTorch Vision detection helpers"""
    helper_files = ['utils.py', 'transforms.py', 'coco_eval.py', 'engine.py', 'coco_utils.py']

    if all(os.path.exists(f'./{f}') for f in helper_files):
        print('Vision helpers already exist')
        return True

    print('Downloading PyTorch Vision helpers...')
    try:
        url = 'https://github.com/pytorch/vision/archive/refs/tags/v0.17.0.zip'
        r = requests.get(url, allow_redirects=True, timeout=120)
        r.raise_for_status()

        with open('./vision_helpers.zip', 'wb') as f:
            f.write(r.content)

        with zipfile.ZipFile('./vision_helpers.zip', 'r') as zip_ref:
            zip_ref.extractall('./')

        os.remove('./vision_helpers.zip')

        # Copy helper files
        vision_dir = './vision-0.17.0/references/detection'
        for f in helper_files:
            src = os.path.join(vision_dir, f)
            if os.path.exists(src):
                shutil.copyfile(src, f'./{f}')

        # Cleanup
        if os.path.exists('./vision-0.17.0'):
            shutil.rmtree('./vision-0.17.0')

        print('Vision helpers downloaded successfully!')
        return True
    except Exception as e:
        print(f'Failed to download vision helpers: {e}')
        return False

# ============================================================================
# STEP 3: Data utilities
# ============================================================================
def read_xml(xml_path):
    """Read bounding boxes from XML annotation file"""
    tree = ET.parse(xml_path)
    root = tree.getroot()
    boxes = []
    labels = []
    for element in root.findall('object'):
        label = element.find('name').text
        if label == 'steel':
            bndbox = element.find('bndbox')
            xmin = bndbox.find('xmin').text
            ymin = bndbox.find('ymin').text
            xmax = bndbox.find('xmax').text
            ymax = bndbox.find('ymax').text
            boxes.append([xmin, ymin, xmax, ymax])
            labels.append(label)
    return np.array(boxes, dtype=np.float64), labels

def get_transform(train):
    """Get data transforms"""
    import transforms as T
    transform_list = [
        T.PILToTensor(),
        T.ToDtype(torch.float32, scale=True)
    ]
    if train:
        transform_list.append(T.RandomHorizontalFlip(0.5))
    return T.Compose(transform_list)

# ============================================================================
# STEP 4: Dataset class
# ============================================================================
class RebarDataset(torch.utils.data.Dataset):
    """PyTorch Dataset for Rebar detection"""
    def __init__(self, root, transforms=None):
        self.root = root
        self.transforms = transforms
        self.imgs = list(sorted(os.listdir(os.path.join(root, "JPEGImages"))))

        # Remove hidden files
        self.imgs = [f for f in self.imgs if not f.startswith('.')]

    def __getitem__(self, idx):
        img_path = os.path.join(self.root, "JPEGImages", self.imgs[idx])
        box_path = os.path.join(self.root, "Annotations", self.imgs[idx].split(".")[0] + '.xml')
        img = Image.open(img_path).convert("RGB")
        boxes, _ = read_xml(box_path)

        boxes = torch.as_tensor(boxes, dtype=torch.float32)
        labels = torch.ones((len(boxes),), dtype=torch.int64)

        area = (boxes[:, 3] - boxes[:, 1]) * (boxes[:, 2] - boxes[:, 0])
        iscrowd = torch.zeros((len(boxes),), dtype=torch.int64)

        target = {
            "boxes": boxes,
            "labels": labels,
            "image_id": torch.tensor([idx]),
            "area": area,
            "iscrowd": iscrowd
        }

        if self.transforms is not None:
            img, target = self.transforms(img, target)

        return img, target

    def __len__(self):
        return len(self.imgs)

# ============================================================================
# STEP 5: Model creation
# ============================================================================
def create_model(num_classes=2):
    """Create Faster RCNN model with pretrained ResNet50 backbone"""
    # Use modern weights API
    weights = FasterRCNN_ResNet50_FPN_Weights.DEFAULT
    model = torchvision.models.detection.fasterrcnn_resnet50_fpn(
        weights=weights,
        progress=True,
    )

    # Replace the classifier head
    in_features = model.roi_heads.box_predictor.cls_score.in_features
    model.roi_heads.box_predictor = FastRCNNPredictor(in_features, num_classes)
    model.roi_heads.detections_per_img = 500  # Max object detection

    return model

# ============================================================================
# STEP 6: Training
# ============================================================================
def train_model(num_epochs=4, batch_size=2):
    """Train the rebar detection model"""
    from engine import train_one_epoch
    import utils

    print("\n" + "="*60)
    print("TRAINING REBAR DETECTION MODEL")
    print("="*60)

    # Create model
    model = create_model(num_classes=2)
    model.to(DEVICE)

    # Load datasets
    train_dataset = RebarDataset("./rebar_count_datasets/VOC2007/", get_transform(True))

    print(f"Total images: {len(train_dataset)}")

    # Split dataset (80-20)
    indices = torch.randperm(len(train_dataset)).tolist()
    train_size = int(0.8 * len(indices))
    train_dataset = torch.utils.data.Subset(train_dataset, indices[:train_size])

    print(f"Training images: {len(train_dataset)}")

    # Create data loaders
    train_data_loader = torch.utils.data.DataLoader(
        train_dataset, batch_size=batch_size, shuffle=True,
        collate_fn=utils.collate_fn, num_workers=0
    )

    # Optimizer and scheduler
    params = [p for p in model.parameters() if p.requires_grad]
    optimizer = torch.optim.Adam(params, lr=3e-4)
    lr_scheduler = torch.optim.lr_scheduler.StepLR(optimizer, step_size=1, gamma=0.06)

    # Create model directory
    if os.path.exists("./model"):
        shutil.rmtree("./model")
    os.makedirs("./model")

    # Training loop
    for epoch in range(num_epochs):
        print(f"\n--- Epoch {epoch+1}/{num_epochs} ---")

        # Train one epoch
        train_one_epoch(model, optimizer, train_data_loader, DEVICE, epoch, print_freq=10)

        # Update learning rate
        lr_scheduler.step()

        # Save model
        model_path = os.path.join("./model", f'model_{epoch}.pth')
        torch.save(model.cpu().state_dict(), model_path)
        print(f"Model saved to {model_path}")
        model.to(DEVICE)

    print("\n" + "="*60)
    print("TRAINING COMPLETE!")
    print("="*60)
    return model

# ============================================================================
# STEP 7: Inference
# ============================================================================
def run_inference(num_images=5):
    """Run inference on test images"""
    print("\n" + "="*60)
    print("RUNNING INFERENCE")
    print("="*60)

    # Load model
    model = create_model(num_classes=2)
    model.to(DEVICE)

    # Find best model
    trained_models = os.listdir('./model')
    latest_epoch = -1
    best_model_name = None
    for model_name in trained_models:
        if not model_name.endswith('pth'):
            continue
        epoch = int(model_name.split('_')[1].split('.pth')[0])
        if epoch > latest_epoch:
            latest_epoch = epoch
            best_model_name = model_name

    if best_model_name is None:
        print("No trained model found!")
        return

    best_model_path = os.path.join('./model', best_model_name)
    print(f'Loading model from {best_model_path}')

    model.load_state_dict(torch.load(best_model_path, map_location=DEVICE, weights_only=True))
    model.eval()

    # Get test images
    test_img_dir = './rebar_count_datasets/test_dataset'
    if not os.path.exists(test_img_dir):
        print(f"Test directory not found: {test_img_dir}")
        return

    files = [f for f in os.listdir(test_img_dir) if not f.startswith('.')]
    random.shuffle(files)

    # Create output directory
    output_dir = './inference_results'
    if os.path.exists(output_dir):
        shutil.rmtree(output_dir)
    os.makedirs(output_dir)

    print(f"\nProcessing {min(num_images, len(files))} images...")

    for i, file_name in enumerate(files[:num_images]):
        image_src = Image.open(os.path.join(test_img_dir, file_name)).convert("RGB")
        img_tensor = torchvision.transforms.ToTensor()(image_src)

        with torch.no_grad():
            result_dict = model([img_tensor.to(DEVICE)])

        bbox = result_dict[0]["boxes"].cpu().numpy()
        scrs = result_dict[0]["scores"].cpu().numpy()

        image_draw = np.array(image_src.copy())

        rebar_count = 0
        for box, scr in zip(bbox, scrs):
            if scr > 0.65:
                pt = box
                center_x = int((pt[0] + pt[2]) * 0.5)
                center_y = int((pt[1] + pt[3]) * 0.5)
                radius = int((pt[2] - pt[0]) * 0.5 * 0.6)
                cv2.circle(image_draw, (center_x, center_y), radius, (255, 0, 0), -1)
                rebar_count += 1

        cv2.putText(image_draw, f'rebar_count: {rebar_count}', (25, 50),
                    cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 255, 0), 3)

        # Save result
        output_path = os.path.join(output_dir, f'result_{i+1}_{file_name}')
        plt.figure(figsize=(15, 10))
        plt.imshow(image_draw)
        plt.title(f'{file_name} - Detected: {rebar_count} rebars')
        plt.axis('off')
        plt.savefig(output_path, bbox_inches='tight', dpi=150)
        plt.close()

        print(f"  [{i+1}] {file_name}: {rebar_count} rebars detected -> {output_path}")

    print(f"\nResults saved to {output_dir}/")

# ============================================================================
# MAIN
# ============================================================================
def main():
    # Change to script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    print(f"Working directory: {os.getcwd()}")

    # Step 1: Download datasets
    print("\n[1/4] Downloading datasets...")
    if not download_datasets():
        print("ERROR: Failed to download datasets. Exiting.")
        sys.exit(1)

    # Step 2: Download vision helpers
    print("\n[2/4] Downloading vision helpers...")
    if not download_vision_helpers():
        print("ERROR: Failed to download vision helpers. Exiting.")
        sys.exit(1)

    # Step 3: Train model
    print("\n[3/4] Training model...")
    train_model(num_epochs=4, batch_size=2)

    # Step 4: Run inference
    print("\n[4/4] Running inference...")
    run_inference(num_images=10)

    print("\n" + "="*60)
    print("ALL TASKS COMPLETED SUCCESSFULLY!")
    print("="*60)

if __name__ == "__main__":
    main()
