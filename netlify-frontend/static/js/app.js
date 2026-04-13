/**
 * Rebar Counter AI - Frontend Application
 * Features: Upload, Live Camera, Diameter Estimation, Cost Estimation, PDF/Excel Export
 */

// API Backend URL - change this when deploying frontend separately
const API_BASE = 'https://rebar-detection-ai.onrender.com';

class RebarDetectorApp {
    constructor() {
        this.elements = {
            uploadModeBtn: document.getElementById('uploadModeBtn'),
            cameraModeBtn: document.getElementById('cameraModeBtn'),
            uploadSection: document.getElementById('uploadSection'),
            cameraSection: document.getElementById('cameraSection'),
            uploadArea: document.getElementById('uploadArea'),
            fileInput: document.getElementById('fileInput'),
            previewArea: document.getElementById('previewArea'),
            previewImage: document.getElementById('previewImage'),
            previewInfo: document.getElementById('previewInfo'),
            clearBtn: document.getElementById('clearBtn'),
            analyzeBtn: document.getElementById('analyzeBtn'),
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
            knownDiameter: document.getElementById('knownDiameter'),
            calibrateBtn: document.getElementById('calibrateBtn'),
            // Pricing
            pricingToggle: document.getElementById('pricingToggle'),
            pricingBody: document.getElementById('pricingBody'),
            pricingExpandBtn: document.getElementById('pricingExpandBtn'),
            pricingTableBody: document.getElementById('pricingTableBody'),
            pricePerKg: document.getElementById('pricePerKg'),
            rodLength: document.getElementById('rodLength'),
            applyPricingBtn: document.getElementById('applyPricingBtn'),
            savePricingBtn: document.getElementById('savePricingBtn'),
            resetPricingBtn: document.getElementById('resetPricingBtn'),
            pqRate: document.getElementById('pqRate'),
            pqLength: document.getElementById('pqLength'),
            // Results
            resultsSection: document.getElementById('resultsSection'),
            rebarCount: document.getElementById('rebarCount'),
            avgDiameter: document.getElementById('avgDiameter'),
            totalWeight: document.getElementById('totalWeight'),
            totalCostStat: document.getElementById('totalCostStat'),
            inferenceTime: document.getElementById('inferenceTime'),
            sizeDistribution: document.getElementById('sizeDistribution'),
            costTotal: document.getElementById('costTotal'),
            costBreakdownBody: document.getElementById('costBreakdownBody'),
            costBreakdownFoot: document.getElementById('costBreakdownFoot'),
            costNote: document.getElementById('costNote'),
            resultImage: document.getElementById('resultImage'),
            resultImageWrapper: document.getElementById('resultImageWrapper'),
            editCanvas: document.getElementById('editCanvas'),
            editToggleBtn: document.getElementById('editToggleBtn'),
            editBtnLabel: document.getElementById('editBtnLabel'),
            editBanner: document.getElementById('editBanner'),
            excludedCount: document.getElementById('excludedCount'),
            downloadBtn: document.getElementById('downloadBtn'),
            exportPdfBtn: document.getElementById('exportPdfBtn'),
            exportExcelBtn: document.getElementById('exportExcelBtn'),
            detectionsBody: document.getElementById('detectionsBody'),
            toast: document.getElementById('toast')
        };

        this.currentFile = null;
        this.resultImageUrl = null;
        this.lastResultData = null;
        this.editMode = false;
        this.detections = [];
        this.excludedIds = new Set();
        this.imageSize = null;
        this.currentMode = 'upload';
        this.cameraStream = null;
        this.facingMode = 'environment';
        this.isDetecting = false;
        this.detectionInterval = null;
        this.ws = null;
        this.frameCount = 0;
        this.lastFPSUpdate = Date.now();

        // Pricing state
        this.pricePerKg = 65;
        this.rodLength = 12;
        this.standardSizes = [6, 8, 10, 12, 14, 16, 20, 25, 28, 32, 36, 40];
        this.pricingTable = {};
        this.overrides = {};

        this.init();
    }

    init() {
        this.bindEvents();
        this.checkHealth();
        this.loadSavedPricing();
        this.recalcPricingTable();
        this.renderPricingTable();
        this.updatePricingSummary();
    }

