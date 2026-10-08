# KasirPro 58mm - Sistem POS Kasir Cross-Platform (Linux Desktop & Android)

Aplikasi Point of Sale (POS) kasir *offline-first* berkinerja tinggi yang dirancang untuk berjalan di **Linux Desktop** (menggunakan **Tauri v2**) dan **Android** (menggunakan **Capacitor**), dengan fitur utama dukungan **printer thermal 58mm (ESC/POS)** berstandar 32 karakter per baris.

---

## 🚀 Fitur Utama

- **Dual Database System**:
  - **Dexie.js (IndexedDB)**: Penyimpanan lokal *offline-first*, kasir tetap beroperasi 100% cepat saat internet padam.
  - **Firebase Firestore**: Sinkronisasi cloud *real-time* otomatis ke semua perangkat kasir (multi-cabang / multi-device).
- **Direct ESC/POS 58mm Thermal Printing**:
  - **Linux Desktop**: Akses langsung hardware via port `/dev/usb/lp0` (Tauri Native IPC).
  - **Android Mobile**: Web Bluetooth API & Capacitor BLE untuk printer thermal saku portabel Bluetooth (Mode PPOB).
  - **Simulator**: Virtual thermal printer 58mm bawaan (32 kolom teks & barcode/QR).
- **Mode Hemat Kertas Otomatis**:
  - Feed 1 baris minimal (mencegah kertas kosong terbuang).
  - Pilihan baris kosong fleksibel (0–2 baris) & kontrol auto-cutter di menu Pengaturan.
- **Fitur Pembukuan & Arus Kas Terpadu (Cash Flow Management)**:
  - **Sinkronisasi Kasir POS Real-Time**: Seluruh transaksi penjualan dari meja kasir otomatis tercatat dan ditampilkan di daftar **Arus Transaksi Keuangan Terbaru**, metrik laba bersih, dan grafik omzet toko.
  - **Pemasukan Luar Kasir & Pengeluaran Toko**: Pencatatan transaksi non-kasir (servis, top up e-wallet, jasa) dan operasional belanja stok/biaya toko.
  - **Koreksi & Hapus Transaksi**: Fitur edit dan hapus catatan pemasukan/pengeluaran untuk mengoreksi kesalahan pembukuan dengan aman.
  - **Buku Bon & Hutang Pelanggan**: Pencatatan piutang pelanggan, pencatatan pembayaran cicilan bertahap, dan pengingat jatuh tempo.
- **StrukScan OCR (Pengenal Struk Belanja & Nota AI)**:
  - Pemindaian struk fisik belanja/nota kulakan grosir menggunakan kamera atau unggah foto dokumen.
  - Ekstraksi cerdas berbasis OCR untuk mendeteksi nama supplier, tanggal nota, daftar item belanja, harga beli, dan total pembayaran.
  - Ekspor 1-klik langsung menjadi catatan pengeluaran kas pembukuan atau katalog produk baru tanpa ketik manual.
- **Laporan & Manajemen Stok**:
  - Dashboard analitik & grafik omzet harian interaktif (Recharts).
  - Manajemen produk, kategori kustom, varian harga, dan pelacak sisa stok.
  - Pusat backup, ekspor, dan impor data lengkap (Format CSV Excel & JSON).

---

## 🖥️ BAGIAN 1: Panduan Instalasi & Build di Linux Desktop (Arch / CachyOS / Ubuntu)

### 1. Pasang Dependensi Sistem

#### A. Untuk Distro Berbasis Arch Linux (CachyOS, EndeavourOS, Manjaro, Arch):
Buka terminal dan jalankan:
```bash
# 1. Update sistem
sudo pacman -Syu

# 2. Pasang Bun (Utama), Rust, Cargo, dan WebKitGTK
sudo pacman -S base-devel git bun rust cargo webkit2gtk-4.1 libappindicator-gtk3 openssl libsoup3
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

# 3. Instal semua paket dependensi
bun install
# (Alternatif ke-2: npm install)
```

---

### 4. Menjalankan di Linux Desktop

#### ⚡ A. Mode Desktop Native Tauri (Rekomendasi Utama):
Jalankan perintah script yang sudah disiapkan:
```bash
# Menggunakan Bun (Utama & Tercepat):
bun run tauri:dev

# Atau menggunakan Bunx CLI:
bunx @tauri-apps/cli dev
```

