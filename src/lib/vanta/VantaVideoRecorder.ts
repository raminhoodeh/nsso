/**
 * Vanta Video Recorder
 * 
 * Captures WebGL Vanta animation as a looping video for lightweight playback.
 * Falls back to pre-rendered video if capture fails.
 */

export interface VideoRecorderOptions {
    duration: number; // Recording duration in ms
    fps: number; // Target FPS
    mimeType?: string;
}

export class VantaVideoRecorder {
    private canvas: HTMLCanvasElement;
    private videoElement: HTMLVideoElement;
    private mediaRecorder?: MediaRecorder;
    private recordedChunks: Blob[] = [];
    private fallbackVideoUrl = '/vanta-fallback.webm';

    constructor(canvas: HTMLCanvasElement, videoElement: HTMLVideoElement) {
        this.canvas = canvas;
        this.videoElement = videoElement;
    }

    /**
     * Start recording the canvas
     */
    async record(options: VideoRecorderOptions): Promise<boolean> {
        const { duration, fps, mimeType = 'video/webm;codecs=vp9' } = options;

        try {
            // Check if MediaRecorder is supported
            if (!('MediaRecorder' in window)) {
                console.warn('[Vanta Recorder] MediaRecorder not supported, using fallback');
                return this.useFallbackVideo();
            }

            // Capture canvas stream
            const stream = this.canvas.captureStream(fps);

            // Check if codec is supported
            if (!MediaRecorder.isTypeSupported(mimeType)) {
                console.warn(`[Vanta Recorder] ${mimeType} not supported, trying webm`);
                this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
            } else {
                this.mediaRecorder = new MediaRecorder(stream, { mimeType });
            }

            // Setup event handlers
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.createVideoFromChunks();
            };

            this.mediaRecorder.onerror = (error) => {
                console.error('[Vanta Recorder] Recording error:', error);
                this.useFallbackVideo();
            };

            // Start recording
            this.recordedChunks = [];
            this.mediaRecorder.start(100); // Capture in 100ms chunks

            console.log(`[Vanta Recorder] Recording started for ${duration}ms at ${fps}fps`);

            // Stop after duration
            setTimeout(() => {
                if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                    this.mediaRecorder.stop();
                }
            }, duration);

            return true;

        } catch (error) {
            console.error('[Vanta Recorder] Failed to start recording:', error);
            return this.useFallbackVideo();
        }
    }

    /**
     * Create video element from recorded chunks
     */
    private createVideoFromChunks() {
        if (this.recordedChunks.length === 0) {
            console.error('[Vanta Recorder] No chunks recorded');
            this.useFallbackVideo();
            return;
        }

        try {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            this.videoElement.src = url;
            this.videoElement.loop = true;
            this.videoElement.muted = true;
            this.videoElement.playsInline = true;

            console.log(`[Vanta Recorder] Video created (${(blob.size / 1024).toFixed(1)}KB)`);

            // Preload the video
            this.videoElement.load();

        } catch (error) {
            console.error('[Vanta Recorder] Failed to create video:', error);
            this.useFallbackVideo();
        }
    }

    /**
     * Use pre-rendered fallback video
     */
    private useFallbackVideo(): boolean {
        console.log('[Vanta Recorder] Using fallback video');

        this.videoElement.src = this.fallbackVideoUrl;
        this.videoElement.loop = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.load();

        // Return false to indicate recording didn't work
        return false;
    }

    /**
     * Play the video
     */
    async play() {
        try {
            await this.videoElement.play();
            console.log('[Vanta Recorder] Video playing');
        } catch (error) {
            console.error('[Vanta Recorder] Failed to play video:', error);
        }
    }

    /**
     * Pause the video
     */
    pause() {
        this.videoElement.pause();
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        if (this.videoElement.src && this.videoElement.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.videoElement.src);
        }

        this.recordedChunks = [];
    }
}
