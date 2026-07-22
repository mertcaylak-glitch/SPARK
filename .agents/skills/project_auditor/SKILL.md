---
name: project_auditor
description: SPARK projesindeki tüm dosyaların, README dokümantasyonunun, yüklenen saatlik verilerin (_RAW_DATA/TRAFOLAR) ve modüller arası API sözleşmelerinin uyumunu denetleyen otonom denetim yeteneği.
---

# SPARK Otonom Proje & Dosya Denetçi Ajanı (Self-Diagnostic & Verification Skill)

Bu yetenek (`Skill`), SPARK şebeke takip ve karar destek sisteminde dosyalarda yapılan değişikliklerin ardından projenin kendi kendini denetlemesini sağlar.

## 🤖 Denetim Kapsamı

### 1. Dosya Varlığı ve Klasör Yapısı (README vs Kod)
* `README.md` içinde listelenen tüm dosyaların (`index.html`, `css/style.css`, `js/data.js`, `js/calculations.js`, `js/forecast.js`, `js/scenarios.js`, `js/charts.js`, `js/topology.js`, `js/app.js`, `js/agent.js`, `audit.html`) disk üzerinde mevcut olup olmadığını doğrula.

### 2. Yüklenen Veriler ve Kullanılan Verilerin Uyumu (`Data Integrity Audit`)
* `js/data.js` içindeki `TRAFOLAR` tanımlarını (`id`, `adi`, `bolge`, `kapasite`) denetle (`UMR-TRA`, `UMR-TRB`, `KRT-TRA`, `KRT-TRB`).
* `_RAW_DATA` veritabanındaki 19.452+ satırı denetle:
  - Her satırın `[trafoId, tarih, aktif, enduktif, kapasitif]` yapısında olduğunu doğrula.
  - Satırlardaki `trafoId` değerlerinin `TRAFOLAR` dizisinde tanımlı bir ID olduğunu çapraz kontrol et.
  - Sayısal bütünlüğü (`NaN`, negatif enerji değerleri) denetle.
* Diğer modüllerin (`calculations.js`, `forecast.js`, `scenarios.js`, `charts.js`, `topology.js`, `app.js`) sadece geçerli trafo özelliklerini ve EPDK ceza sınırlarını (`%20` endüktif, `%15` kapasitif) kullandığını doğrula.

### 3. HTML $\leftrightarrow$ JS DOM Senkronizasyon Denetimi
* `js/*.js` dosyalarında geçen `document.getElementById('ID')` veya `querySelector('#ID')` referanslarını topla.
* Aranan her ID'nin `index.html` veya ilgili arayüz dosyasında tanımlı olduğunu doğrula.

### 4. Modüller Arası API Sözleşmesi & Çağrı Denetimi
* IIFE modüllerinin (`return { ... }`) dışa aktardığı tüm API'leri doğrula (`VeriModulu`, `HesaplamaModulu`, `TahminModulu`, `SenaryoModulu`, `GrafikModulu`, `TopolojiModulu`, `App`, `AjanModulu`).
* Çapraz modül çağrılarını (`ModulAdi.fonksiyon(...)`) denetleyerek eksik, yanlış yazılmış veya silinmiş fonksiyon çağrılarını tespit et.

### 5. Çalıştırma Yöntemleri
1. **Tarayıcı İçi Görsel Paneli (`audit.html`):**
   Kullanıcı doğrudan `audit.html` dosyasını tarayıcıda açarak anlık, görsel ve kartlı sağlık raporunu inceleyebilir veya `index.html` üst menüsündeki **"🤖 Ajan Denetimi"** butonuna tıklayabilir.
2. **Tarayıcı Konsol Ajanı:**
   Tarayıcı geliştirici konsolunda `AjanModulu.calistir()` komutu çalıştırılarak anlık konsol raporu alınabilir.
3. **Terminal / CLI Denetimi (Node.js mevcutsa):**
   ```bash
   node scripts/verify-project.js
   ```
