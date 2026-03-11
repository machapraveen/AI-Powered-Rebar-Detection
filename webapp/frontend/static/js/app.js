/**
 * Rebar Counter AI v2.0 - Frontend Application
 * Features: Upload, Live Camera, Diameter Estimation, Calibration
 */

class RebarDetectorApp {
    constructor() {
        this.elements = {
            // Mode
            uploadModeBtn: document.getElementById('uploadModeBtn'),
            cameraModeBtn: document.getElementById('cameraModeBtn'),
            uploadSection: document.getElementById('uploadSection'),
            cameraSection: document.getElementById('cameraSection'),

            // Upload
            uploadArea: document.getElementById('uploadArea'),
            fileInput: document.getElementById('fileInput'),
            previewArea: document.getElementById('previewArea'),
            previewImage: document.getElementById('previewImage'),
            previewInfo: document.getElementById('previewInfo'),
            clearBtn: document.getElementById('clearBtn'),
            analyzeBtn: document.getElementById('analyzeBtn'),

            // Camera
            cameraVideo: document.getElementById('cameraVideo'),
            overlayCanvas: document.getElementById('overlayCanvas'),
            cameraStatus: document.getElementById('cameraStatus'),
            switchCameraBtn: document.getElementById('switchCameraBtn'),
            captureBtn: document.getElementById('captureBtn'),
            startDetectionBtn: document.getElementById('startDetectionBtn'),
            stopDetectionBtn: document.getElementById('stopDetectionBtn'),
            liveCount: document.getElementById('liveCount'),
            liveAvgSize: document.getElementById('liveAvgSize'),
            liveFPS: document.getElementById('liveFPS'),

            // Calibration
            knownDiameter: document.getElementById('knownDiameter'),
            calibrateBtn: document.getElementById('calibrateBtn'),

            // Pricing
            pricingToggle: document.getElementById('pricingToggle'),
            pricingBody: document.getElementById('pricingBody'),
            pricingExpandBtn: document.getElementById('pricingExpandBtn'),
            pricingGrid: document.getElementById('pricingGrid'),
            savePricingBtn: document.getElementById('savePricingBtn'),
            resetPricingBtn: document.getElementById('resetPricingBtn'),
            rodLength: document.getElementById('rodLength'),

            // Results
            resultsSection: document.getElementById('resultsSection'),
            rebarCount: document.getElementById('rebarCount'),
            avgDiameter: document.getElementById('avgDiameter'),
            totalArea: document.getElementById('totalArea'),
            inferenceTime: document.getElementById('inferenceTime'),
            totalCostStat: document.getElementById('totalCostStat'),
            sizeDistribution: document.getElementById('sizeDistribution'),
            costTotal: document.getElementById('costTotal'),
            costBreakdown: document.getElementById('costBreakdown'),
            costNote: document.getElementById('costNote'),
            resultImage: document.getElementById('resultImage'),
            downloadBtn: document.getElementById('downloadBtn'),
            detectionsBody: document.getElementById('detectionsBody'),

            toast: document.getElementById('toast')
        };

        this.defaultPricing = {
            6: 15, 8: 25, 10: 40, 12: 55, 14: 75, 16: 100,
            20: 155, 25: 240, 28: 300, 32: 390, 36: 495, 40: 610
        };
        this.pricing = { ...this.defaultPricing };

        this.currentFile = null;
        this.resultImageUrl = null;
        this.currentMode = 'upload';

        // Camera state
        this.cameraStream = null;
        this.facingMode = 'environment';
        this.isDetecting = false;
        this.detectionInterval = null;
        this.ws = null;
        this.frameCount = 0;
        this.lastFPSUpdate = Date.now();

        this.init();
    }

    init() {
        this.bindEvents();
        this.checkHealth();
        this.loadPricing();
        this.buildPricingGrid();
    }

