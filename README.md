# KasirPro 58mm - Sistem POS Kasir Cross-Platform (Linux Desktop & Android)

Aplikasi Point of Sale (POS) kasir *offline-first* berkinerja tinggi yang dirancang untuk berjalan di **Linux Desktop** (menggunakan **Tauri v2**) dan **Android** (menggunakan **Capacitor**), dengan fitur utama dukungan **printer thermal 58mm (ESC/POS)** berstandar 32 karakter per baris.

---

## 🚀 Fitur Utama

- **Dual Database System**:
  - **Dexie.js (IndexedDB)**: Penyimpanan lokal *offline-first*, kasir tetap beroperasi 100% cepat saat internet padam.
  - **Firebase Firestore**: Sinkronisasi cloud *real-time* otomatis ke semua perangkat kasir (multi-cabang / multi-device).
- **Direct ESC/POS 58mm Thermal Printing**:
  - **Linux Desktop**: Akses langsung hardware via port `/dev/usb/lp0` (Tauri Native IPC).
  - **Android Mobile**: Web Bluetooth API & Capacitor BLE untuk printer thermal saku portabel Bluetooth.
  - **Simulator**: Virtual thermal printer 58mm bawaan (32 kolom teks & barcode/QR).
- **Laporan & Manajemen Stok**:
  - Dashboard analitik & grafik omzet harian interaktif (Recharts).
  - Manajemen produk, kategori kustom, varian harga, dan pelacak sisa stok.
  - Pusat backup, ekspor, dan impor data lengkap (Format CSV Excel & JSON).

---

## 🖥️ BAGIAN 1: Panduan Instalasi & Build di Linux Desktop (Arch / CachyOS / Ubuntu)

### 1. Pasang Dependensi Sistem

#### A. Untuk Distro Berbasis Arch Linux (CachyOS, EndeavourOS, Manjaro, Arch):
```bash
# 1. Update sistem
sudo pacman -Syu

# 2. Pasang Bun (Utama), Rust, Cargo, dan WebKitGTK
sudo pacman -S base-devel git bun rust cargo webkit2gtk-4.1 libappindicator-gtk3 openssl libsoup3

# (Opsi ke-2 jika ingin memasang Node.js & npm: sudo pacman -S nodejs npm)
```

#### B. Untuk Distro Berbasis Debian / Ubuntu:
```bash
sudo apt update
sudo apt install build-essential git curl rustc cargo libssl-dev libgtk-3-dev libwebkit2gtk-4.1-dev libappindicator3-dev

# Pasang Bun (Utama):
curl -fsSL https://bun.sh/install | bash
source ~/.bashrc
```

---

### 2. Atur Izin Port Printer USB Thermal Linux (`/dev/usb/lp0`)

Agar aplikasi dapat menulis biner ESC/POS langsung ke printer tanpa perlu `sudo`:

```bash
# 1. Tambahkan akun pengguna Anda ke grup printer Linux (lp & dialout)
sudo usermod -a -G lp,dialout $USER

# 2. Pastikan modul kernel usblp aktif
sudo modprobe usblp

# 3. (Opsional) Tambahkan aturan udev untuk akses permanen
echo 'SUBSYSTEM=="usb", ATTRS{idVendor}=="28e9", ATTRS{idProduct}=="0289", MODE="0666", GROUP="lp"' | sudo tee /etc/udev/rules.d/99-thermal-printer.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
```

> ⚠️ **PENTING**: Lakukan **Logout lalu Login kembali** (atau restart komputer) agar penambahan grup `lp` aktif di sesi pengguna Anda.

Periksa status port printer USB:
```bash
ls -l /dev/usb/lp*
# Output normal: crw-rw---- 1 root lp ... /dev/usb/lp0
```

---

### 3. Clone Repositori & Pasang Dependensi

```bash
# 1. Clone repository project
git clone https://github.com/USERNAME/kasirpro-58mm.git

# 2. Masuk ke folder project
cd kasirpro-58mm

# 3. Instal paket dependensi
bun install
# (Alternatif ke-2: npm install)
```

---

### 4. Menjalankan di Linux Desktop

#### Mode Desktop Native Tauri (Rekomendasi untuk Kasir):
```bash
bunx tauri dev
# (Alternatif ke-2: npx @tauri-apps/cli dev)
```

#### Mode Web Browser Lokal (PWA):
```bash
bun run dev
# (Alternatif ke-2: npm run dev)
```
Akses di browser: **`http://localhost:3000`**

---

### 5. Build File Aplikasi Siap Pakai Linux (`.AppImage`)

```bash
bunx tauri build
# (Alternatif ke-2: npx @tauri-apps/cli build)
```
Hasil file biner rilis:
- **AppImage**: `src-tauri/target/release/bundle/appimage/KasirPro 58mm POS_0.1.0_amd64.AppImage`
- **Biner Executable**: `src-tauri/target/release/kasirpro-58mm-pos`

---