    bindEvents() {
        this.elements.uploadModeBtn.addEventListener('click', () => this.switchMode('upload'));
        this.elements.cameraModeBtn.addEventListener('click', () => this.switchMode('camera'));
        this.elements.uploadArea.addEventListener('click', () => this.elements.fileInput.click());
        this.elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) this.handleFile(e.target.files[0]);
        });
        this.elements.uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); this.elements.uploadArea.classList.add('drag-over'); });
        this.elements.uploadArea.addEventListener('dragleave', () => this.elements.uploadArea.classList.remove('drag-over'));
        this.elements.uploadArea.addEventListener('drop', (e) => {
            e.preventDefault(); this.elements.uploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) this.handleFile(e.dataTransfer.files[0]);
        });
        this.elements.clearBtn.addEventListener('click', () => this.clearSelection());
        this.elements.analyzeBtn.addEventListener('click', () => this.analyzeImage());
        this.elements.downloadBtn.addEventListener('click', () => this.downloadResult());
        this.elements.exportPdfBtn.addEventListener('click', () => this.exportPDF());
        this.elements.exportExcelBtn.addEventListener('click', () => this.exportExcel());
        this.elements.editToggleBtn.addEventListener('click', () => this.toggleEditMode());
        this.elements.editCanvas.addEventListener('click', (e) => this.handleCanvasClick(e));
        this.elements.switchCameraBtn.addEventListener('click', () => this.switchCamera());
        this.elements.captureBtn.addEventListener('click', () => this.captureFrame());
        this.elements.startDetectionBtn.addEventListener('click', () => this.startLiveDetection());
        this.elements.stopDetectionBtn.addEventListener('click', () => this.stopLiveDetection());
        this.elements.calibrateBtn.addEventListener('click', () => this.calibrate());
        this.elements.pricingToggle.addEventListener('click', () => this.togglePricing());
        this.elements.applyPricingBtn.addEventListener('click', () => this.applyPricing());
        this.elements.savePricingBtn.addEventListener('click', () => this.savePricing());
        this.elements.resetPricingBtn.addEventListener('click', () => this.resetPricing());
    }

    async checkHealth() {
        try {
            const r = await fetch(API_BASE + '/api/health');
            const d = await r.json();
            console.log('API Health:', d);
            const gpuEl = document.getElementById('gpuNameText');
            if (gpuEl && d.gpu_name) gpuEl.textContent = d.gpu_name;
            else if (gpuEl && d.device) gpuEl.textContent = d.device.toUpperCase() + ' Mode';
        } catch (e) { console.error('Health check failed:', e); }
    }

    // === MODE SWITCHING ===
    switchMode(mode) {
        this.currentMode = mode;
        this.elements.uploadModeBtn.classList.toggle('active', mode === 'upload');
        this.elements.cameraModeBtn.classList.toggle('active', mode === 'camera');
        this.elements.uploadSection.classList.toggle('hidden', mode !== 'upload');
        this.elements.cameraSection.classList.toggle('hidden', mode !== 'camera');
        if (mode === 'camera') this.startCamera(); else this.stopCamera();
    }

    // === FILE UPLOAD ===
    handleFile(file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) { this.showToast('Please upload a valid image', 'error'); return; }
        if (file.size > 50 * 1024 * 1024) { this.showToast('Max 50MB', 'error'); return; }
        this.currentFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            this.elements.previewImage.src = e.target.result;
            this.elements.uploadArea.classList.add('hidden');
            this.elements.previewArea.classList.remove('hidden');
            this.elements.analyzeBtn.disabled = false;
            this.elements.previewInfo.textContent = file.name + ' (' + (file.size / (1024 * 1024)).toFixed(2) + ' MB)';
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
        if (!this.currentFile) return;
        this.setLoading(true);
        try {
            const formData = new FormData();
            formData.append('file', this.currentFile);
            const response = await fetch(API_BASE + '/api/detect?estimate_size=true', { method: 'POST', body: formData });
            if (!response.ok) { const err = await response.json(); throw new Error(err.detail || 'Detection failed'); }
            const result = await response.json();
            if (result.success) {
                this.lastResultData = result.data;
                this.displayResults(result.data);
                this.showToast('Detected ' + result.data.rebar_count + ' rebars!', 'success');
            }
        } catch (error) {
            console.error('Detection error:', error);
            this.showToast(error.message || 'Detection failed', 'error');
        } finally { this.setLoading(false); }
    }

    // === CAMERA ===
    async startCamera() {
        try {
            this.elements.cameraStatus.classList.remove('hidden');
            this.cameraStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            this.elements.cameraVideo.srcObject = this.cameraStream;
            this.elements.cameraVideo.onloadedmetadata = () => {
                this.elements.cameraStatus.classList.add('hidden');
                this.setupOverlayCanvas();
            };
        } catch (error) {
            this.elements.cameraStatus.textContent = 'Camera access denied';
            this.showToast('Could not access camera', 'error');
        }
    }

    stopCamera() {
        if (this.cameraStream) { this.cameraStream.getTracks().forEach(t => t.stop()); this.cameraStream = null; }
        this.stopLiveDetection();
    }

    async switchCamera() { this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment'; this.stopCamera(); await this.startCamera(); }

    setupOverlayCanvas() {
        const v = this.elements.cameraVideo, c = this.elements.overlayCanvas;
        c.width = v.videoWidth; c.height = v.videoHeight;
    }

    async captureFrame() {
        if (!this.cameraStream) return;
        const video = this.elements.cameraVideo;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        canvas.getContext('2d').drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
            this.currentFile = new File([blob], 'capture.jpg', { type: 'image/jpeg' });
            this.switchMode('upload');
            this.elements.previewImage.src = canvas.toDataURL('image/jpeg');
            this.elements.uploadArea.classList.add('hidden');
            this.elements.previewArea.classList.remove('hidden');
            this.elements.analyzeBtn.disabled = false;
            this.elements.previewInfo.textContent = 'Captured from camera';
            this.showToast('Frame captured!', 'success');
        }, 'image/jpeg', 0.9);
    }

    // === LIVE DETECTION ===
    startLiveDetection() {
        if (!this.cameraStream) { this.showToast('Camera not available', 'error'); return; }
        this.isDetecting = true;
        this.elements.startDetectionBtn.classList.add('hidden');
        this.elements.stopDetectionBtn.classList.remove('hidden');
        this.connectWebSocket();
    }

    stopLiveDetection() {
        this.isDetecting = false;
        this.elements.startDetectionBtn.classList.remove('hidden');
        this.elements.stopDetectionBtn.classList.add('hidden');
        if (this.detectionInterval) { clearInterval(this.detectionInterval); this.detectionInterval = null; }
        if (this.ws) { this.ws.close(); this.ws = null; }
        const ctx = this.elements.overlayCanvas.getContext('2d');
        ctx.clearRect(0, 0, this.elements.overlayCanvas.width, this.elements.overlayCanvas.height);
        this.elements.liveCount.textContent = '0';
        this.elements.liveAvgSize.textContent = '-';
        this.elements.liveFPS.textContent = '0';
    }

    connectWebSocket() {
        const wsBase = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://');
        this.ws = new WebSocket(wsBase + '/ws/live');
        this.ws.onopen = () => this.startFrameCapture();
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'detection') this.handleLiveDetection(data.data);
        };
        this.ws.onerror = () => { this.showToast('Connection error, using fallback', 'error'); this.startFallbackDetection(); };
    }

    startFrameCapture() {
        const video = this.elements.cameraVideo, canvas = document.createElement('canvas');
        this.detectionInterval = setInterval(() => {
            if (!this.isDetecting || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            this.ws.send(JSON.stringify({ type: 'frame', image: canvas.toDataURL('image/jpeg', 0.7) }));
            this.updateFPS();
        }, 200);
    }

    startFallbackDetection() {
        const video = this.elements.cameraVideo, canvas = document.createElement('canvas');
        this.detectionInterval = setInterval(async () => {
            if (!this.isDetecting) return;
            canvas.width = video.videoWidth; canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            try {
                const r = await fetch(API_BASE + '/api/detect/frame', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: canvas.toDataURL('image/jpeg', 0.7) })
                });
                const result = await r.json();
                if (result.success) this.handleLiveDetection(result.data);
            } catch (e) { /* skip frame */ }
            this.updateFPS();
        }, 500);
    }

    handleLiveDetection(data) {
        this.elements.liveCount.textContent = data.summary.total_count;
        if (data.summary.size_stats) this.elements.liveAvgSize.textContent = data.summary.size_stats.avg_diameter_mm + 'mm';
        this.drawDetectionOverlay(data.detections);
    }

    drawDetectionOverlay(detections) {
        const canvas = this.elements.overlayCanvas, ctx = canvas.getContext('2d'), video = this.elements.cameraVideo;
        if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        detections.forEach(det => {
            const [cx, cy] = det.center;
            const radius = det.diameter_px ? det.diameter_px / 2 * 0.6 : 10;
            ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 50, 50, 0.6)'; ctx.fill();
            ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
        });
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(10, 10, 200, 40);
        ctx.fillStyle = '#00ff00'; ctx.font = 'bold 24px Inter';
        ctx.fillText('Count: ' + detections.length, 20, 40);
    }

    updateFPS() {
        this.frameCount++;
        const now = Date.now();
        if (now - this.lastFPSUpdate >= 1000) {
            this.elements.liveFPS.textContent = this.frameCount;
            this.frameCount = 0; this.lastFPSUpdate = now;
        }
    }

    async calibrate() {
        const knownSize = parseFloat(this.elements.knownDiameter.value);
        if (isNaN(knownSize) || knownSize < 6 || knownSize > 40) { this.showToast('Enter valid diameter (6-40mm)', 'error'); return; }
        this.showToast('Calibration set for ' + knownSize + 'mm', 'success');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'calibrate', known_diameter_mm: knownSize, measured_diameter_px: 50 }));
        }
    }

    // === PRICING ===
    togglePricing() {
        this.elements.pricingBody.classList.toggle('hidden');
        const icon = this.elements.pricingExpandBtn.querySelector('i');
        icon.classList.toggle('fa-chevron-down'); icon.classList.toggle('fa-chevron-up');
    }

    calcWeight(diameterMm, lengthM) {
        return Math.round((diameterMm * diameterMm) / 162 * lengthM * 100) / 100;
    }

    recalcPricingTable() {
        this.pricingTable = {};
        this.standardSizes.forEach(d => {
            const weight = this.calcWeight(d, this.rodLength);
            const calcPrice = Math.round(weight * this.pricePerKg * 100) / 100;
            const override = this.overrides[d];
            this.pricingTable[d] = {
                weight: weight,
                calcPrice: calcPrice,
                price: override !== undefined ? override : calcPrice,
                isOverride: override !== undefined
            };
        });
    }

    renderPricingTable() {
        const tbody = this.elements.pricingTableBody;
        tbody.textContent = '';
        this.standardSizes.forEach(d => {
            const info = this.pricingTable[d];
            const row = document.createElement('tr');

            const tdDia = document.createElement('td');
            tdDia.textContent = d + 'mm';
            tdDia.className = 'td-bold';

            const tdWeight = document.createElement('td');
            tdWeight.textContent = info.weight + ' kg';

            const tdPrice = document.createElement('td');
            tdPrice.className = info.isOverride ? 'td-override' : '';
            tdPrice.textContent = '\u20B9' + info.price.toLocaleString('en-IN');

            const tdCustom = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'number';
            input.className = 'pricing-override-input';
            input.placeholder = 'Auto';
            input.min = '0';
            input.step = '1';
            input.dataset.size = d;
            if (info.isOverride) input.value = info.price;
            tdCustom.appendChild(input);

            row.appendChild(tdDia);
            row.appendChild(tdWeight);
            row.appendChild(tdPrice);
            row.appendChild(tdCustom);
            tbody.appendChild(row);
        });
    }

    updatePricingSummary() {
        this.elements.pqRate.textContent = '\u20B9' + this.pricePerKg + '/kg';
        this.elements.pqLength.textContent = this.rodLength + 'm';
    }

    applyPricing() {
        this.pricePerKg = parseFloat(this.elements.pricePerKg.value) || 65;
        this.rodLength = parseFloat(this.elements.rodLength.value) || 12;
        this.collectOverrides();
        this.recalcPricingTable();
        this.renderPricingTable();
        this.updatePricingSummary();
        this.showToast('Pricing recalculated', 'success');
    }

    collectOverrides() {
        this.overrides = {};
        const inputs = this.elements.pricingTableBody.querySelectorAll('.pricing-override-input');
        inputs.forEach(input => {
            const size = parseInt(input.dataset.size);
            const val = input.value.trim();
            if (val !== '' && !isNaN(parseFloat(val))) {
                this.overrides[size] = parseFloat(val);
            }
        });
    }

    async savePricing() {
        this.applyPricing();
        localStorage.setItem('rebarPricePerKg', this.pricePerKg);
        localStorage.setItem('rebarRodLength', this.rodLength);
        localStorage.setItem('rebarOverrides', JSON.stringify(this.overrides));
        try {
            await fetch(API_BASE + '/api/pricing', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ price_per_kg: this.pricePerKg, rod_length_m: this.rodLength, overrides: this.overrides })
            });
            this.showToast('Pricing saved!', 'success');
        } catch (e) { this.showToast('Saved locally', 'success'); }
    }

    resetPricing() {
        this.pricePerKg = 65; this.rodLength = 12; this.overrides = {};
        this.elements.pricePerKg.value = '65';
        this.elements.rodLength.value = '12';
        localStorage.removeItem('rebarPricePerKg');
        localStorage.removeItem('rebarRodLength');
        localStorage.removeItem('rebarOverrides');
        this.recalcPricingTable();
        this.renderPricingTable();
        this.updatePricingSummary();
        this.showToast('Pricing reset to defaults', 'success');
    }

    loadSavedPricing() {
        const pkg = localStorage.getItem('rebarPricePerKg');
        const len = localStorage.getItem('rebarRodLength');
        const ovr = localStorage.getItem('rebarOverrides');
        if (pkg) { this.pricePerKg = parseFloat(pkg); this.elements.pricePerKg.value = pkg; }
        if (len) { this.rodLength = parseFloat(len); this.elements.rodLength.value = len; }
        if (ovr) { try { this.overrides = JSON.parse(ovr); } catch (e) { this.overrides = {}; } }
    }

    // === RESULTS DISPLAY ===
    displayResults(data) {
        this.animateNumber(this.elements.rebarCount, data.rebar_count);
        this.elements.inferenceTime.textContent = data.inference_time + 's';

        if (data.size_stats) {
            this.elements.avgDiameter.textContent = data.size_stats.avg_diameter_mm + 'mm';
            this.displaySizeDistribution(data.size_stats.size_distribution);
        }

        if (data.cost_estimate) {
            this.displayCostEstimate(data.cost_estimate);
        }

        this.resultImageUrl = data.result_image_base64 ? 'data:image/jpeg;base64,' + data.result_image_base64 : (API_BASE + data.result_image);
        this.elements.resultImage.src = this.resultImageUrl;

        // Store detections for edit mode
        this.detections = data.detections || [];
        this.excludedIds = new Set();
        this.imageSize = data.image_size || null;
        this.editMode = false;
        this.elements.editToggleBtn.classList.remove('active');
        this.elements.editBtnLabel.textContent = 'Edit Detections';
        this.elements.editBanner.classList.add('hidden');
        this.elements.editCanvas.classList.add('hidden');
        this.elements.excludedCount.classList.add('hidden');

        if (data.detections) this.displayDetectionsTable(data.detections);

        this.elements.resultsSection.classList.remove('hidden');
        setTimeout(() => this.elements.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }

    displayCostEstimate(cost) {
        const fmt = (n) => '\u20B9' + Math.round(n).toLocaleString('en-IN');

        this.elements.costTotal.textContent = fmt(cost.total_cost);
        this.elements.totalCostStat.textContent = fmt(cost.total_cost);
        this.elements.totalWeight.textContent = cost.total_weight_kg.toFixed(1) + ' kg';

        const tbody = this.elements.costBreakdownBody;
        tbody.textContent = '';
        const breakdown = cost.cost_breakdown;
        const sorted = Object.entries(breakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0]));

        let grandWeight = 0;
        sorted.forEach(([size, info]) => {
            grandWeight += info.weight_total_kg;
            const row = document.createElement('tr');
            const cells = [
                size + 'mm', info.count, info.weight_per_rod_kg + ' kg',
                info.weight_total_kg + ' kg', fmt(info.unit_price), fmt(info.subtotal)
            ];
            cells.forEach((text, i) => {
                const td = document.createElement('td');
                td.textContent = text;
                if (i === 5) td.className = 'td-bold';
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });

        const tfoot = this.elements.costBreakdownFoot;
        tfoot.textContent = '';
        const footRow = document.createElement('tr');
        footRow.className = 'cost-total-row';
        const footCells = ['TOTAL', '', '', grandWeight.toFixed(1) + ' kg', '', fmt(cost.total_cost)];
        footCells.forEach((text, i) => {
            const td = document.createElement('td');
            td.textContent = text;
            if (i === 0 || i === 5) td.className = 'td-bold';
            footRow.appendChild(td);
        });
        tfoot.appendChild(footRow);

        this.elements.costNote.textContent = 'Rate: \u20B9' + cost.price_per_kg + '/kg | Rod length: ' + cost.rod_length_m + 'm | Formula: D\u00B2/162 \u00D7 L';
    }

    displaySizeDistribution(distribution) {
        const container = this.elements.sizeDistribution;
        container.textContent = '';
        Object.entries(distribution).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([size, count]) => {
            const chip = document.createElement('div');
            chip.className = 'size-chip';
            const sizeSpan = document.createElement('span');
            sizeSpan.className = 'size-chip-size';
            sizeSpan.textContent = size + 'mm';
            const countSpan = document.createElement('span');
            countSpan.className = 'size-chip-count';
            countSpan.textContent = count;
            chip.appendChild(sizeSpan);
            chip.appendChild(countSpan);
            container.appendChild(chip);
        });
    }

    displayDetectionsTable(detections) {
        const tbody = this.elements.detectionsBody;
        tbody.textContent = '';
        detections.slice(0, 100).forEach(det => {
            const excluded = this.excludedIds.has(det.id);
            const row = document.createElement('tr');
            if (excluded) row.className = 'row-excluded';
            [det.id, det.diameter_mm || '-', det.radius_mm || '-', det.area_mm2 || '-',
             det.weight_kg || '-', (det.standard_size || '-') + 'mm',
             '\u20B9' + (det.unit_price || 0), (det.confidence * 100).toFixed(1) + '%'
            ].forEach(text => {
                const td = document.createElement('td');
                td.textContent = text;
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });
        if (detections.length > 100) {
            const row = document.createElement('tr');
            const td = document.createElement('td');
            td.colSpan = 8; td.style.textAlign = 'center'; td.style.color = 'var(--text-muted)';
            td.textContent = '... and ' + (detections.length - 100) + ' more';
            row.appendChild(td); tbody.appendChild(row);
        }
    }

    // === EDIT MODE (exclude false detections) ===
    toggleEditMode() {
        this.editMode = !this.editMode;
        this.elements.editToggleBtn.classList.toggle('active', this.editMode);
        this.elements.editBtnLabel.textContent = this.editMode ? 'Done Editing' : 'Edit Detections';
        this.elements.editBanner.classList.toggle('hidden', !this.editMode);
        this.elements.editCanvas.classList.toggle('hidden', !this.editMode);
        if (this.editMode) {
            this.setupEditCanvas();
            this.drawEditOverlay();
            // Scroll to the image so user can see where to click
            this.elements.resultImageWrapper.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    setupEditCanvas() {
        const img = this.elements.resultImage;
        const canvas = this.elements.editCanvas;
        canvas.width = img.clientWidth;
        canvas.height = img.clientHeight;
        canvas.style.width = img.clientWidth + 'px';
        canvas.style.height = img.clientHeight + 'px';
    }

    drawEditOverlay() {
        const canvas = this.elements.editCanvas;
        const ctx = canvas.getContext('2d');
        const img = this.elements.resultImage;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!this.detections.length || !this.imageSize) return;

        const scaleX = img.clientWidth / this.imageSize.width;
        const scaleY = img.clientHeight / this.imageSize.height;

        this.detections.forEach(det => {
            const cx = det.center[0] * scaleX;
            const cy = det.center[1] * scaleY;
            const bw = (det.box[2] - det.box[0]) * scaleX;
            const bh = (det.box[3] - det.box[1]) * scaleY;
            const r = Math.min(bw, bh) * 0.35;
            const excluded = this.excludedIds.has(det.id);

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            if (excluded) {
                ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
                ctx.fill();
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;
                ctx.stroke();
                // Draw X
                ctx.beginPath();
                ctx.moveTo(cx - r * 0.6, cy - r * 0.6);
                ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
                ctx.moveTo(cx + r * 0.6, cy - r * 0.6);
                ctx.lineTo(cx - r * 0.6, cy + r * 0.6);
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2.5;
                ctx.stroke();
            } else {
                ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
                ctx.fill();
                ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        });
    }

    handleCanvasClick(e) {
        if (!this.editMode || !this.detections.length || !this.imageSize) return;

        const canvas = this.elements.editCanvas;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const img = this.elements.resultImage;
        const scaleX = img.clientWidth / this.imageSize.width;
        const scaleY = img.clientHeight / this.imageSize.height;

        // Find closest detection to click
        let closestDet = null;
        let closestDist = Infinity;
        this.detections.forEach(det => {
            const cx = det.center[0] * scaleX;
            const cy = det.center[1] * scaleY;
            const bw = (det.box[2] - det.box[0]) * scaleX;
            const bh = (det.box[3] - det.box[1]) * scaleY;
            const r = Math.min(bw, bh) * 0.35;
            const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
            if (dist < r * 1.5 && dist < closestDist) {
                closestDist = dist;
                closestDet = det;
            }
        });

        if (!closestDet) return;

        // Toggle exclusion
        if (this.excludedIds.has(closestDet.id)) {
            this.excludedIds.delete(closestDet.id);
        } else {
            this.excludedIds.add(closestDet.id);
        }

        this.drawEditOverlay();
        this.recalcAfterEdit();
    }

    recalcAfterEdit() {
        const active = this.detections.filter(d => !this.excludedIds.has(d.id));
        const count = active.length;

        // Update count
        this.elements.rebarCount.textContent = count;

        // Update excluded count badge
        const numExcluded = this.excludedIds.size;
        this.elements.excludedCount.classList.toggle('hidden', numExcluded === 0);
        this.elements.excludedCount.textContent = numExcluded + ' removed';

        // Recalculate size distribution
        const sizeDist = {};
        active.forEach(d => {
            const s = d.standard_size || 0;
            sizeDist[s] = (sizeDist[s] || 0) + 1;
        });

        if (Object.keys(sizeDist).length > 0) {
            const sizes = Object.keys(sizeDist).map(Number);
            const avgDia = active.reduce((sum, d) => sum + (d.diameter_mm || 0), 0) / (count || 1);
            this.elements.avgDiameter.textContent = avgDia.toFixed(1) + 'mm';
            this.displaySizeDistribution(sizeDist);
        }

        // Recalculate cost from active detections
        const fmt = (n) => '\u20B9' + Math.round(n).toLocaleString('en-IN');
        const costBySize = {};
        let totalCost = 0;
        let totalWeight = 0;

        active.forEach(d => {
            const size = String(d.standard_size || 0);
            if (!costBySize[size]) {
                costBySize[size] = { count: 0, weight_per_rod_kg: d.weight_kg || 0, weight_total_kg: 0, unit_price: d.unit_price || 0, subtotal: 0 };
            }
            costBySize[size].count++;
            costBySize[size].weight_total_kg += d.weight_kg || 0;
            costBySize[size].subtotal += d.unit_price || 0;
            totalCost += d.unit_price || 0;
            totalWeight += d.weight_kg || 0;
        });

        this.elements.costTotal.textContent = fmt(totalCost);
        this.elements.totalCostStat.textContent = fmt(totalCost);
        this.elements.totalWeight.textContent = totalWeight.toFixed(1) + ' kg';

        // Rebuild cost breakdown table
        const tbody = this.elements.costBreakdownBody;
        tbody.textContent = '';
        Object.entries(costBySize).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([size, info]) => {
            const row = document.createElement('tr');
            [size + 'mm', info.count, info.weight_per_rod_kg + ' kg',
             info.weight_total_kg.toFixed(2) + ' kg', fmt(info.unit_price), fmt(info.subtotal)
            ].forEach((text, i) => {
                const td = document.createElement('td');
                td.textContent = text;
                if (i === 5) td.className = 'td-bold';
                row.appendChild(td);
            });
            tbody.appendChild(row);
        });

        const tfoot = this.elements.costBreakdownFoot;
        tfoot.textContent = '';
        const footRow = document.createElement('tr');
        footRow.className = 'cost-total-row';
        ['TOTAL', '', '', totalWeight.toFixed(1) + ' kg', '', fmt(totalCost)].forEach((text, i) => {
            const td = document.createElement('td');
            td.textContent = text;
            if (i === 0 || i === 5) td.className = 'td-bold';
            footRow.appendChild(td);
        });
        tfoot.appendChild(footRow);

        // Update detections table with exclusion strikethrough
        this.displayDetectionsTable(this.detections);

        // Update lastResultData for exports
        if (this.lastResultData) {
            this.lastResultData._activeCount = count;
            this.lastResultData._excludedIds = [...this.excludedIds];
        }
    }

    animateNumber(element, target) {
        const duration = 800, startTime = performance.now();
        const animate = (t) => {
            const progress = Math.min((t - startTime) / duration, 1);
            element.textContent = Math.round(target * (1 - Math.pow(1 - progress, 3)));
            if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    setLoading(loading) {
        const btnText = this.elements.analyzeBtn.querySelector('.btn-text');
        const btnLoading = this.elements.analyzeBtn.querySelector('.btn-loading');
        btnText.classList.toggle('hidden', loading);
        btnLoading.classList.toggle('hidden', !loading);
        this.elements.analyzeBtn.disabled = loading;
    }

    downloadResult() {
        if (!this.resultImageUrl) { this.showToast('No result image', 'error'); return; }
        const link = document.createElement('a');
        link.href = this.resultImageUrl;
        link.download = 'rebar_detection_' + Date.now() + '.jpg';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        this.showToast('Image downloaded!', 'success');
    }

    // === PDF EXPORT ===
    exportPDF() {
        const data = this.lastResultData;
        if (!data) { this.showToast('No results to export', 'error'); return; }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 20;

        // Title
        doc.setFontSize(20);
        doc.setTextColor(40, 40, 40);
        doc.text('Rebar Detection Report', pageWidth / 2, y, { align: 'center' });
        y += 10;

        doc.setFontSize(10);
        doc.setTextColor(120, 120, 120);
        doc.text('Generated: ' + new Date().toLocaleString('en-IN'), pageWidth / 2, y, { align: 'center' });
        y += 12;

        // Summary box
        doc.setDrawColor(99, 102, 241);
        doc.setLineWidth(0.5);
        doc.roundedRect(14, y, pageWidth - 28, 36, 3, 3);
        y += 8;

        doc.setFontSize(11);
        doc.setTextColor(40, 40, 40);
        const summary = [
            'Total Rebars: ' + data.rebar_count,
            'Avg Diameter: ' + (data.size_stats ? data.size_stats.avg_diameter_mm + 'mm' : '-'),
            'Total Weight: ' + (data.cost_estimate ? data.cost_estimate.total_weight_kg + ' kg' : '-'),
            'Estimated Cost: Rs.' + (data.cost_estimate ? Math.round(data.cost_estimate.total_cost).toLocaleString('en-IN') : '0'),
            'Processing Time: ' + data.inference_time + 's'
        ];
        doc.text(summary[0], 20, y); doc.text(summary[1], 100, y);
        y += 8;
        doc.text(summary[2], 20, y); doc.text(summary[3], 100, y);
        y += 8;
        doc.text(summary[4], 20, y);
        y += 16;

        // Cost Breakdown Table
        if (data.cost_estimate && data.cost_estimate.cost_breakdown) {
            doc.setFontSize(14);
            doc.setTextColor(40, 40, 40);
            doc.text('Cost Breakdown', 14, y);
            y += 4;

            const costRows = [];
            const breakdown = data.cost_estimate.cost_breakdown;
            let totalWt = 0, totalCost = 0;
            Object.entries(breakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([size, info]) => {
                totalWt += info.weight_total_kg;
                totalCost += info.subtotal;
                costRows.push([
                    size + 'mm', String(info.count), info.weight_per_rod_kg + ' kg',
                    info.weight_total_kg + ' kg', 'Rs.' + Math.round(info.unit_price).toLocaleString('en-IN'),
                    'Rs.' + Math.round(info.subtotal).toLocaleString('en-IN')
                ]);
            });
            costRows.push([
                { content: 'TOTAL', styles: { fontStyle: 'bold' } }, '', '',
                { content: totalWt.toFixed(1) + ' kg', styles: { fontStyle: 'bold' } }, '',
                { content: 'Rs.' + Math.round(totalCost).toLocaleString('en-IN'), styles: { fontStyle: 'bold' } }
            ]);

            doc.autoTable({
                startY: y,
                head: [['Size', 'Qty', 'Wt/Rod', 'Total Wt', 'Rate/Rod', 'Subtotal']],
                body: costRows,
                theme: 'grid',
                headStyles: { fillColor: [99, 102, 241], textColor: 255 },
                styles: { fontSize: 9 },
                margin: { left: 14, right: 14 }
            });
            y = doc.lastAutoTable.finalY + 10;
        }

        // Pricing info
        if (data.cost_estimate) {
            doc.setFontSize(9);
            doc.setTextColor(120, 120, 120);
            doc.text('Rate: Rs.' + data.cost_estimate.price_per_kg + '/kg | Rod Length: ' + data.cost_estimate.rod_length_m + 'm | Formula: D\u00B2/162 x L', 14, y);
            y += 10;
        }

        // Detections Table
        if (data.detections && data.detections.length > 0) {
            if (y > 240) { doc.addPage(); y = 20; }
            doc.setFontSize(14);
            doc.setTextColor(40, 40, 40);
            doc.text('Detailed Measurements', 14, y);
            y += 4;

            const detRows = data.detections.slice(0, 200).map(d => [
                String(d.id), String(d.diameter_mm), String(d.radius_mm),
                String(d.area_mm2), String(d.weight_kg || '-'),
                (d.standard_size || '-') + 'mm', 'Rs.' + (d.unit_price || 0),
                (d.confidence * 100).toFixed(1) + '%'
            ]);

            doc.autoTable({
                startY: y,
                head: [['#', 'Dia(mm)', 'Radius', 'Area(mm\u00B2)', 'Wt(kg)', 'Std Size', 'Cost', 'Conf.']],
                body: detRows,
                theme: 'striped',
                headStyles: { fillColor: [99, 102, 241], textColor: 255 },
                styles: { fontSize: 8 },
                margin: { left: 14, right: 14 }
            });
        }

        doc.save('rebar_report_' + Date.now() + '.pdf');
        this.showToast('PDF report downloaded!', 'success');
    }

    // === EXCEL EXPORT ===
    exportExcel() {
        const data = this.lastResultData;
        if (!data) { this.showToast('No results to export', 'error'); return; }

        const wb = XLSX.utils.book_new();

        // Summary sheet
        const summaryData = [
            ['Rebar Detection Report'],
            ['Generated', new Date().toLocaleString('en-IN')],
            [],
            ['Summary'],
            ['Total Rebars', data.rebar_count],
            ['Avg Diameter (mm)', data.size_stats ? data.size_stats.avg_diameter_mm : '-'],
            ['Total Weight (kg)', data.cost_estimate ? data.cost_estimate.total_weight_kg : '-'],
            ['Estimated Cost (INR)', data.cost_estimate ? data.cost_estimate.total_cost : 0],
            ['Rate (INR/kg)', data.cost_estimate ? data.cost_estimate.price_per_kg : '-'],
            ['Rod Length (m)', data.cost_estimate ? data.cost_estimate.rod_length_m : '-'],
            ['Processing Time (s)', data.inference_time]
        ];
        const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
        ws1['!cols'] = [{ wch: 20 }, { wch: 25 }];
        XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

        // Cost Breakdown sheet
        if (data.cost_estimate && data.cost_estimate.cost_breakdown) {
            const costData = [['Size (mm)', 'Quantity', 'Weight/Rod (kg)', 'Total Weight (kg)', 'Rate/Rod (INR)', 'Subtotal (INR)']];
            let totalWt = 0, totalCost = 0;
            Object.entries(data.cost_estimate.cost_breakdown).sort((a, b) => parseInt(a[0]) - parseInt(b[0])).forEach(([size, info]) => {
                totalWt += info.weight_total_kg;
                totalCost += info.subtotal;
                costData.push([parseInt(size), info.count, info.weight_per_rod_kg, info.weight_total_kg, info.unit_price, info.subtotal]);
            });
            costData.push(['TOTAL', '', '', totalWt, '', totalCost]);
            const ws2 = XLSX.utils.aoa_to_sheet(costData);
            ws2['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
            XLSX.utils.book_append_sheet(wb, ws2, 'Cost Breakdown');
        }

        // Detections sheet
        if (data.detections && data.detections.length > 0) {
            const detData = [['#', 'Diameter (mm)', 'Radius (mm)', 'Area (mm²)', 'Weight (kg)', 'Standard Size (mm)', 'Cost (INR)', 'Confidence (%)']];
            data.detections.forEach(d => {
                detData.push([d.id, d.diameter_mm, d.radius_mm, d.area_mm2, d.weight_kg || '', d.standard_size || '', d.unit_price || 0, Math.round(d.confidence * 100 * 10) / 10]);
            });
            const ws3 = XLSX.utils.aoa_to_sheet(detData);
            ws3['!cols'] = [{ wch: 5 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 14 }];
            XLSX.utils.book_append_sheet(wb, ws3, 'Detailed Measurements');
        }

        XLSX.writeFile(wb, 'rebar_report_' + Date.now() + '.xlsx');
        this.showToast('Excel report downloaded!', 'success');
    }

    // === TOAST ===
    showToast(message, type) {
        const toast = this.elements.toast;
        const icon = toast.querySelector('.toast-icon');
        const msg = toast.querySelector('.toast-message');
        icon.textContent = '';
        const i = document.createElement('i');
        i.className = type === 'success' ? 'fas fa-check-circle' : 'fas fa-exclamation-circle';
        icon.appendChild(i);
        msg.textContent = message;
        toast.className = 'toast ' + (type || 'success');
        toast.classList.remove('hidden');
        setTimeout(() => toast.classList.add('hidden'), 4000);
    }
}

document.addEventListener('DOMContentLoaded', () => { window.rebarApp = new RebarDetectorApp(); });
