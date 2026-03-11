#!/bin/bash
# Rebar Detection Web Application - Launch Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================"
echo "  REBAR DETECTION WEB APPLICATION"
echo "  AI-Powered Steel Bar Counting System"
echo "============================================================"
echo ""

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is not installed"
    exit 1
fi

# Check if PyTorch is installed (with CUDA if GPU available)
NEEDS_SETUP=false

if ! python3 -c "import torch" 2>/dev/null; then
    NEEDS_SETUP=true
    echo "PyTorch not found."
elif ! python3 -c "import fastapi" 2>/dev/null; then
    NEEDS_SETUP=true
    echo "Dependencies missing."
else
    # Check if GPU exists but PyTorch is CPU-only
    if command -v nvidia-smi &> /dev/null; then
        HAS_CUDA=$(python3 -c "import torch; print(torch.cuda.is_available())" 2>/dev/null)
        if [ "$HAS_CUDA" = "False" ]; then
            TORCH_VER=$(python3 -c "import torch; print(torch.__version__)" 2>/dev/null)
            echo "WARNING: NVIDIA GPU detected but PyTorch ($TORCH_VER) has no CUDA support!"
            echo "         Detection will be slow and inaccurate on CPU."
            echo ""
            echo "  Fix: Run 'bash setup.sh' to install GPU-enabled PyTorch"
            echo ""
            read -p "  Continue with CPU anyway? [y/N] " -n 1 -r
            echo ""
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                echo ""
                echo "Run: bash setup.sh"
                exit 0
            fi
        fi
    fi
fi

if [ "$NEEDS_SETUP" = true ]; then
    echo "Running setup..."
    echo ""
    bash "$SCRIPT_DIR/setup.sh"
    echo ""
fi

echo ""
echo "Starting server..."
echo "============================================================"
echo ""
echo "  Open your browser and navigate to:"
echo ""
echo "     http://localhost:8000"
echo ""
echo "  Press Ctrl+C to stop the server"
echo ""
echo "============================================================"
echo ""

# Run the application
python3 run.py