## 📱 BAGIAN 2: Panduan Setup & Build untuk Android (Capacitor APK)

Aplikasi KasirPro dapat dibungkus menjadi aplikasi Android native menggunakan **Capacitor** untuk digunakan pada Tablet Kasir atau Smartphone Android dengan printer Bluetooth thermal 58mm.

### 1. Inisialisasi Platform Android

```bash
# 1. Pasang Capacitor Core & CLI
bun install @capacitor/core
bun install -d @capacitor/cli @capacitor/android
# (Alternatif ke-2: npm install @capacitor/core && npm install -D @capacitor/cli @capacitor/android)

# 2. Inisialisasi konfigurasi Capacitor (cukup sekali di awal)
bunx cap init "KasirPro 58mm" "com.kasirpro.pos" --web-dir "dist"

# 3. Tambahkan folder platform Android
bunx cap add android
```

---

### 2. Izin Bluetooth Printer di `android/app/src/main/AndroidManifest.xml`

Buka berkas `android/app/src/main/AndroidManifest.xml` dan tambahkan izin Bluetooth berikut di dalam tag `<manifest>`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Izin Bluetooth Printer Thermal Thermal 58mm -->
    <uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />
    <uses-permission android:name="android.permission.BLUETOOTH_SCAN" android:usesPermissionFlags="neverForLocation" />
    <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
    <uses-permission android:name="android.permission.INTERNET" />
</manifest>
```

---

### 3. Build Aset & Buka di Android Studio / Generate APK

```bash
# 1. Build frontend React
bun run build
# (Alternatif ke-2: npm run build)

# 2. Sinkronkan hasil build web ke proyek Android native
bunx cap sync android
# (Alternatif ke-2: npx cap sync android)

# 3. Buka proyek langsung di Android Studio
bunx cap open android
# (Alternatif ke-2: npx cap open android)
```

Setelah Android Studio terbuka:
1. Hubungkan HP / Tablet Android dengan kabel USB (aktifkan *USB Debugging*).
2. Klik tombol hijau **Run (`Shift + F10`)** untuk langsung menginstal dan menjalankan KasirPro di HP Anda.
3. Untuk membuat file APK rilis: Pilih menu **Build > Build Bundle(s) / APK(s) > Build APK(s)**. File APK siap dibagikan ke seluruh karyawan kasir toko.

---

## 🖨️ Spesifikasi Struk Thermal 58mm (ESC/POS 32 Kolom)

Printer thermal 58mm standar memiliki lebar cetak 384 dot atau **tepat 32 karakter per baris** pada Font A standar.

| Perintah ESC/POS | Byte Hex | Fungsi |
| :--- | :--- | :--- |
| `ESC @` | `1B 40` | Inisialisasi dan reset printer |
| `ESC a 1` | `1B 61 01` | Format teks rata tengah (*center*) |
| `ESC a 0` | `1B 61 00` | Format teks rata kiri (*left*) |
| `ESC ! 16` | `1B 21 10` | Mode teks tinggi ganda (*double height*) |
| `ESC p 0 25 250` | `1B 70 00 19 FA` | Pulsa buka laci uang kasir (RJ11 Cash Drawer) |
| `GS V 66 0` | `1D 56 42 00` | Pemotong kertas otomatis (*auto cutter*) |

---

## 🗄️ Konfigurasi Cloud Database Firebase

Aplikasi terhubung ke Firebase Firestore untuk sinkronisasi multi-kasir. Konfigurasi kredensial tersimpan di `firebase-applet-config.json`:

```json
{
  "projectId": "gen-lang-client-0584948514",
  "apiKey": "AIzaSyB765hjOihywJXyCU-p0ZIVsCZdis3A43A",
  "firestoreDatabaseId": "ai-studio-kasirpro58mmcros-28515d52-416e-4b24-a9e0-855a8d9b8109"
}
```

### Struktur Koleksi:
1. **/products**: Data master katalog, harga jual, barcode, warna tombol, dan sisa stok.
2. **/transactions**: Riwayat struk penjualan lengkap, waktu transaksi, kasir, diskon, pajak, dan metode bayar.
3. **/settings**: Konfigurasi toko, alamat, telepon, format struk, dan device port printer `/dev/usb/lp0`.

---

## 💾 Pusat Ekspor, Impor & Backup Data

Modul backup di tombol **Database (`Data`)** menyediakan:
- **Full Backup JSON**: Seluruh data produk, stok, transaksi, dan setting dalam 1 file JSON bertanda waktu.
- **Ekspor CSV (Excel)**: Laporan penjualan dan katalog produk format spreadsheet.
- **Impor & Restore Fleksibel**: Pilihan mode *Gabungkan (Merge)* atau *Timpa Semua (Replace)* dengan sinkronisasi instan ke Dexie.js dan Cloud Firestore.

---

## 📄 Lisensi
Hak Cipta © 2026 KasirPro POS. Dibuat untuk sistem kasir modern, cepat, dan handal di Linux & Android.
