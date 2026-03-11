#!/bin/bash
# Rebar Detection - Setup Script
# Detects NVIDIA GPU and installs PyTorch with CUDA support automatically.
# Usage: bash setup.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "  REBAR DETECTION - SETUP"
echo "============================================================"
echo ""

# ── Check Python ──────────────────────────────────────────────
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed."
    exit 1
fi

PYTHON_VER=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python: $PYTHON_VER"

# ── Install base dependencies ────────────────────────────────
echo ""
echo "[1/2] Installing base dependencies..."
pip3 install -r requirements.txt

# ── Detect GPU & Install PyTorch ─────────────────────────────
echo ""
echo "[2/2] Setting up PyTorch..."

install_pytorch_cpu() {
    echo "Installing PyTorch (CPU)..."
    pip3 install torch torchvision --index-url https://download.pytorch.org/whl/cpu
}

install_pytorch_cuda() {
    local cuda_tag="$1"
    echo "Installing PyTorch with CUDA ($cuda_tag)..."
    pip3 install torch torchvision --index-url "https://download.pytorch.org/whl/$cuda_tag"
}

# Check for NVIDIA GPU
if command -v nvidia-smi &> /dev/null; then
    echo "nvidia-smi found. Detecting GPU..."
    echo ""
    nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>/dev/null || true
    echo ""

    # Get CUDA version from nvidia-smi
    CUDA_VERSION=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader 2>/dev/null | head -1)
    CUDA_VER_FULL=$(nvidia-smi 2>/dev/null | grep "CUDA Version" | sed 's/.*CUDA Version: \([0-9]*\.[0-9]*\).*/\1/')

    if [ -n "$CUDA_VER_FULL" ]; then
        echo "CUDA Version (driver supports): $CUDA_VER_FULL"
        CUDA_MAJOR=$(echo "$CUDA_VER_FULL" | cut -d. -f1)
        CUDA_MINOR=$(echo "$CUDA_VER_FULL" | cut -d. -f2)

        # Map CUDA version to PyTorch wheel tag
        # PyTorch supports: cu118, cu121, cu124, cu126
        if [ "$CUDA_MAJOR" -ge 12 ]; then
            if [ "$CUDA_MINOR" -ge 6 ]; then
                CUDA_TAG="cu126"
            elif [ "$CUDA_MINOR" -ge 4 ]; then
                CUDA_TAG="cu124"
            else
                CUDA_TAG="cu121"
            fi
        elif [ "$CUDA_MAJOR" -eq 11 ] && [ "$CUDA_MINOR" -ge 8 ]; then
            CUDA_TAG="cu118"
        elif [ "$CUDA_MAJOR" -eq 11 ]; then
            CUDA_TAG="cu118"
        else
            echo "WARNING: CUDA $CUDA_VER_FULL is too old. Minimum supported: 11.8"
            echo "Falling back to CPU."
            install_pytorch_cpu
            CUDA_TAG=""
        fi

        if [ -n "$CUDA_TAG" ]; then
            install_pytorch_cuda "$CUDA_TAG"
        fi
    else
        echo "WARNING: Could not detect CUDA version from nvidia-smi."
        echo "Attempting CUDA 12.1 (most common)..."
        install_pytorch_cuda "cu121"
    fi
else
    echo "No NVIDIA GPU detected (nvidia-smi not found)."
    echo ""

    # Check if user wants GPU support
    if [ "${1}" = "--force-gpu" ]; then
        echo "Force GPU flag set. Installing CUDA 12.1 build..."
        install_pytorch_cuda "cu121"
    else
        install_pytorch_cpu
    fi
fi

# ── Verify Installation ──────────────────────────────────────
echo ""
echo "============================================================"
echo "  VERIFICATION"
echo "============================================================"
echo ""

python3 -c "
import torch
print(f'PyTorch version: {torch.__version__}')
print(f'CUDA available:  {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU device:      {torch.cuda.get_device_name(0)}')
    mem = torch.cuda.get_device_properties(0).total_mem / 1024**3
    print(f'GPU memory:      {mem:.1f} GB')
    print()
    print('  >>> GPU READY - Detection will use GPU acceleration <<<')
else:
    print()
    if '${CUDA_TAG:-}':
        print('  WARNING: PyTorch CUDA installed but GPU not detected.')
        print('  Possible fixes:')
        print('    1. Install NVIDIA drivers: sudo apt install nvidia-driver-535')
        print('    2. Reboot after driver install')
        print('    3. Check: nvidia-smi')
    else:
        print('  Running in CPU mode (slower detection).')
        print('  For GPU: install NVIDIA drivers + run: bash setup.sh')
print()
"

echo "============================================================"
echo "  SETUP COMPLETE"
echo "  Run the app:  bash run.sh"
echo "============================================================"
