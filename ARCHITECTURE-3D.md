# 🏛️ HERMES 3D SPATIAL DIGITAL TWIN ARCHITECTURE & SPECIFICATION

**Aplikasi:** Hermes 3D Spatial Studio  
**Direktori:** `/home/yes/Documents/Project/Playground/hermes-3d-hq`  
**Port Dedicated:** `:3500`  
**Arsitektur:** Procedural Low-Poly Three.js (WebGL) + Node.js Express Backend  
**Status Ekosistem:** Berjalan paralel berdampingan dengan Kantor 2D (`:3200`) tanpa saling mengganggu.

---

## 1. 🎯 PRINSIP DESAIN SPASIAL (ISOMETRIC LOW-POLY)

1. **Lightweight & Battery-Aware:**
   * Tidak menggunakan file model `.gltf` atau `.fbx` berukuran puluhan megabyte. Seluruh furnitur, sekat partisi, dan karakter avatar di-generate secara prosedural menggunakan geometri Three.js primitive (`BoxGeometry`, `CylinderGeometry`, `DodecahedronGeometry`) yang dioptimasi.
   * Ukuran bundle statis seluruh aset < 1.5 MB, memastikan waktu pemuatan instant (< 1 detik) di laptop maupun Safari iPhone 12.
2. **Zero AI-Slop Visual Standard:**
   * Palet warna *Linear/Vercel Slate* (`#060810`, `#0f1422`, `#1e2638`).
   * Material *Matte/Physical Clay* dengan kekasaran (*roughness*) proporsional dan pencahayaan studio terarah (*soft directional shadows* + *ambient point lights*).
3. **High-DPI Retina Ready:**
   * Skalabilitas canvas dinamis mengikuti `window.devicePixelRatio` (hingga 2.0x/3.0x di iPhone) dengan garis grid dan sudut tajam.

---

## 2. 🗺️ PEMETAAN KOORDINAT 4 ZONA SPASIAL 3D (64 x 56 Units)

Ruangan kantor 3D berada pada bidang X: `[-32, 32]` dan Z: `[-28, 28]`:

```
                 [ ZONA 2: KANBAN WAR ROOM ]        |        [ ZONA 4: CRON TOWER ]
                 X: [-26, -4], Z: [-24, -4]         |        X: [4, 28], Z: [-24, -4]
                 - Glass Whiteboard 3D              |        - 4 Unit Server Racks 3D
                 - Round Meeting Table              |        - Holographic Telemetry Screen
                 -----------------------------------+---------------------------------
                 [ ZONA 1: WORKSTATION PODS ]       |        [ ZONA 3: BREAK LOUNGE ]
                 X: [-26, -4], Z: [4, 24]           |        X: [4, 28], Z: [4, 24]
                 - 5 Engineer Desks & Monitors      |        - Espresso Bar Counter & Coffee
                 - HANYA DITEMPATI AGEN WORKING     |        - L-Sofa & Round Table
                 - (Kagura, Agent D, A, B, C)       |        - Retro 3D Arcade Machine
                                                    |        - TEMPAT SELURUH AGEN IDLE
```

---

## 3. ⚙️ REAL-TIME TELEMETRY ENGINE INTEGRATION

Modul backend `telemetry-service.js` menghubungkan aplikasi secara langsung ke sumber kebenaran SQLite di mesin lokal Mas Fauzi:
1. **`~/.hermes/state.db` (Turn Leases):**
   * Jika ada giliran eksekusi aktif (`session_turn_leases > 0`), agen berstatus `WORKING`.
   * Avatar berjalan mulus menuju posisi meja kerjanya di Zona 1, indikator gem di atas kepala menyala hijau (`#10b981`), dan monitor komputer menyala.
2. **Fallback Status Idle:**
   * Jika agen tidak memiliki giliran kerja, status otomatis menjadi `IDLE`.
   * Avatar berpindah ke Zona 3 (Break Lounge) untuk menikmati kopi, duduk di sofa, atau bermain arcade machine.
3. **`~/.hermes/kanban/boards/ai-studio/kanban.db` (Kanban Sprint):**
   * Menampilkan data tugas aktif sprint dan riwayat 27 tugas yang telah terselesaikan.
4. **`~/.hermes/cron/` (Scheduler Heartbeat):**
   * Memvalidasi detak scheduler otomatis dan jadwal briefing harian 08:30 WIB.

---

## 4. 🔒 KEAMANAN & INTEGRASI SSO ENTERPRISE

* Dilindungi oleh `sso-guard.js` dengan enkripsi token HMAC-SHA256 (`enterprise_sso_token`).
* Pintu masuk tunggal: Pengguna yang telah login di Enterprise App Center (:3000) otomatis terautentikasi tanpa harus login ulang.
* Aset vendor statis Three.js disajikan melalui `/vendor/` publik mandiri untuk efisiensi loading tanpa celah keamanan data.
