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

# Install dependencies if needed
if ! python3 -c "import fastapi, uvicorn, torch" 2>/dev/null; then
    echo "Installing dependencies..."
    pip3 install -r requirements.txt
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
