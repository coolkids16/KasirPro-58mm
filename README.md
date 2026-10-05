# KasirPro 58mm - Arsitektur POS Cross-Platform (Linux Desktop & Android)

Aplikasi Point of Sale (POS) kasir offline-first berkinerja tinggi yang dirancang untuk berjalan di **Linux Desktop** (menggunakan **Tauri**) dan **Android** (menggunakan **Capacitor**), dengan fitur utama dukungan **printer thermal 58mm (ESC/POS)** berstandar 32 karakter per baris.

---

## 1. Tech Stack & Prinsip Arsitektur

- **Frontend / UI Core**: React (TypeScript) + Vite + Tailwind CSS (100% *shared codebase*).
- **Desktop Wrapper (Linux)**: **Tauri** (menggunakan WebKit2GTK native webview dan backend Rust ultra-ringan dengan konsumsi RAM < 35MB).
- **Mobile Wrapper (Android)**: **Capacitor** (akses native hardware, Bluetooth, dan Android SDK).
- **Database Lokal (Offline-first)**: **Dexie.js** (wrapper IndexedDB berkinerja tinggi tanpa ketergantungan server).
- **Package Manager & Runtime**: **Bun** (cepat, hemat resource, pengganti `npm` dan `npx` via `bunx`).
- **Pencetakan Struk**: **ESC/POS Binary Encoder** khusus lebar 58mm (32 karakter kolom per baris).

---

## 2. Rekomendasi Struktur Folder Monorepo (Shared-Core)

```text
kasirpro-pos/
├── android/                    # Proyek Android Native (dihasilkan oleh Capacitor)
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml # Izin Bluetooth & Hardware Thermal Printer
│   │   └── res/
│   └── build.gradle
│
├── src-tauri/                  # Wrapper Linux Desktop (dihasilkan oleh Tauri)
│   ├── src/
│   │   └── main.rs             # Backend Rust: Direct I/O ke /dev/usb/lp0
│   ├── Cargo.toml              # Dependensi Rust
│   └── tauri.conf.json         # Konfigurasi Window, Permission, dan Build
│
├── src/                        # 🌐 100% SHARED CORE CODE (Digunakan bersama)
│   ├── components/             # Komponen UI (PosScreen, ReceiptModal, ProductManagement, dll)
│   ├── db/
│   │   └── db.ts               # Skema & operasi Dexie.js (Offline IndexedDB)
│   ├── services/
│   │   ├── printerService.ts   # Hardware Abstraction Layer (HAL) Printer 58mm
│   │   └── ...
│   ├── utils/
│   │   └── escpos.ts           # 32-character ESC/POS Generator & Binary Encoder
│   ├── types/
│   │   └── index.ts            # Definisi Interface TypeScript
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css               # Tailwind CSS
│
├── capacitor.config.ts         # Konfigurasi Capacitor (webDir: "dist")
├── vite.config.ts              # Konfigurasi bundler Vite
├── package.json
└── tsconfig.json
```

---

## 3. Modul Pencetakan Struk Thermal 58mm (Format ESC/POS 32 Karakter)

Printer thermal 58mm memiliki area cetak 384 dot. Menggunakan Font standar A (12×24 dot), baris cetak dibatasi **tepat 32 karakter per baris**.

### Aturan Format:
1. **Header Toko**: Rata tengah (*center align*), ukuran teks dapat menggunakan tinggi ganda (*double height*).
2. **Item Belanja**:
   - Baris 1: Nama produk (maksimal 32 karakter).
   - Baris 2: `  [Qty] x [Harga Satuan]` di rata kiri, dan `[Subtotal]` di rata kanan.
3. **Pemisah**: Garis karakter tanda hubung (`-`) atau sama dengan (`=`) sepanjang 32 karakter.
4. **Perintah Kontrol Khusus**:
   - `ESC @` (`0x1B, 0x40`): Reset & inisialisasi printer.
   - `ESC p 0 25 250` (`0x1B, 0x70, 0x00, 0x19, 0xFA`): Sinyal pulsa buka laci kasir (RJ11 Cash Drawer).
   - `GS V 66 0` (`0x1D, 0x56, 0x42, 0x00`): Pemotongan kertas otomatis (*auto-cutter*).

### Implementasi TypeScript (`src/utils/escpos.ts`):

```typescript
export class EscPosEncoder {
  private buffer: number[] = [];

  constructor() {
    this.buffer.push(0x1B, 0x40); // ESC @ : Reset printer
  }

  // Baris dua kolom rata kiri dan kanan (Total tepat 32 karakter)
  twoColumn(left: string, right: string, width = 32): this {
    const spaces = Math.max(1, width - left.length - right.length);
    const line = left + ' '.repeat(spaces) + right;
    return this.textLine(line);
  }

  // Format baris item belanja
  itemRow(name: string, qty: number, price: number, subtotal: number): this {
    this.textLine(name.substring(0, 32));
    const qtyPrice = `  ${qty} x ${price.toLocaleString('id-ID')}`;
    const total = subtotal.toLocaleString('id-ID');
    return this.twoColumn(qtyPrice, total, 32);
  }

  separator(char = '-', width = 32): this {
    return this.textLine(char.repeat(width));
  }

  // Pulsa buka laci kasir RJ11
  kickDrawer(): this {
    this.buffer.push(0x1B, 0x70, 0x00, 0x19, 0xFA);
    return this;
  }

  // Potong kertas
  cut(): this {
    this.buffer.push(0x0A, 0x0A, 0x0A);
    this.buffer.push(0x1D, 0x56, 0x01);
    return this;
  }

  textLine(str: string): this {
    for (let i = 0; i < str.length; i++) {
      this.buffer.push(str.charCodeAt(i));
    }
    this.buffer.push(0x0A); // LF
    return this;
  }

  encode(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
```

