import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Camera, 
  Flashlight, 
  SwitchCamera, 
  AlertCircle, 
  CheckCircle2, 
  Barcode, 
  Volume2,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import { Product } from '../types';
import { sounds } from '../utils/audio';

export interface CameraBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onScanSuccess: (product: Product, scannedCode: string) => void;
  onScanError?: (scannedCode: string) => void;
}

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  products,
  onScanSuccess,
  onScanError
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentScanInfo, setRecentScanInfo] = useState<{ success: boolean; msg: string } | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [torchOn, setTorchOn] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const barcodeDetectorRef = useRef<any>(null);

  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      return;
    }

    startCameraStream();

    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const stopCamera = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setIsScanning(false);
    setTorchOn(false);
  };

  const startCameraStream = async () => {
    stopCamera();
    setErrorMessage(null);

    try {
      // 1. Request WebRTC Camera Access
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsScanning(true);

        // 2. Initialize BarcodeDetector if available
        if ('BarcodeDetector' in window) {
          try {
            barcodeDetectorRef.current = new (window as any).BarcodeDetector({
              formats: [
                'ean_13', 
                'ean_8', 
                'upc_a', 
                'upc_e', 
                'code_128', 
                'code_39', 
                'qr_code'
              ]
            });
          } catch (e) {
            console.warn('Custom formats initialization failed, fallback to default BarcodeDetector');
            barcodeDetectorRef.current = new (window as any).BarcodeDetector();
          }
        } else {
          console.log('BarcodeDetector API is not supported in this browser. Please use a modern browser like Chrome/Chromium, or use the manual input box.');
        }

        // 3. Start scanning loop
        scanLoop();
      }
    } catch (err: any) {
      console.error('Camera stream error:', err);
      const isAndroid = /Android/i.test(navigator.userAgent);
      setErrorMessage(
        'Gagal mengakses kamera: ' + 
        (err?.message || 'Izin kamera ditolak atau perangkat kamera tidak ditemukan.') +
        (isAndroid 
          ? '\n\n💡 Untuk Android App: Pastikan izin kamera telah diaktifkan di Pengaturan HP -> Aplikasi -> KasirPro -> Izin -> Kamera -> Izinkan.' 
          : '')
      );
      setIsScanning(false);
    }
  };

  const scanLoop = async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) {
      animationFrameRef.current = requestAnimationFrame(scanLoop);
      return;
    }

    try {
      if (barcodeDetectorRef.current) {
        const barcodes = await barcodeDetectorRef.current.detect(videoRef.current);
        if (barcodes && barcodes.length > 0) {
          const rawCode = barcodes[0].rawValue;
          if (rawCode) {
            handleDecodedBarcode(rawCode);
          }
        }
      }
    } catch (err) {
      // Frame detect error (ignore)
    }

    animationFrameRef.current = requestAnimationFrame(scanLoop);
  };

  const handleDecodedBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Prevent duplicate triggers within 1.5 seconds for same code
    const now = Date.now();
    if (now - lastScannedTimeRef.current < 1500) {
      return;
    }
    lastScannedTimeRef.current = now;

    // Search product in inventory
    const matched = products.find(p => 
      (p.barcode && p.barcode.trim() === trimmed) ||
      (p.sku && p.sku.trim().toLowerCase() === trimmed.toLowerCase()) ||
      String(p.id) === trimmed
    );

    if (matched) {
      sounds.playScanBeep();
      setRecentScanInfo({
        success: true,
        msg: `✓ ${matched.name} ditambahkan!`
      });
      onScanSuccess(matched, trimmed);
    } else {
      sounds.playErrorBeep();
      setRecentScanInfo({
        success: false,
        msg: `⚠️ Barcode: "${trimmed}" tidak ditemukan!`
      });
      if (onScanError) onScanError(trimmed);
    }

    setTimeout(() => {
      setRecentScanInfo(null);
    }, 2500);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDecodedBarcode(manualCode.trim());
    setManualCode('');
  };

  const handleToggleTorch = async () => {
    if (mediaStreamRef.current) {
      const track = mediaStreamRef.current.getVideoTracks()[0];
      if (track) {
        try {
          const nextTorch = !torchOn;
          await track.applyConstraints({
            advanced: [{ torch: nextTorch }] as any
          });
          setTorchOn(nextTorch);
        } catch (err) {
          console.warn('Torch control not supported on this camera/browser');
        }
      }
    }
  };

  const handleSwitchFacingMode = () => {
    setFacingMode(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col relative my-auto">
        
        {/* Modal Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                Pindai Barcode Kamera
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                  Native WebRTC
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Arahkan kamera ke barcode produk untuk langsung masuk keranjang
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopCamera();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scan Status Toast Banner */}
        {recentScanInfo && (
          <div 
            className={`px-4 py-2.5 text-xs font-bold flex items-center gap-2 animate-bounce ${
              recentScanInfo.success 
                ? 'bg-emerald-500 text-slate-950' 
                : 'bg-rose-500 text-white'
            }`}
          >
            {recentScanInfo.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">{recentScanInfo.msg}</span>
          </div>
        )}

        {/* Camera Viewfinder Box */}
        <div className="relative bg-black min-h-[280px] flex items-center justify-center overflow-hidden">
          {/* HTML5 Native Video Stream */}
          <video 
            ref={videoRef}
            playsInline
            muted
            className="w-full h-full object-cover max-h-[320px]"
          />

          {/* Laser Scanning Animation Overlay */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-[260px] h-[180px] border-2 border-emerald-400/70 rounded-2xl relative shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                {/* Corner Accents */}
                <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />

                {/* Animated Red/Green Laser Line */}
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent absolute top-1/2 -translate-y-1/2 animate-pulse shadow-[0_0_8px_#10b981]" />
              </div>
            </div>
          )}

          {/* Camera Error Message */}
          {errorMessage && (
            <div className="absolute inset-0 p-6 bg-slate-950/95 flex flex-col items-center justify-center text-center z-20">
              <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
              <p className="text-xs text-rose-300 font-semibold mb-3 max-w-xs">{errorMessage}</p>
              <button
                onClick={startCameraStream}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Kamera
              </button>
            </div>
          )}

          {/* Floating Controls Overlay */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
            <button
              onClick={handleSwitchFacingMode}
              title="Ganti Kamera Depan/Belakang"
              className="p-2.5 rounded-full bg-slate-900/80 border border-slate-700 text-white hover:bg-slate-800 backdrop-blur-md transition shadow"
            >
              <SwitchCamera className="w-4 h-4" />
            </button>

            <button
              onClick={handleToggleTorch}
              title="Lampu Senter Flash"
              className={`p-2.5 rounded-full border backdrop-blur-md transition shadow ${
                torchOn 
                  ? 'bg-amber-400 border-amber-300 text-slate-950 font-bold' 
                  : 'bg-slate-900/80 border-slate-700 text-white hover:bg-slate-800'
              }`}
            >
              <Flashlight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Manual Fallback Code Input Form */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
          <form onSubmit={handleManualSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <Barcode className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Atau masukan kode barcode manual..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-750 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition shrink-0"
            >
              Proses
            </button>
          </form>

          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Volume2 className="w-3.5 h-3.5" /> Suara Beep Aktif
            </span>
            <span className="flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5" /> EAN-13, UPC, Code-128, QR
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
