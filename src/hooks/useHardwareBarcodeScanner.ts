import { useEffect, useRef, useState } from 'react';
import { Product } from '../types';
import { sounds } from '../utils/audio';

export interface UseHardwareBarcodeScannerOptions {
  products: Product[];
  onScanSuccess: (product: Product, scannedCode: string) => void;
  onScanError?: (scannedCode: string) => void;
  enabled?: boolean;
}

/**
 * Custom React Hook for Linux / Desktop USB HID Hardware Barcode Scanners.
 * Captures rapid keystroke sequences sent by USB barcode guns/scanners.
 */
export function useHardwareBarcodeScanner({
  products,
  onScanSuccess,
  onScanError,
  enabled = true
}: UseHardwareBarcodeScannerOptions) {
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [toastNotification, setToastNotification] = useState<{ success: boolean; msg: string } | null>(null);

  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInputFocused = targetTag === 'input' || targetTag === 'textarea' || (e.target as HTMLElement)?.isContentEditable;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // USB Barcode guns type characters with ultra-fast speed (< 45ms per key)
      const isFastTyping = timeDiff < 45;

      // Handle Enter key (Scanner termination signal)
      if (e.key === 'Enter') {
        const barcodeCandidate = bufferRef.current.trim();
        bufferRef.current = '';

        if (barcodeCandidate.length >= 3) {
          // If rapid typing OR not focused in normal text field, intercept as scanner
          if (isFastTyping || !isInputFocused) {
            e.preventDefault();
            e.stopPropagation();
            processBarcodeScan(barcodeCandidate);
          }
        }
        return;
      }

      // Buffer printable characters
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (timeDiff > 120 && bufferRef.current.length > 0 && !isFastTyping) {
          // Reset buffer if human paused typing
          bufferRef.current = '';
        }
        bufferRef.current += e.key;
      }
    };

    const processBarcodeScan = (code: string) => {
      setLastScannedCode(code);

      // Search matching product in products list
      const matched = products.find(p => 
        (p.barcode && p.barcode.trim() === code) ||
        (p.sku && p.sku.trim().toLowerCase() === code.toLowerCase()) ||
        String(p.id) === code
      );

      if (matched) {
        sounds.playScanBeep();
        setToastNotification({
          success: true,
          msg: `✓ ${matched.name} ditambahkan!`
        });
        onScanSuccess(matched, code);
      } else {
        sounds.playErrorBeep();
        setToastNotification({
          success: false,
          msg: `⚠️ Barcode "${code}" tidak ditemukan!`
        });
        if (onScanError) onScanError(code);
      }

      // Dismiss toast after 2.5s
      setTimeout(() => {
        setToastNotification(null);
      }, 2500);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [products, enabled, onScanSuccess, onScanError]);

  return {
    lastScannedCode,
    toastNotification,
    clearToast: () => setToastNotification(null)
  };
}