    bindEvents() {
        // Mode switching
        this.elements.uploadModeBtn.addEventListener('click', () => this.switchMode('upload'));
        this.elements.cameraModeBtn.addEventListener('click', () => this.switchMode('camera'));

        // Upload events
        this.elements.uploadArea.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
        });

        // Drag and drop
        this.elements.uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.add('drag-over');
        });
        this.elements.uploadArea.addEventListener('dragleave', () => {
            this.elements.uploadArea.classList.remove('drag-over');
        });
        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            this.elements.uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]);
        });

        // Buttons
        this.elements.clearBtn.addEventListener('click', () => this.clearSelection());
        this.elements.analyzeBtn.addEventListener('click', () => this.analyzeImage());
        this.elements.downloadBtn.addEventListener('click', () => this.downloadResult());

        // Camera controls
        this.elements.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        this.elements.captureBtn.addEventListener('click', () => this.captureFrame());
        this.elements.startDetectionBtn.addEventListener('click', () => this.startLiveDetection());
        this.elements.stopDetectionBtn.addEventListener('click', () => this.stopLiveDetection());
        this.elements.calibrateBtn.addEventListener('click', () => this.calibrate());

        // Pricing controls
        this.elements.pricingToggle.addEventListener('click', () => this.togglePricing());
        this.elements.savePricingBtn.addEventListener('click', () => this.savePricing());
        this.elements.resetPricingBtn.addEventListener('click', () => this.resetPricing());
    }

    async checkHealth() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            console.log('API Health:', data);
        } catch (error) {
            console.error('Health check failed:', error);
        }
    }

    // ========================================================================
    // Mode Switching
    // ========================================================================
    switchMode(mode) {
        this.currentMode = mode;

        // Update buttons
        this.elements.uploadModeBtn.classList.toggle('active', mode === 'upload');
        this.elements.cameraModeBtn.classList.toggle('active', mode === 'camera');

        // Show/hide sections
        this.elements.uploadSection.classList.toggle('hidden', mode !== 'upload');
        this.elements.cameraSection.classList.toggle('hidden', mode !== 'camera');

        // Handle camera
        if (mode === 'camera') {
            this.startCamera();
        } else {
            this.stopCamera();
        }
    }

    // ========================================================================
    // File Upload
    // ========================================================================
    handleFile(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            this.showToast('Please upload a valid image file', 'error');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            this.showToast('File size must be less than 50MB', 'error');
            return;
        }

        this.currentFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.previewImage.src = e.target.result;
            this.elements.uploadArea.classList.add('hidden');
            this.elements.previewArea.classList.remove('hidden');
            this.elements.analyzeBtn.disabled = false;

            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            this.elements.previewInfo.textContent = `${file.name} (${sizeMB} MB)`;
        };
        reader.readAsDataURL(file);

        this.elements.resultsSection.classList.add('hidden');
    }

    clearSelection() {
        this.currentFile = null;
        this.elements.fileInput.value = '';
        this.elements.previewImage.src = '';
        this.elements.previewArea.classList.add('hidden');
        this.elements.uploadArea.classList.remove('hidden');
        this.elements.analyzeBtn.disabled = true;
        this.elements.resultsSection.classList.add('hidden');
    }

    async analyzeImage() {
        if (!this.currentFile) {
            this.showToast('Please select an image first', 'error');
            return;
        }

        this.setLoading(true);

        try {
            const formData = new FormData();
            formData.append('file', this.currentFile);

            const response = await fetch('/api/detect?estimate_size=true', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Detection failed');
            }

            const result = await response.json();

            if (result.success) {
                this.displayResults(result.data);
                this.showToast(`Detected ${result.data.rebar_count} rebars!`, 'success');
            }

        } catch (error) {
            console.error('Detection error:', error);
            this.showToast(error.message || 'Detection failed', 'error');
        } finally {
            this.setLoading(false);
        }
    }

    // ========================================================================
    // Camera Functions
    // ========================================================================
    async startCamera() {
        try {
            this.elements.cameraStatus.classList.remove('hidden');
            this.elements.cameraStatus.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting to camera...';

            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };

            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            this.elements.cameraVideo.srcObject = this.cameraStream;

            this.elements.cameraVideo.onloadedmetadata = () => {
                this.elements.cameraStatus.classList.add('hidden');
                this.setupOverlayCanvas();
            };

        } catch (error) {
            console.error('Camera error:', error);
            this.elements.cameraStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Camera access denied';
            this.showToast('Could not access camera. Please check permissions.', 'error');
        }
    }

    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            this.cameraStream = null;
        }
        this.stopLiveDetection();
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        this.stopCamera();
        await this.startCamera();
    }

    setupOverlayCanvas() {
        const video = this.elements.cameraVideo;
        const canvas = this.elements.overlayCanvas;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
    }

    async captureFrame() {
        if (!this.cameraStream) return;

        const video = this.elements.cameraVideo;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        // Convert to blob and create file
        canvas.toBlob(async (blob) => {
            const file = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
            this.currentFile = file;

            // Switch to upload mode and show preview
            this.switchMode('upload');
            this.elements.previewImage.src = canvas.toDataURL('image/jpeg');
            this.elements.uploadArea.classList.add('hidden');
            this.elements.previewArea.classList.remove('hidden');
            this.elements.analyzeBtn.disabled = false;
            this.elements.previewInfo.textContent = 'Captured from camera';

            this.showToast('Frame captured!', 'success');
        }, 'image/jpeg', 0.9);
    }

    // ========================================================================
    // Live Detection
    // ========================================================================
    startLiveDetection() {
        if (!this.cameraStream) {
            this.showToast('Camera not available', 'error');
            return;
        }

        this.isDetecting = true;
        this.elements.startDetectionBtn.classList.add('hidden');
        this.elements.stopDetectionBtn.classList.remove('hidden');

        // Connect WebSocket
        this.connectWebSocket();
    }

    stopLiveDetection() {
        this.isDetecting = false;
        this.elements.startDetectionBtn.classList.remove('hidden');
        this.elements.stopDetectionBtn.classList.add('hidden');

        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Clear overlay
        const canvas = this.elements.overlayCanvas;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Reset stats
        this.elements.liveCount.textContent = '0';
        this.elements.liveAvgSize.textContent = '-';
        this.elements.liveFPS.textContent = '0';
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.ws = new WebSocket(`${protocol}//${window.location.host}/ws/live`);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.startFrameCapture();
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'detection') {
                this.handleLiveDetection(data.data);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showToast('Connection error. Using fallback mode.', 'error');
            this.startFallbackDetection();
        };

        this.ws.onclose = () => {
            console.log('WebSocket closed');
        };
    }

    startFrameCapture() {
        const video = this.elements.cameraVideo;
        const canvas = document.createElement('canvas');

        this.detectionInterval = setInterval(() => {
            if (!this.isDetecting || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            const imageData = canvas.toDataURL('image/jpeg', 0.7);

            this.ws.send(JSON.stringify({
                type: 'frame',
                image: imageData
            }));

            this.updateFPS();
        }, 200); // 5 FPS for detection
    }

    startFallbackDetection() {
        // Fallback to REST API if WebSocket fails
        const video = this.elements.cameraVideo;
        const canvas = document.createElement('canvas');

        this.detectionInterval = setInterval(async () => {
            if (!this.isDetecting) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0);

            const imageData = canvas.toDataURL('image/jpeg', 0.7);

            try {
                const response = await fetch('/api/detect/frame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: imageData })
                });

                const result = await response.json();
                if (result.success) {
                    this.handleLiveDetection(result.data);
                }
            } catch (error) {
                console.error('Fallback detection error:', error);
            }

            this.updateFPS();
        }, 500); // 2 FPS for fallback
    }

    handleLiveDetection(data) {
        // Update stats
        this.elements.liveCount.textContent = data.summary.total_count;

        if (data.summary.size_stats) {
            this.elements.liveAvgSize.textContent = data.summary.size_stats.avg_diameter_mm + 'mm';
        }

        // Draw overlay
        this.drawDetectionOverlay(data.detections);
    }

    drawDetectionOverlay(detections) {
        const canvas = this.elements.overlayCanvas;
        const ctx = canvas.getContext('2d');
        const video = this.elements.cameraVideo;

        // Match canvas to video dimensions
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw each detection
        detections.forEach(det => {
            const [cx, cy] = det.center;
            const radius = det.diameter_px ? det.diameter_px / 2 * 0.6 : 10;

            // Draw circle
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 50, 50, 0.6)';
            ctx.fill();
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 2;
            ctx.stroke();
        });

        // Draw count
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(10, 10, 200, 40);
        ctx.fillStyle = '#00ff00';
        ctx.font = 'bold 24px Inter';
        ctx.fillText(`Count: ${detections.length}`, 20, 40);
    }

    updateFPS() {
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFPSUpdate >= 1000) {
            this.elements.liveFPS.textContent = this.frameCount;
            this.frameCount = 0;
            this.lastFPSUpdate = now;
        }
    }

    // ========================================================================
    // Calibration
    // ========================================================================
    async calibrate() {
        const knownSize = parseFloat(this.elements.knownDiameter.value);

        if (isNaN(knownSize) || knownSize < 6 || knownSize > 40) {
            this.showToast('Please enter a valid diameter (6-40mm)', 'error');
            return;
        }

        // For calibration, we need to detect a single rebar and use its pixel size
        // This is a simplified version - a full implementation would let user select the rebar
        this.showToast(`Calibration set for ${knownSize}mm rebars`, 'success');

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'calibrate',
                known_diameter_mm: knownSize,
                measured_diameter_px: 50 // Default estimate
            }));
        }
    }

    // ========================================================================
    // Pricing Management
    // ========================================================================
    togglePricing() {
        const body = this.elements.pricingBody;
        const icon = this.elements.pricingExpandBtn.querySelector('i');
        body.classList.toggle('hidden');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    }

    buildPricingGrid() {
        const grid = this.elements.pricingGrid;
        grid.textContent = '';
        const sizes = [6, 8, 10, 12, 14, 16, 20, 25, 28, 32, 36, 40];

        sizes.forEach(size => {
            const item = document.createElement('div');
            item.className = 'pricing-item';

            const label = document.createElement('label');
            label.className = 'pricing-label';
            label.textContent = size + 'mm';

            const wrap = document.createElement('div');
            wrap.className = 'pricing-input-wrap';

            const currency = document.createElement('span');
            currency.className = 'pricing-currency';
            currency.textContent = '₹';

            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'pricing-input';
            input.dataset.size = size;
            input.value = this.pricing[size] || 0;
            input.min = '0';
            input.step = '1';

            wrap.appendChild(currency);
            wrap.appendChild(input);
            item.appendChild(label);
            item.appendChild(wrap);
            grid.appendChild(item);
        });
    }

    loadPricing() {
        const saved = localStorage.getItem('rebarPricing');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                this.pricing = { ...this.defaultPricing, ...parsed };
            } catch (e) {
                this.pricing = { ...this.defaultPricing };
            }
        }
        const savedLength = localStorage.getItem('rebarRodLength');
        if (savedLength) {
            this.elements.rodLength.value = savedLength;
        }
    }

    async savePricing() {
        const inputs = this.elements.pricingGrid.querySelectorAll('.pricing-input');
        const newPricing = {};

        inputs.forEach(input => {
            const size = parseInt(input.dataset.size);
            const price = parseFloat(input.value) || 0;
            newPricing[size] = price;
            this.pricing[size] = price;
        });

        const rodLength = parseFloat(this.elements.rodLength.value) || 12;

        // Save to localStorage
        localStorage.setItem('rebarPricing', JSON.stringify(this.pricing));
        localStorage.setItem('rebarRodLength', rodLength);

        // Sync with backend
        try {
            await fetch('/api/pricing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pricing: newPricing, rod_length_m: rodLength })
            });
            this.showToast('Pricing saved successfully!', 'success');
        } catch (error) {
            this.showToast('Pricing saved locally', 'success');
        }
    }

    resetPricing() {
        this.pricing = { ...this.defaultPricing };
        this.buildPricingGrid();
        this.elements.rodLength.value = '12';
        localStorage.removeItem('rebarPricing');
        localStorage.removeItem('rebarRodLength');
        this.showToast('Pricing reset to defaults', 'success');
    }

    displayCostEstimate(costData) {
        if (!costData) return;

        // Total cost
        const totalFormatted = '\u20B9' + costData.total_cost.toLocaleString('en-IN');
        this.elements.costTotal.textContent = totalFormatted;
        this.elements.totalCostStat.textContent = totalFormatted;

        // Cost breakdown
        const container = this.elements.costBreakdown;
        container.textContent = '';

        const breakdown = costData.cost_breakdown;
        const sorted = Object.entries(breakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

        sorted.forEach(([size, info]) => {
            const row = document.createElement('div');
            row.className = 'cost-row';

            const sizeEl = document.createElement('div');
            sizeEl.className = 'cost-row-size';
            sizeEl.textContent = size + 'mm';

            const detailEl = document.createElement('div');
            detailEl.className = 'cost-row-detail';
            detailEl.textContent = info.count + ' rods \u00D7 \u20B9' + info.unit_price;

            const subtotalEl = document.createElement('div');
            subtotalEl.className = 'cost-row-subtotal';
            subtotalEl.textContent = '\u20B9' + info.subtotal.toLocaleString('en-IN');

            row.appendChild(sizeEl);
            row.appendChild(detailEl);
            row.appendChild(subtotalEl);
            container.appendChild(row);
        });

        // Footer note
        this.elements.costNote.textContent = 'Rod length: ' + costData.rod_length_m + 'm | Prices in INR';
    }

    // ========================================================================
    // Results Display
    // ========================================================================
    displayResults(data) {
        // Count with animation
        this.animateNumber(this.elements.rebarCount, data.rebar_count);

        // Inference time
        this.elements.inferenceTime.textContent = `${data.inference_time}s`;

        // Size stats
        if (data.size_stats) {
            this.elements.avgDiameter.textContent = `${data.size_stats.avg_diameter_mm}mm`;
            this.elements.totalArea.textContent = data.size_stats.total_cross_section_area_mm2.toLocaleString();

            // Size distribution
            this.displaySizeDistribution(data.size_stats.size_distribution);
        } else {
            this.elements.avgDiameter.textContent = '-';
            this.elements.totalArea.textContent = '-';
        }

        // Cost estimate
        if (data.cost_estimate) {
            this.displayCostEstimate(data.cost_estimate);
        }

        // Result image
        this.resultImageUrl = data.result_image;
        this.elements.resultImage.src = data.result_image;

        // Detections table
        if (data.detections) {
            this.displayDetectionsTable(data.detections);
        }

        // Show results
        this.elements.resultsSection.classList.remove('hidden');

        setTimeout(() => {
            this.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }

    displaySizeDistribution(distribution) {
        const container = this.elements.sizeDistribution;
        container.innerHTML = '';

        // Sort by size
        const sorted = Object.entries(distribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

        sorted.forEach(([size, count]) => {
            const chip = document.createElement('div');
            chip.className = 'size-chip';
            chip.innerHTML = `
                <span class="size-chip-size">${size}mm</span>
                <span class="size-chip-count">${count}</span>
            `;
            container.appendChild(chip);
        });
    }

    displayDetectionsTable(detections) {
        const tbody = this.elements.detectionsBody;
        tbody.innerHTML = '';

        // Show max 100 rows
        const displayDetections = detections.slice(0, 100);

        displayDetections.forEach(det => {
            const row = document.createElement('tr');
            const cells = [
                det.id,
                det.diameter_mm || '-',
                det.radius_mm || '-',
                det.area_mm2 || '-',
                (det.standard_size || '-') + 'mm',
                '\u20B9' + (det.unit_price || 0),
                (det.confidence * 100).toFixed(1) + '%'
            ];
            cells.forEach(text => {
                const td = document.createElement('td');
                td.textContent = text;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });

        if (detections.length > 100) {
            const row = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 7;
            td.style.textAlign = 'center';
            td.style.color = 'var(--text-muted)';
            td.textContent = '... and ' + (detections.length - 100) + ' more';
            row.appendChild(td);
            tbody.appendChild(row);
        }
    }

    animateNumber(element, target) {
        const duration = 1000;
        const start = 0;
        const startTime = performance.now();

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (target - start) * easeOut);
            element.textContent = current;
            if (progress < 1) requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    setLoading(loading) {
        const btnText = this.elements.analyzeBtn.querySelector('.btn-text');
        const btnLoading = this.elements.analyzeBtn.querySelector('.btn-loading');

        if (loading) {
            btnText.classList.add('hidden');
            btnLoading.classList.remove('hidden');
            this.elements.analyzeBtn.disabled = true;
        } else {
            btnText.classList.remove('hidden');
            btnLoading.classList.add('hidden');
            this.elements.analyzeBtn.disabled = false;
        }
    }

    downloadResult() {
        if (!this.resultImageUrl) {
            this.showToast('No result image available', 'error');
            return;
        }

        const link = document.createElement('a');
        link.href = this.resultImageUrl;
        link.download = `rebar_detection_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        this.showToast('Image downloaded!', 'success');
    }

    showToast(message, type = 'success') {
        const toast = this.elements.toast;
        const icon = toast.querySelector('.toast-icon');
        const msg = toast.querySelector('.toast-message');

        icon.innerHTML = type === 'success'
            ? '<i class="fas fa-check-circle"></i>'
            : '<i class="fas fa-exclamation-circle"></i>';
        msg.textContent = message;

        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => toast.classList.add('hidden'), 4000);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.rebarApp = new RebarDetectorApp();
});