---

## 4. Hardware Abstraction Layer (HAL) untuk Linux & Android

### A. Linux Desktop CachyOS (Tauri via Direct File I/O ke `/dev/usb/lp0`)

Di Linux (seperti CachyOS / Arch / Ubuntu), printer thermal USB (misal Vendor ID: `28e9`, Product ID: `0289`) otomatis dikenali kernel Linux dan modul `usblp` di `/dev/usb/lp0`. 

Melalui Tauri IPC command `tauri_raw` / `print_raw_escpos`, buffer biner `Uint8Array` langsung ditulis ke file descriptor tersebut:

```rust
// src-tauri/src/main.rs
use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;

#[tauri::command]
fn tauri_raw(bytes: Vec<u8>, device_path: Option<String>) -> Result<String, String> {
    let path = device_path.unwrap_or_else(|| "/dev/usb/lp0".to_string());
    
    let mut file = OpenOptions::new()
        .write(true)
        .open(&path)
        .map_err(|e| format!("Gagal membuka {}: {}. Pastikan izin akses lp/dialout sudah diberikan.", path, e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("Gagal menulis data ke printer: {}", e))?;
    file.flush()
        .map_err(|e| format!("Flush data gagal: {}", e))?;

    Ok(format!("Berhasil mencetak {} bytes ke {}", bytes.len(), path))
}

#[tauri::command]
fn print_raw_escpos(bytes: Vec<u8>, device_path: Option<String>) -> Result<String, String> {
    tauri_raw(bytes, device_path)
}
```

**Konfigurasi Izin di Linux CachyOS (Cukup jalankan sekali):**
```bash
# 1. Tambahkan user Anda ke grup lp dan dialout
sudo usermod -a -G lp,dialout $USER

# 2. Buat udev rule agar port /dev/usb/lp* memiliki hak akses 0666 untuk Vendor 28e9 Product 0289:
echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="28e9", ATTRS{idProduct}=="0289", MODE="0666", GROUP="lp"' | sudo tee /etc/udev/rules.d/99-thermal-printer.rules

# 3. Reload udev rules
sudo udevadm control --reload-rules && sudo udevadm trigger

# 4. Logout dan login kembali (atau restart) agar perubahan grup aktif.
```

---

### B. Android (Capacitor & Web Bluetooth BLE)

Untuk printer thermal saku Bluetooth 58mm (seperti Panda, VSC, EPPOS, Iware), gunakan Web Bluetooth API atau plugin Capacitor:

```typescript
// Pengiriman biner Bluetooth dengan chunking agar MTU tidak overflow
export async function printWebBluetooth(data: Uint8Array): Promise<void> {
  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 0xffe0]
  });

  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(0xffe0);
  const characteristic = await service.getCharacteristic(0xffe1);

  const CHUNK_SIZE = 50;
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    const chunk = data.slice(i, i + CHUNK_SIZE);
    await characteristic.writeValue(chunk);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
```

**Izin di `android/app/src/main/AndroidManifest.xml`:**
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
</manifest>
```

---

## 5. Panduan Setup Lengkap Menggunakan Bun

### Langkah 1: Inisialisasi Proyek React + Vite + Tailwind + Dexie.js
```bash
# 1. Buat proyek menggunakan Bun
bun create vite kasirpro-pos --template react-ts
cd kasirpro-pos

# 2. Pasang dependensi utama
bun install dexie lucide-react canvas-confetti

# 3. Pasang dependensi styling Tailwind CSS
bun install -d tailwindcss @tailwindcss/vite @types/canvas-confetti
```

---

### Langkah 2: Setup Wrapper Linux Desktop (Tauri)
```bash
# 1. Pasang dependensi sistem operasi (Ubuntu/Debian)
sudo apt update
sudo apt install build-essential curl wget file libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev

# 2. Pasang Tauri CLI menggunakan Bun
bun install -d @tauri-apps/cli @tauri-apps/api

# 3. Inisialisasi Tauri (Gunakan bunx sebagai pengganti npx)
bunx tauri init
```
*Saat ditanya opsi konfigurasi:*
- What is your app name? `kasirpro-pos`
- What should the window title be? `KasirPro 58mm`
- Where are your web assets? `../dist`
- What is the url of your dev server? `http://localhost:3000`
- What is your frontend dev command? `bun run dev`
- What is your frontend build command? `bun run build`

---

### Langkah 3: Setup Wrapper Android (Capacitor)
```bash
# 1. Pasang Capacitor Core & CLI
bun install @capacitor/core
bun install -d @capacitor/cli

# 2. Inisialisasi Capacitor dengan bunx
bunx cap init "KasirPro 58mm" "com.kasirpro.pos" --web-dir "dist"

# 3. Tambahkan platform Android
bun install @capacitor/android
bunx cap add android
```

---

### Langkah 4: Perintah Menjalankan & Build Aplikasi

#### A. Menjalankan di Linux Desktop (Tauri):
```bash
# Menjalankan mode pengembangan (hot reload)
bunx tauri dev

# Menghasilkan installer .deb dan AppImage mandiri
bunx tauri build
```

#### B. Menjalankan di Android:
```bash
# 1. Build aset web React
bun run build

# 2. Sinkronkan file dist ke folder android
bunx cap sync android

# 3. Buka proyek di Android Studio untuk dijalankan ke HP atau build APK
bunx cap open android
```
