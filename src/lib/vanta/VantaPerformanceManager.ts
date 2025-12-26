/**
 * Vanta Performance Manager
 * 
 * Manages adaptive performance optimization for Vanta.js WebGL background:
 * - Device tier detection (high/mid/low)
 * - Real-time FPS monitoring
 * - Phase transitions (WebGL → Video → Static)
 * - Rollback mechanism
 */

export type DeviceTier = 'high' | 'mid' | 'low';
export type BackgroundPhase = 'webgl' | 'video' | 'static';

interface PerformanceConfig {
    webglDuration: number; // How long to show WebGL (ms)
    targetFPS: number;
    minFPS: number;
    idleTimeout: number; // Time before considering user idle (ms)
}

const TIER_CONFIGS: Record<DeviceTier, PerformanceConfig> = {
    high: {
        webglDuration: 5000,
        targetFPS: 55,
        minFPS: 40,
        idleTimeout: 30000
    },
    mid: {
        webglDuration: 3000,
        targetFPS: 40,
        minFPS: 30,
        idleTimeout: 60000 // Longer timeout, less likely to return to WebGL
    },
    low: {
        webglDuration: 0, // Skip WebGL entirely
        targetFPS: 30,
        minFPS: 20,
        idleTimeout: Infinity // Never return to WebGL
    }
};

export class VantaPerformanceManager {
    private vantaEffect: any;
    private currentPhase: BackgroundPhase = 'webgl';
    private deviceTier: DeviceTier;
    private config: PerformanceConfig;
    private fps: number = 60;
    private userActive: boolean = false;
    private idleTimer?: NodeJS.Timeout;
    private fpsMonitorId?: number;
    private onPhaseChange?: (phase: BackgroundPhase) => void;

    constructor(vantaEffect: any, onPhaseChange?: (phase: BackgroundPhase) => void) {
        this.vantaEffect = vantaEffect;
        this.deviceTier = this.detectDeviceTier();
        this.config = TIER_CONFIGS[this.deviceTier];
        this.onPhaseChange = onPhaseChange;

        console.log(`[Vanta] Device tier: ${this.deviceTier}, Config:`, this.config);

        // Check for rollback mode
        if (this.isRollbackMode()) {
            console.warn('⚠️ Vanta optimization disabled (rollback mode)');
            return;
        }

        this.initialize();
    }

    private initialize() {
        // Start FPS monitoring
        this.startFPSMonitoring();

        // Track user activity
        this.trackUserActivity();

        // Schedule phase transitions
        this.schedulePhaseTransitions();
    }

    /**
     * Detect device tier based on hardware and performance
     */
    private detectDeviceTier(): DeviceTier {
        // Factor 1: CPU cores
        const cores = navigator.hardwareConcurrency || 2;

        // Factor 2: Device memory (if available)
        const memory = (navigator as any).deviceMemory || 4;

        // Factor 3: Mobile detection
        const isMobile = /iPhone|iPad|Android/i.test(navigator.userAgent);

        // Factor 4: Connection speed (estimate device capability)
        const connection = (navigator as any).connection;
        const isSlowConnection = connection?.effectiveType === '3g' || connection?.effectiveType === '2g';

        if (isMobile || isSlowConnection) {
            return 'low';
        }

        if (cores >= 8 && memory >= 8) {
            return 'high';
        }

        if (cores >= 4 && memory >= 4) {
            return 'mid';
        }

        return 'low';
    }

    /**
     * Monitor FPS in real-time
     */
    private startFPSMonitoring() {
        let lastTime = performance.now();
        let frames = 0;

        const measureFPS = () => {
            frames++;
            const now = performance.now();
            const delta = now - lastTime;

            if (delta >= 1000) {
                this.fps = Math.round((frames * 1000) / delta);
                frames = 0;
                lastTime = now;

                // Auto-degrade if FPS drops too low
                if (this.fps < this.config.minFPS && this.currentPhase === 'webgl') {
                    console.warn(`[Vanta] Low FPS detected (${this.fps}), degrading...`);
                    this.degradeQuality();
                }
            }

            this.fpsMonitorId = requestAnimationFrame(measureFPS);
        };

        measureFPS();
    }

    /**
     * Track user activity state
     */
    private trackUserActivity() {
        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];

        const handleActivity = () => {
            this.userActive = true;

            // Clear existing timer
            if (this.idleTimer) {
                clearTimeout(this.idleTimer);
            }

            // Set idle timeout
            this.idleTimer = setTimeout(() => {
                this.userActive = false;
                this.handleIdle();
            }, this.config.idleTimeout);
        };