#### 🌐 B. Mode Web Browser Lokal (PWA / Chrome):
```bash
# Menggunakan Bun (Utama):
bun run dev
```
Akses di browser: **`http://localhost:3000`**

---

### 5. Build File Aplikasi Siap Pakai Linux (`.AppImage`)

```bash
# Menggunakan Bun (Utama):
bun run tauri:build
```

Hasil file biner rilis siap pakai akan dibuat di:
- **AppImage**: `src-tauri/target/release/bundle/appimage/KasirPro 58mm POS_0.1.0_amd64.AppImage`
- **Biner Executable**: `src-tauri/target/release/kasirpro-58mm-pos`

Cukup beri izin eksekusi (`chmod +x *.AppImage`) dan jalankan aplikasi secara langsung!

---

## 🎨 Cara Mengganti Ikon Aplikasi Desktop Secara Kustom

Anda dapat mengganti logo aplikasi KasirPro dengan logo toko Anda sendiri dengan 2 cara mudah:

### Cara 1: Otomatis via Tauri Icon Generator (Paling Praktis)
1. Siapkan 1 file logo toko Anda format **PNG** (disarankan berukuran minimal **512x512** atau **1024x1024 px**), misalnya simpan sebagai `logo-toko.png`.
2. Jalankan perintah generator:
   ```bash
   bunx @tauri-apps/cli icon logo-toko.png
   ```
3. Tauri CLI akan otomatis menghasilkan seluruh ukuran ikon (`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.ico`, `icon.icns`) dan menimpanya ke folder `src-tauri/icons/`.

### Cara 2: Manual (Timpa Langsung ke Folder `src-tauri/icons/`)
Ganti file gambar di dalam folder `src-tauri/icons/`:
- `32x32.png` *(32 × 32 pixel)*
- `128x128.png` *(128 × 128 pixel)*
- `128x128@2x.png` *(256 × 256 pixel)*
- `icon.png` *(512 × 512 pixel)*
- `icon.ico` & `icon.icns` *(ikon sistem Windows & Mac)*

---

## 📱 BAGIAN 2: Panduan Setup & Build untuk Android (Capacitor APK)

Capacitor digunakan untuk mengonversi kode React Vite KasirPro menjadi aplikasi Android (.APK) mandiri yang cepat dan andal.

### 1. Inisialisasi Proyek Android dari Nol
Jalankan langkah-langkah berikut di terminal proyek Anda:

```bash
# A. Instalasi Core, Platform Android, & Plugin Bluetooth Serial (Mode PPOB)
bun add @capacitor/core cordova-plugin-bluetooth-serial
bun add -d @capacitor/cli @capacitor/android

# B. Inisialisasi konfigurasi Capacitor (cukup sekali di awal)
bunx cap init "KasirPro" "com.kasirpro.pos" --web-dir "dist"

# C. Tambahkan platform Android native
bunx cap add android
```

---

### 2. Atur Izin Kamera & Bluetooth di Android (Sangat Penting!)
Agar pemindai barcode kamera dan pencetakan langsung Bluetooth (Mode PPOB) dapat bekerja secara native di Android:

1. Buka file: `android/app/src/main/AndroidManifest.xml`
2. Tambahkan baris izin berikut di dalam tag `<manifest>` (letakkan sebelum tag `<application>`):
   ```xml
   <!-- Izin Kamera untuk Scanner Barcode -->
   <uses-permission android:name="android.permission.CAMERA" />
   <uses-feature android:name="android.hardware.camera" android:required="false" />
   <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

   <!-- Izin Bluetooth untuk Cetak Thermal Langsung (Mode PPOB) -->
   <uses-permission android:name="android.permission.BLUETOOTH" />
   <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
   <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
   <uses-permission android:name="android.permission.BLUETOOTH_SCAN" />
   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
   ```
3. Simpan file tersebut.

---

### 3. Cara Menggunakan Cetak Bluetooth Langsung (Mode PPOB)
Sistem cetak Bluetooth di KasirPro kini bekerja **langsung seperti aplikasi PPOB / kasir minimarket** tanpa perlu membuka aplikasi perantara seperti RawBT atau Thermer:

1. **Nyalakan Printer**: Nyalakan printer thermal Bluetooth Anda.
2. **Pairing di HP**: Buka menu **Pengaturan > Bluetooth** di HP Android Anda, cari nama printer thermal Anda (misalnya `RPP02N`, `POS-58`, `PT-210`, `MPT-II`, dll), lalu klik pasangkan / *Pair* (PIN default biasanya `0000` atau `1234`).
3. **Pilih di KasirPro**: Buka KasirPro di HP Anda. Pada jendela cetak struk atau menu **Uji Printer**, klik **`Pilih Printer Bluetooth (PPOB)`**, lalu pilih printer yang baru saja Anda pasangkan.
4. **Cetak Instan**: Printer Anda akan tersimpan otomatis. Setiap kali transaksi selesai, kasir tinggal klik **`⚡ Cetak Langsung: [Nama Printer]`** — struk langsung keluar dari printer seketika!

---

### 4. Cara Mengganti Logo / Ikon Aplikasi Android

Untuk mengubah logo aplikasi bawaan Capacitor menjadi logo kustom toko Anda, gunakan salah satu cara berikut:

#### Cara A: Menggunakan Android Studio Image Asset Studio (Sangat Direkomendasikan)
Cara ini adalah standar resmi Google untuk menghasilkan ikon adaptif (*adaptive icons*) yang rapi di semua versi Android (kotak, lingkaran, squircle).

1. Buka proyek Android di Android Studio:
   ```bash
   bunx cap open android
   ```
2. Tunggu proses singkronisasi Gradle selesai.
3. Di panel sebelah kiri (Project Navigation), klik kanan pada folder **`app`**, lalu pilih **`New` > `Image Asset`**.
4. Pada jendela **Asset Studio**:
   - **Icon Type**: Pilih `Launcher Icons (Adaptive and Legacy)`.
   - **Name**: Biarkan tetap `ic_launcher`.
   - **Source Asset (Foreground Layer)**: Pada kolom *Path*, klik ikon folder dan pilih file logo kustom Anda (format PNG/SVG, disarankan resolusi 512x512 px).
   - **Resize**: Atur persentase ukuran gambar agar pas di dalam lingkaran zona aman (biasanya ~65%-70%).
   - **Background Layer**: Anda bisa memilih warna latar belakang (*Color*) atau gambar latar (*Image*) untuk ikon Anda.
5. Klik **`Next`**, lalu klik **`Finish`**. Google Android Studio akan otomatis me-generate seluruh ukuran ikon dan menyimpannya ke folder resource.

#### Cara B: Mengganti File Gambar Secara Manual
Jika Anda tidak menggunakan Android Studio, Anda dapat menimpa file gambar ikon di folder berikut secara langsung:
Letakkan logo kustom Anda ke dalam folder:
`android/app/src/main/res/` di subfolder berikut:
- `mipmap-mdpi/ic_launcher.png` (48x48 px)
- `mipmap-hdpi/ic_launcher.png` (72x72 px)
- `mipmap-xhdpi/ic_launcher.png` (96x96 px)
- `mipmap-xxhdpi/ic_launcher.png` (144x144 px)
- `mipmap-xxxhdpi/ic_launcher.png` (192x192 px)
*(Lakukan hal yang sama untuk file `ic_launcher_round.png` jika ingin mendukung versi ikon membulat).*

---

### 5. Alur Build & Sinkronisasi Berkala (Setiap Kali Ada Perubahan Kode)
Jalankan langkah-langkah ini setiap kali Anda memperbarui kode aplikasi KasirPro Anda agar disinkronkan ke Android:

```bash
# 1. Kompilasi kode React
bun run build

# 2. Sinkronisasikan hasil build (dist) ke platform Android native
bunx cap sync android

# 3. Buka Android Studio untuk build APK
bunx cap open android
```

Di dalam Android Studio, pilih menu **Build > Build Bundle(s) / APK(s) > Build APK(s)** untuk menghasilkan file **`app-debug.apk`** siap pasang!

---

## 🔥 BAGIAN 3: Panduan Menghubungkan & Mengganti Akun Firebase Sendiri

Anda dapat menggunakan akun Google / Firebase pribadi Anda sendiri secara **100% gratis** (Free Tier Spark Plan).

