import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { 
  X, 
  Camera, 
  Flashlight, 
  SwitchCamera, 
  AlertCircle, 
  ScanLine, 
  CheckCircle2, 
  Barcode, 
  Volume2,
  HelpCircle
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
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recentScanInfo, setRecentScanInfo] = useState<{ success: boolean; msg: string } | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [torchOn, setTorchOn] = useState(false);

  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedTimeRef = useRef<number>(0);
  const scannerContainerId = 'reader-camera-scanner-view';

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    // Get available video input cameras
    Html5Qrcode.getCameras()
      .then(deviceList => {
        if (!isMounted) return;
        if (deviceList && deviceList.length > 0) {
          setCameras(deviceList);
          // Prefer back/environment camera for Android
          const backCam = deviceList.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('rear') || 
            d.label.toLowerCase().includes('environment')
          );
          setSelectedCameraId(backCam ? backCam.id : deviceList[0].id);
        } else {
          setErrorMessage('Tidak ada kamera yang terdeteksi di perangkat ini.');
        }
      })
      .catch(err => {
        if (!isMounted) return;
        console.warn('Error fetching cameras:', err);
        setErrorMessage('Izin kamera ditolak atau kamera tidak dapat diakses.');
      });

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isOpen]);

  // Start scanner when camera ID is selected
  useEffect(() => {
    if (isOpen && selectedCameraId) {
      startScanner(selectedCameraId);
    }
  }, [isOpen, selectedCameraId]);

  const stopScanner = async () => {
    if (html5QrcodeRef.current) {
      try {
        if (html5QrcodeRef.current.isScanning) {
          await html5QrcodeRef.current.stop();
        }
        html5QrcodeRef.current.clear();
      } catch (err) {
        console.warn('Failed to stop html5Qrcode scanner:', err);
      }
      html5QrcodeRef.current = null;
      setIsScanning(false);
    }
  };

  const startScanner = async (cameraId: string) => {
    await stopScanner();
    setErrorMessage(null);

    try {
      const html5Qrcode = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE
        ],
        verbose: false
      });

      html5QrcodeRef.current = html5Qrcode;

      const config = {
        fps: 15,
        qrbox: { width: 260, height: 180 },
        aspectRatio: 1.3333
      };

      await html5Qrcode.start(
        cameraId,
        config,
        (decodedText) => {
          handleDecodedBarcode(decodedText);
        },
        () => {
          // Frame scan error (ignore normal non-code frames)
        }
      );

      setIsScanning(true);
    } catch (err: any) {
      console.error('Failed to start camera scanner:', err);
      setErrorMessage('Gagal membuka kamera: ' + (err?.message || 'Izin kamera diperlukan'));
      setIsScanning(false);
    }
  };

  const handleDecodedBarcode = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    // Prevent duplicate triggers within 1.2 seconds for same barcode
    const now = Date.now();
    if (now - lastScannedTimeRef.current < 1200) {
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

    // Auto clear banner feedback after 2.5 seconds
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
    if (html5QrcodeRef.current && isScanning) {
      try {
        const nextTorch = !torchOn;
        await html5QrcodeRef.current.applyVideoConstraints({
          advanced: [{ torch: nextTorch }] as any
        });
        setTorchOn(nextTorch);
      } catch (err) {
        console.warn('Torch function not supported on this device/browser');
      }
    }
  };

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    setSelectedCameraId(cameras[nextIndex].id);
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
                  Android & Web
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Arahkan kamera ke barcode produk untuk otomatis masuk keranjang
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              stopScanner();
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
        <div className="relative bg-black min-h-[260px] flex items-center justify-center overflow-hidden">
          {/* HTML5 QR Code Container Element */}
          <div id={scannerContainerId} className="w-full h-full object-cover" />

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
            <div className="absolute inset-0 p-6 bg-slate-950/95 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-10 h-10 text-rose-400 mb-2" />
              <p className="text-xs text-rose-300 font-semibold mb-3 max-w-xs">{errorMessage}</p>
              <button
                onClick={() => {
                  if (selectedCameraId) startScanner(selectedCameraId);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow"
              >
                Coba Buka Kamera Lagi
              </button>
            </div>
          )}

          {/* Floating Controls Overlay */}
          <div className="absolute bottom-3 right-3 flex items-center gap-2 z-10">
            {cameras.length > 1 && (
              <button
                onClick={handleSwitchCamera}
                title="Ganti Kamera Front/Back"
                className="p-2.5 rounded-full bg-slate-900/80 border border-slate-700 text-white hover:bg-slate-800 backdrop-blur-md transition shadow"
              >
                <SwitchCamera className="w-4 h-4" />
              </button>
            )}

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
                placeholder="Atau ketik/input kode barcode manual..."
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
              <HelpCircle className="w-3.5 h-3.5" /> Mendukung EAN-13, UPC, Code-128
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
