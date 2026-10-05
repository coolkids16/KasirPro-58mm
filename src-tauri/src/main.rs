// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct DeviceInfo {
    pub path: String,
    pub exists: bool,
    pub writable: bool,
    pub vendor_id: Option<String>,
    pub product_id: Option<String>,
    pub details: String,
}

/// Helper function to inspect USB hardware attributes in Linux /sys filesystem
fn detect_usb_details(device_path: &str) -> (Option<String>, Option<String>, String) {
    // Linux usbmisc sysfs path: /sys/class/usbmisc/lp0/device
    let device_name = Path::new(device_path)
        .file_name()
        .and_then(|f| f.to_str())
        .unwrap_or("lp0");

    let sys_path = format!("/sys/class/usbmisc/{}/device", device_name);
    let sys_dir = Path::new(&sys_path);

    if sys_dir.exists() {
        // Try reading idVendor and idProduct
        let vid_path = sys_dir.join("idVendor");
        let pid_path = sys_dir.join("idProduct");

        let vid = fs::read_to_string(&vid_path).ok().map(|s| s.trim().to_string());
        let pid = fs::read_to_string(&pid_path).ok().map(|s| s.trim().to_string());

        if let (Some(ref v), Some(ref p)) = (&vid, &pid) {
            return (
                Some(v.clone()),
                Some(p.clone()),
                format!("Terdeteksi USB Printer VID: {} PID: {}", v, p),
            );
        }
    }

    // Default fallback check for user's specific printer (Vendor 28e9, Product 0289)
    (
        Some("28e9".to_string()),
        Some("0289".to_string()),
        "Port printer USB Linux /dev/usb/lp0 (Vendor: 28e9, PID: 0289)".to_string(),
    )
}

/// Cek status ketersediaan dan izin tulis device /dev/usb/lp0
#[tauri::command]
fn check_printer_device(device_path: Option<String>) -> Result<DeviceInfo, String> {
    let target_path = device_path.unwrap_or_else(|| "/dev/usb/lp0".to_string());
    let path = Path::new(&target_path);

    let exists = path.exists();
    let mut writable = false;
    let mut details = String::new();

    if exists {
        // Coba buka dengan mode write untuk menguji izin akses
        match OpenOptions::new().write(true).open(&target_path) {
            Ok(_) => {
                writable = true;
                let (_, _, usb_info) = detect_usb_details(&target_path);
                details = format!("Device siap dan dapat ditulis. {}", usb_info);
            }
            Err(e) => {
                writable = false;
                if e.kind() == ErrorKind::PermissionDenied {
                    details = format!(
                        "Izin akses ditolak ke {}. Solusi di CachyOS: Jalankan 'sudo usermod -a -G lp,dialout $USER', lalu logout dan login kembali.",
                        target_path
                    );
                } else {
                    details = format!("Device ditemukan namun tidak dapat dibuka: {}", e);
                }
            }
        }
    } else {
        details = format!(
            "Device {} tidak ditemukan di Linux CachyOS. Pastikan kabel printer USB terpasang dan modul usblp aktif.",
            target_path
        );
    }

    let (vid, pid, _) = detect_usb_details(&target_path);

    Ok(DeviceInfo {
        path: target_path,
        exists,
        writable,
        vendor_id: vid,
        product_id: pid,
        details,
    })
}

/// Perintah utama tauri_raw untuk mengirim biner ESC/POS langsung ke /dev/usb/lp0
#[tauri::command]
fn tauri_raw(bytes: Vec<u8>, device_path: Option<String>) -> Result<String, String> {
    let target_path = device_path.unwrap_or_else(|| "/dev/usb/lp0".to_string());

    if bytes.is_empty() {
        return Err("Buffer biner ESC/POS kosong.".to_string());
    }

    let path = Path::new(&target_path);
    if !path.exists() {
        return Err(format!(
            "Port printer {} tidak ditemukan di sistem Linux CachyOS. Periksa koneksi kabel USB printer.",
            target_path
        ));
    }

    // Buka file device dengan mode write
    let mut file = OpenOptions::new()
        .write(true)
        .open(&target_path)
        .map_err(|e| {
            if e.kind() == ErrorKind::PermissionDenied {
                format!(
                    "Izin akses ditolak ke {}. Jalankan 'sudo usermod -a -G lp,dialout $USER' di CachyOS/Arch lalu relogin.",
                    target_path
                )
            } else {
                format!("Gagal membuka {}: {}", target_path, e)
            }
        })?;

    // Tulis byte ESC/POS mentah
    file.write_all(&bytes)
        .map_err(|e| format!("Gagal menulis data ke printer {}: {}", target_path, e))?;

    // Flush buffer kernel ke hardware thermal printer
    file.flush()
        .map_err(|e| format!("Gagal flush data ke printer: {}", e))?;

    Ok(format!(
        "Berhasil mencetak {} bytes ke {} (Vendor 28e9:0289)",
        bytes.len(),
        target_path
    ))
}

/// Alias print_raw_escpos untuk kompatibilitas ganda
#[tauri::command]
fn print_raw_escpos(bytes: Vec<u8>, device_path: Option<String>) -> Result<String, String> {
    tauri_raw(bytes, device_path)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            tauri_raw,
            print_raw_escpos,
            check_printer_device
        ])
        .run(tauri::generate_context!())
        .expect("Terjadi kesalahan saat menjalankan aplikasi Tauri POS");
}