### Langkah 1: Buat Proyek di Firebase Console
1. Buka [https://console.firebase.google.com/](https://console.firebase.google.com/) lalu login dengan akun Google Anda.
2. Klik **Add Project** (Tambah Proyek), beri nama misal: `tokoku-kasir-pos`, lalu klik Lanjutkan hingga selesai.

### Langkah 2: Aktifkan Fitur Authentication (Email/Password)
1. Di sidebar kiri Firebase Console, pilih menu **Build > Authentication**.
2. Klik tombol **Get Started**.
3. Di tab **Sign-in method**, klik opsi **Email/Password**.
4. Aktifkan sakelar **Enable** pada *Email/Password* (Email link / passwordless biarkan nonaktif).
5. Klik **Save**.

### Langkah 3: Aktifkan Database Cloud Firestore
1. Di sidebar kiri, pilih menu **Build > Firestore Database**.
2. Klik tombol **Create Database**.
3. Pilih lokasi server database terdekat (misalnya: `asia-southeast2` Jakarta atau `asia-southeast1` Singapura).
4. Pada mode aturan awal, pilih **Start in production mode** lalu klik **Create**.
5. Buka tab **Rules** di bagian atas Firestore Database Anda, lalu tempelkan (*copy-paste*) isi dari file `firestore.rules` proyek ini dan klik **Publish**.

### Langkah 4: Daftarkan Web App & Ambil Konfigurasi Kredensial
1. Klik ikon gerigi (Project Settings) di pojok kiri atas samping tulisan *Project Overview*.
2. Gulir ke bawah pada bagian *Your apps*, klik ikon Web **`</>`**.
3. Beri nama aplikasi (misal: `KasirPro Web`), lalu klik **Register app**.
4. Anda akan melihat blok kode `firebaseConfig` seperti ini:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSyB...",
     authDomain: "tokoku-kasir-pos.firebaseapp.com",
     projectId: "tokoku-kasir-pos",
     storageBucket: "tokoku-kasir-pos.firebasestorage.app",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef"
   };
   ```

### Langkah 5: Ganti File `firebase-applet-config.json` di Proyek
Buka file **`firebase-applet-config.json`** di root folder aplikasi Anda dan gantikan isinya dengan konfigurasi Firebase baru Anda:

```json
{
  "apiKey": "AIzaSyB...",
  "authDomain": "tokoku-kasir-pos.firebaseapp.com",
  "projectId": "tokoku-kasir-pos",
  "storageBucket": "tokoku-kasir-pos.firebasestorage.app",
  "messagingSenderId": "123456789",
  "appId": "1:123456789:web:abcdef"
}
```

> 💡 **Catatan**: Jika menggunakan database default Firebase Console, field `firestoreDatabaseId` dapat dihilangkan atau diisi `"(default)"`. Aplikasi sudah otomatis mendeteksi konfigurasi tersebut.

Setelah file `firebase-applet-config.json` disimpan, aplikasi KasirPro akan otomatis terhubung ke akun database Firebase pribadi Anda!

---

## 🗄️ Struktur Koleksi Database Firestore

1. **/products**: Data master katalog, harga jual, barcode, warna tombol, dan sisa stok.
2. **/transactions**: Riwayat struk penjualan lengkap, waktu transaksi, kasir, diskon, pajak, dan metode bayar.
3. **/settings**: Konfigurasi toko, alamat, telepon, format struk, dan device port printer `/dev/usb/lp0`.
4. **/users**: Data profil kasir terdaftar.

---

## 🖨️ Spesifikasi Struk Thermal 58mm (ESC/POS 32 Kolom)

| Perintah ESC/POS | Byte Hex | Fungsi |
| :--- | :--- | :--- |
| `ESC @` | `1B 40` | Inisialisasi dan reset printer |
| `ESC a 1` | `1B 61 01` | Format teks rata tengah (*center*) |
| `ESC a 0` | `1B 61 00` | Format teks rata kiri (*left*) |
| `ESC ! 16` | `1B 21 10` | Mode teks tinggi ganda (*double height*) |
| `ESC p 0 25 250` | `1B 70 00 19 FA` | Pulsa buka laci uang kasir (RJ11 Cash Drawer) |
| `GS V 66 0` | `1D 56 42 00` | Pemotong kertas otomatis (*auto cutter*) |

---

## 💾 Pusat Ekspor, Impor & Backup Data

Modul backup di tombol **Database (`Data`)** menyediakan:
- **Full Backup JSON**: Seluruh data produk, stok, transaksi, dan setting dalam 1 file JSON bertanda waktu.
- **Ekspor CSV (Excel)**: Laporan penjualan dan katalog produk format spreadsheet.
- **Impor & Restore Fleksibel**: Pilihan mode *Gabungkan (Merge)* atau *Timpa Semua (Replace)* dengan sinkronisasi instan ke Dexie.js dan Cloud Firestore.

---

## 📊 Panduan Fitur Pembukuan & Arus Kas Terpadu

Fitur Pembukuan dirancang untuk menyatukan seluruh perputaran kas masuk dan kas keluar toko Anda dalam satu tampilan cerdas:

1. **Sinkronisasi Otomatis Kasir POS**:
   - Setiap transaksi penjualan yang diselesaikan di meja Kasir (POS) otomatis tercatat ke dalam sistem pembukuan secara *real-time*.
   - Transaksi kasir langsung muncul di panel **Arus Transaksi Keuangan Terbaru** dengan penanda visual khusus badge `KASIR POS`, nomor faktur struk, rincian produk yang dibeli, kasir yang bertugas, dan tombol cetak ulang struk 58mm.
   - Dilengkapi filter cepat untuk memilah transaksi: **Semua**, **Kasir POS (Sinkron)**, **Pemasukan Luar Kasir**, dan **Pengeluaran**.
2. **Pemasukan Luar Kasir**:
   - Mencatat pendapatan operasional toko di luar penjualan produk kasir, seperti jasa transfer uang, tarik tunai, top-up e-wallet, servis HP/elektronik, dan komisi loket pembayaran.
3. **Pengeluaran Operasional Toko**:
   - Mencatat biaya belanja kulakan stok barang/aksesoris, pengisian saldo server pulsa, pembelian kertas thermal, biaya listrik/sewa, dan konsumsi/gaji karyawan.
4. **Fitur Koreksi (Edit & Hapus Transaksi)**:
   - Apabila terdapat kesalahan input nominal, deskripsi, atau kategori, kasir atau admin dapat langsung mengedit atau menghapus catatan transaksi terkait melalui tombol aksi di tabel.
   - Dilengkapi dialog konfirmasi keamanan serta perhitungan ulang saldo dan laba bersih otomatis.
5. **Buku Bon & Piutang Pelanggan**:
   - Catat hutang belanja pelanggan dengan detail nama, nomor telepon, catatan barang, dan tanggal jatuh tempo.
   - Dukungan pembayaran cicilan bertahap dengan pencatatan riwayat pembayaran otomatis hingga status menjadi `LUNAS`.

---

## 🔍 Panduan Fitur StrukScan OCR (Pengenal Struk & Nota AI)

Modul **StrukScan Studio** mempermudah pencatatan nota belanja atau faktur kulakan supplier tanpa perlu mengetik satu per satu secara manual:

1. **Pemindaian Fleksibel**:
   - Ambil foto nota belanja fisik secara langsung menggunakan kamera HP Android / webcam laptop, atau unggah foto gambar nota yang tersimpan di galeri/file komputer.
2. **Ekstraksi Cerdas Berbasis OCR**:
   - Sistem secara otomatis memindai teks pada gambar struk untuk mendeteksi:
     - Nama toko / supplier penyedia barang.
     - Tanggal transaksi nota.
     - Daftar nama produk beserta kuantitas, harga satuan, dan diskon.
     - Total nilai pembayaran dan metode bayar.
3. **Ekspor Cepat 1-Klik**:
   - **Masuk ke Pengeluaran**: Langsung tambahkan total belanja ke catatan pengeluaran pembukuan toko dalam satu kali klik.
   - **Tambah ke Katalog Produk**: Tambahkan item baru dari nota ke master data produk untuk langsung dijual di kasir.

---

## 📄 Lisensi
Hak Cipta © 2026 KasirPro POS. Dibuat untuk sistem kasir modern, cepat, dan handal di Linux & Android.
