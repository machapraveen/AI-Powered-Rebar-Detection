#!/usr/bin/env python3
"""
Rebar Detection Web Application - Launcher Script
Run this script to start the application locally
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def main():
    # Get script directory
    script_dir = Path(__file__).resolve().parent
    os.chdir(script_dir)

    print("=" * 60)
    print("  REBAR DETECTION WEB APPLICATION")
    print("  AI-Powered Steel Bar Counting System")
    print("=" * 60)
    print()

    # Check for model
    model_dir = script_dir.parent / "model"
    if not model_dir.exists() or not list(model_dir.glob("*.pth")):
        print("WARNING: No trained model found in ../model/")
        print("         Please train the model first using rebar_detection_modern.py")
        print("         The app will use pretrained weights only.")
        print()

    # Install dependencies if needed
    try:
        import fastapi
        import uvicorn
        import torch
    except ImportError:
        print("Dependencies missing. Running setup...")
        setup_script = script_dir / "setup.sh"
        if setup_script.exists():
            subprocess.run(["bash", str(setup_script)], check=True)
        else:
            subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], check=True)
        print()

    # Check GPU
    try:
        import torch
        print(f"PyTorch version: {torch.__version__}")
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            gpu_mem = torch.cuda.get_device_properties(0).total_mem / 1024**3
            print(f"GPU: {gpu_name} ({gpu_mem:.1f} GB)")
        else:
            print("GPU: Not available (using CPU)")
            # Check if this is a misconfiguration
            has_nvidia = shutil.which("nvidia-smi") is not None
            if has_nvidia:
                print("")
                print("  WARNING: NVIDIA GPU detected but PyTorch cannot use it!")
                print("  This means PyTorch was installed without CUDA support.")
                print("  Detection quality will be poor on CPU.")
                print("")
                print("  FIX: Run 'bash setup.sh' to reinstall PyTorch with GPU support.")
                print("")
            else:
                print("  Tip: For better results, use a system with NVIDIA GPU.")
    except Exception:
        pass

    print()
    print("Starting server...")
    print("=" * 60)
    print()
    print("  Open your browser and navigate to:")
    print()
    print("     http://localhost:8000")
    print()
    print("  Press Ctrl+C to stop the server")
    print()
    print("=" * 60)
    print()

    # Run the app
    try:
        # Add parent directory to path for model access
        sys.path.insert(0, str(script_dir))

        # Import and run
        from backend.app import app, get_detector
        import uvicorn

        # Pre-load model
        get_detector()

        # Run server
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=8000,
            log_level="info",
            access_log=True
        )
    except KeyboardInterrupt:
        print("\nServer stopped.")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
