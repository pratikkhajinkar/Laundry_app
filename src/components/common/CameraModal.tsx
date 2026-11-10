import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, Upload, AlertCircle } from 'lucide-react';
import { compressImage } from '../../utils/imageCompressor.ts';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (base64Image: string) => void;
  title?: string;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
  title = 'Take Photo'
}) => {
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);

  const stopStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startCamera = async (mode: 'environment' | 'user', isCancelled: () => boolean) => {
    stopStream();
    setCameraError(null);
    setIsStarting(true);

    try {
      const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      if (!navigator?.mediaDevices?.getUserMedia) {
        if (!window.isSecureContext && !isLocalhost) {
          throw new Error('Live browser camera preview requires HTTPS. Tap "Open Phone Camera" below to capture directly.');
        }
        throw new Error('Live camera preview is not supported in this browser. Tap "Open Phone Camera" or choose from gallery.');
      }

      // Try environment or user camera
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        // Fallback to any available video stream if ideal facingMode failed
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      // If modal closed or effect restarted while awaiting permission, release camera immediately
      if (isCancelled()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
      }
    } catch (err: any) {
      if (isCancelled()) return;
      const msg = err?.message || 'Unable to access camera.';
      if (err?.name === 'NotAllowedError' || msg.includes('Permission')) {
        setCameraError('Camera permission denied. Allow camera access or tap "Open Phone Camera" / choose from gallery.');
      } else {
        setCameraError(msg);
      }
    } finally {
      if (!isCancelled()) {
        setIsStarting(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    if (isOpen) {
      startCamera(facingMode, () => cancelled);
    } else {
      stopStream();
    }
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, facingMode]);

  const handleFlipCamera = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 200);

    const maxDim = 1280;
    let targetW = video.videoWidth;
    let targetH = video.videoHeight;
    if (targetW > maxDim || targetH > maxDim) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, targetW);
    canvas.height = Math.max(1, targetH);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.82);

    stopStream();
    onCapture(rawDataUrl);
    onClose();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file, 1280, 1280, 0.8);
    if (compressed) {
      stopStream();
      onCapture(compressed);
      onClose();
    }
    if (e.target) e.target.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 text-white rounded-3xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-800/90 border-b border-slate-700/80 z-10">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-sky-400" />
            <span className="font-bold text-sm tracking-wide">{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-700/60 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Camera Viewfinder Area */}
        <div className="relative flex-1 bg-black min-h-[300px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="p-6 text-center max-w-sm space-y-4">
              <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">Camera Unavailable</p>
                <p className="text-xs text-slate-400 mt-1">{cameraError}</p>
              </div>
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => nativeCameraInputRef.current?.click()}
                  className="w-full py-3 px-4 bg-sky-500 hover:bg-sky-600 active:scale-98 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <Camera className="w-4 h-4" />
                  <span>Open Phone Camera / Take Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-98 text-slate-100 border border-slate-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
                >
                  <Upload className="w-4 h-4 text-sky-400" />
                  <span>Upload Photo from Gallery / Device</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover transition-opacity duration-300 ${
                  isStarting ? 'opacity-0' : 'opacity-100'
                }`}
              />

              {/* Viewfinder Target Framing Guide */}
              <div className="pointer-events-none absolute inset-8 sm:inset-12 border-2 border-dashed border-white/40 rounded-2xl flex flex-col justify-between p-3">
                <div className="flex justify-between">
                  <span className="w-3 h-3 border-t-2 border-l-2 border-sky-400 -mt-1 -ml-1"></span>
                  <span className="w-3 h-3 border-t-2 border-r-2 border-sky-400 -mt-1 -mr-1"></span>
                </div>
                <div className="flex justify-between">
                  <span className="w-3 h-3 border-b-2 border-l-2 border-sky-400 -mb-1 -ml-1"></span>
                  <span className="w-3 h-3 border-b-2 border-r-2 border-sky-400 -mb-1 -mr-1"></span>
                </div>
              </div>

              {/* Camera Shutter Flash */}
              {isFlashing && (
                <div className="absolute inset-0 bg-white pointer-events-none z-30 animate-out fade-out duration-200" />
              )}

              {/* Loading spinner */}
              {isStarting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-950/70 z-20">
                  <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
                  <span className="text-xs text-slate-300 font-medium">Starting camera...</span>
                </div>
              )}
            </>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            ref={nativeCameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Bottom Controls Bar */}
        <div className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between gap-4">
          {/* Gallery / File Picker */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-xl hover:bg-slate-800"
            title="Upload from Device"
          >
            <Upload className="w-5 h-5 text-sky-400" />
            <span className="text-[10px] font-semibold">Gallery</span>
          </button>

          {/* Shutter Button */}
          {!cameraError && (
            <button
              type="button"
              disabled={isStarting}
              onClick={handleCapturePhoto}
              className="w-16 h-16 rounded-full border-4 border-white/80 bg-sky-500 hover:bg-sky-400 active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-sky-500/30 group"
              title="Click Photo"
            >
              <div className="w-12 h-12 rounded-full bg-white group-hover:scale-95 transition-transform flex items-center justify-center">
                <Camera className="w-5 h-5 text-sky-600" />
              </div>
            </button>
          )}

          {/* Flip Camera */}
          {!cameraError ? (
            <button
              type="button"
              onClick={handleFlipCamera}
              className="flex flex-col items-center gap-1 text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-xl hover:bg-slate-800"
              title="Switch Front/Rear Camera"
            >
              <RefreshCw className="w-5 h-5 text-sky-400" />
              <span className="text-[10px] font-semibold">Flip</span>
            </button>
          ) : (
            <div className="w-12"></div>
          )}
        </div>
      </div>
    </div>
  );
};