        events.forEach(event => {
            document.addEventListener(event, handleActivity, { passive: true });
        });
    }

    /**
     * Schedule phase transitions based on device tier
     */
    private schedulePhaseTransitions() {
        if (this.config.webglDuration === 0) {
            // Low-end: Skip WebGL immediately
            setTimeout(() => this.switchToVideo(), 100);
        } else {
            // High/Mid: Show WebGL, then switch to video
            setTimeout(() => {
                if (this.userActive || this.currentPhase !== 'webgl') {
                    this.switchToVideo();
                }
            }, this.config.webglDuration);
        }
    }

    /**
     * Handle user becoming idle
     */
    private handleIdle() {
        // Only high-tier devices return to WebGL on idle
        if (this.deviceTier === 'high' && this.currentPhase === 'video') {
            console.log('[Vanta] User idle, returning to WebGL');
            this.switchBackToWebGL();
        }
    }

    /**
     * Degrade WebGL quality if performance suffers
     */
    private degradeQuality() {
        if (!this.vantaEffect || !this.vantaEffect.setOptions) return;

        const currentOptions = this.vantaEffect.options || {};

        this.vantaEffect.setOptions({
            mouseControls: false,
            touchControls: false,
            gyroControls: false,
            points: Math.max(3, Math.floor((currentOptions.points || 10) * 0.7)),
            maxDistance: (currentOptions.maxDistance || 20) * 0.8,
            spacing: (currentOptions.spacing || 15) * 1.2
        });

        console.log('[Vanta] Quality degraded');
    }

    /**
     * Switch from WebGL to video
     */
    public switchToVideo() {
        if (this.currentPhase === 'video') return;

        console.log('[Vanta] Switching to video phase');
        this.currentPhase = 'video';
        this.onPhaseChange?.('video');

        // Destroy Vanta to free GPU
        if (this.vantaEffect && this.vantaEffect.destroy) {
            this.vantaEffect.destroy();
        }
    }

    /**
     * Switch from video to static gradient (ultra low-end)
     */
    public switchToStatic() {
        if (this.currentPhase === 'static') return;

        console.log('[Vanta] Switching to static phase');
        this.currentPhase = 'static';
        this.onPhaseChange?.('static');
    }

    /**
     * Return to WebGL from video (high-tier only, on idle)
     */
    public switchBackToWebGL() {
        if (this.currentPhase === 'webgl' || this.deviceTier !== 'high') return;

        console.log('[Vanta] Returning to WebGL');
        this.currentPhase = 'webgl';
        this.onPhaseChange?.('webgl');
    }

    /**
     * Check if rollback mode is enabled
     */
    private isRollbackMode(): boolean {
        if (typeof window === 'undefined') return false;

        // Check URL parameter
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('vanta_rollback') === 'true') {
            return true;
        }

        // Check localStorage
        try {
            return localStorage.getItem('nsso_vanta_rollback') === 'true';
        } catch {
            return false;
        }
    }

    /**
     * Enable rollback mode (revert to original Vanta)
     */
    public static enableRollback() {
        if (typeof window === 'undefined') return;

        try {
            localStorage.setItem('nsso_vanta_rollback', 'true');
            console.log('✅ Vanta rollback enabled. Refresh to apply.');
        } catch (err) {
            console.error('Failed to enable rollback:', err);
        }
    }

    /**
     * Disable rollback mode
     */
    public static disableRollback() {
        if (typeof window === 'undefined') return;

        try {
            localStorage.removeItem('nsso_vanta_rollback');
            console.log('✅ Vanta rollback disabled. Refresh to apply.');
        } catch (err) {
            console.error('Failed to disable rollback:', err);
        }
    }

    /**
     * Get current performance stats
     */
    public getStats() {
        return {
            deviceTier: this.deviceTier,
            currentPhase: this.currentPhase,
            fps: this.fps,
            userActive: this.userActive,
            config: this.config
        };
    }

    /**
     * Cleanup
     */
    public destroy() {
        if (this.fpsMonitorId) {
            cancelAnimationFrame(this.fpsMonitorId);
        }
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
    }
}

// Expose global rollback functions
if (typeof window !== 'undefined') {
    (window as any).rollbackVanta = VantaPerformanceManager.enableRollback;
    (window as any).clearVantaRollback = VantaPerformanceManager.disableRollback;
}
