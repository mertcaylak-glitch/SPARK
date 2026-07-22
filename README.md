# 🌐 SPARK | Akıllı Şebeke Reaktif Güç Takip, Saatlik Tahmin ve Karar Destek Sistemi

**SPARK**, Türkiye Elektrik İletim A.Ş. (**TEİAŞ**) trafo merkezlerinin saatlik yük verilerini (`YYYY-MM-DD HH:mm`) kullanarak aktif, endüktif ve kapasitif enerji tüketimlerini gerçek zamanlı izleyen; EPDK reaktif ceza sınırlarına karşı yapay zeka/istatistiksel modellerle **saatlik ay sonu ceza projeksiyonu** sunan ve mühendislik müdahallerini simüle eden gelişmiş bir **SCADA ve Karar Destek Sistemidir**.

---

## 🎯 Projenin Amacı ve Çözdüğü Problem

Türkiye'de **EPDK (Enerji Piyasası Düzenleme Kurumu)** mevzuatına göre kurulu gücü 50 kVA ve üzeri olan tüketicilerin ya da iletim/dağıtım noktalarının aylık kümülatif reaktif enerji tüketim oranlerinin belirli sınırları aşması durumunda **Reaktif Güç Cezası** uygulanır:
* **Endüktif Sınır:** $\frac{\text{Kümülatif Endüktif}}{\text{Kümülatif Aktif}} \le$ **%20**
* **Kapasitif Sınır:** $\frac{\text{Kümülatif Kapasitif}}{\text{Kümülatif Aktif}} \le$ **%15**

**Karşılaşılan Temel Sorunlar:**
1. **Günlük/Aylık Körlük:** Geleneksel sistemlerde takipler günlük veya aylık fatura dönemlerinde yapılır; ay sonundaki kümülatif ceza riski önceden fark edilemez.
2. **Saatlik Sabit Yük Etkisi:** Özellikle yer altı kablosu yoğun olan bölgelerdeki (örneğin Ümraniye TM) trafolarda gece veya hafta sonu aktif yük ($kWh$) düştüğünde, sabit kapasitif yükler ($kVArh$) nedeniyle saatlik kapasitif oran aniden **%25-%30** seviyelerine fırlayarak ay sonu kümülatif ortalamasını bozar.
3. **Simülasyon Eksikliği:** Risk oluştuğunda *şönt reaktör devreye alma* veya *yük kaydırma* gibi müdahalelerin ay sonuna ne kadar fayda sağlayacağı matematiksel olarak test edilmeden ezbere işlem yapılır.

**SPARK'ın Sunduğu Çözüm:**
SPARK, doğrudan TEİAŞ'tan alınan **19.452 saatlik gerçek trafo verisiyle** çalışır. Yalnızca mevcut durumu göstermekle kalmaz; **6 farklı saatlik zaman serisi algoritmasıyla** ay sonunun kalan tüm saatleri için kümülatif oranı önceden tahmin eder, canlı verilerle **Backtesting** (Çapraz Doğrulama) yaparak modelin güven skorunu hesaplar, **SCADA Tek Hat Şeması** üzerinde anlık güç üçgenlerini çizer ve yapılacak müdahalelerin kesin tasarruf miktarını simüle eder.

---

## ⚡ Gerçek TEİAŞ Saatlik Veri Seti (`TEİAŞ TM YÜKLERİ`)

Proje kapsamında tüm yapay ve günlük özet veriler kaldırılmış, yerine **2025 yılı (1 Ocak 00:00 - 22 Temmuz 14:00)** aralığını kapsayan gerçek TEİAŞ saatlik yük kayıtları (`js/data.js` içine `_RAW_DATA` olarak) entegre edilmiştir.

### Tanımlı Trafo Merkezleri:
* 🏙️ **Ümraniye TM – TRA (`UMR-TRA`)**: `100 MVA` Güç, Yer altı kablolu ağ yapısı.
* 🏙️ **Ümraniye TM – TRB (`UMR-TRB`)**: `100 MVA` Güç, Yer altı kablolu ağ yapısı (**%12 - %14.8** kümülatif kapasitif oran ile en kritik takip trafosu).
* ⚓ **Kartal TM – TRA (`KRT-TRA`)**: `80 MVA` Güç, Karma (Kablo + Havai hat) ağ yapısı.
* ⚓ **Kartal TM – TRB (`KRT-TRB`)**: `80 MVA` Güç, Karma (Kablo + Havai hat) ağ yapısı.

> [!NOTE]
> Sistem her trafo için saatlik **Aktif Enerji ($kWh$)**, **Endüktif Reaktif Enerji ($kVArh$)** ve **Kapasitif Reaktif Enerji ($kVArh$)** kayıtlarını işler; hem saatlik bazda hem de ay başından itibaren kümülatif bazda oranlama yapar.

---

## 🖥️ Sistem Ekranları ve Modüller

### 1. 📊 Genel Görünüm (Dashboard)
* **Gerçek Zamanlı Özet Paneli:** Ümraniye ve Kartal trafo merkezlerinin kümülatif aktif, endüktif ve kapasitif tüketimleri ile veri süresinin (örneğin: `22 Gün (519 sa)`) gösterimi.
* **Akıllı Risk Rozetleri:** Her trafo için EPDK sınırlarına göre dinamik statü takibi:
  * 🟢 **Güvenli Yeşil Bölge** (`Kapasitif Oran < %12`)
  * 🟡 **Uyarı Sarı Bölge** (`%12 <= Kapasitif Oran < %15`)
  * 🔴 **Ceza Kırmızı Bölge** (`Kapasitif Oran >= %15`)
* **Dinamik Grafikler:** Trafolar arası kümülatif oranların bar grafiği ve enerji dağılımlarının doughnut (halka) grafiği olarak `Chart.js` ile görselleştirilmesi.

### 2. 🔌 Trafo Detay Analizi & Saatlik Veri Yönetimi
* **Saatlik ve Günlük Döküm:** Seçilen trafonun ay başından son saat kaydına kadar tüm tüketim değerleri, saatlik kapasitif/endüktif oranları ve kümülatif ilerleyişi.
* **Kümülatif vs Çizgi Grafiği:** Saatlik dalgalanmalar ile ayı domine eden kümülatif ortalamanın zaman damgalarına (`YYYY-MM-DD HH:mm`) göre hassas grafiği.
* **Tarih ve Saat Bazlı Filtreleme & Operatör Girişi:** Operatörlerin yeni saatlik veri ekleyebildiği veya geçmiş kayıtları güncelleyebildiği, anında tüm motorları reaktif olarak çalıştıran arayüz.

### 3. 🌐 Şebeke Topolojisi & SCADA Tek Hat Şeması
* **Vektörel SCADA Izgarası:** Ana baradan (`154 kV / 33.1 kV Dağıtım Barası`) Ümraniye ve Kartal trafolarına doğru akan enerjiyi animasyonlu parçacıklarla (`flowLine`) gösteren endüstriyel şema.
* **Dinamik LED Alarm Bildirimleri:** Trafonun risk statüsüne göre kart üzerinde yanıp sönen animasyonlu LED sinyalleri (`@keyframes scadaPulse`).
* **Akıllı Fazör & Güç Üçgeni Pop-up Modalı:** Trafoya tıklandığında HTML5 Canvas üzerinde anlık çizilen interaktif güç üçgeni:
  * **Aktif Güç ($P$):** $kW$ cinsinden iş yapan faydalı güç,
  * **Reaktif Güç ($Q$):** $kVAr$ cinsinden manyetik/kapasitif kayıp güç ($Q > 0$ Endüktif, $Q < 0$ Kapasitif),
  * **Görünür Güç ($S$):** $kVA$ cinsinden hipotenüs ($S = \sqrt{P^2 + Q^2}$),
  * **Güç Faktörü ($\cos\varphi$):** Sistemin verimlilik açısı ($\varphi$).

### 4. 📈 Saatlik Ay Sonu Tahminci & Karar Destek Simülasyonu
* **Saatlik Zaman Serisi Tahmin Motoru (`Time-Series Forecasting`):**
  Aydaki kalan tüm saatler için (örneğin Temmuz ayındaki mevcut 519 saatin devamındaki 225 saat için) saatlik bazda ileri yönlü projeksiyon üretilir:
  1. **🚀 Topluluk Modeli (Ensemble):** Holt-Winters (%50) + Regresyon (%30) + Geçen Hafta (%20) ağırlıklı hibrit model.
  2. **📈 Holt-Winters Üçlü Üssel Düzeltme:** Gün içi saatlik (`24 saat`) ve haftalık (`168 saat`) mevsimsel döngü ile trendi ayrıştıran en hassas saatlik model.
  3. **📉 Doğrusal Regresyon (Trend):** Son 336 saatin (14 gün) yük artış/azalış eğim katsayısına göre doğrusal projeksiyon.
  4. **⚖️ Ağırlıklı Ortalama:** Hafta içi ve hafta sonu gün tiplerine göre ayrıştırılmış saat ortalamaları.
  5. **🔄 Geçen Hafta Tekrarı (Persistence):** Son 168 saatin (1 hafta) birebir tekrarı (Baseline model).
  6. **📅 Geçen Ay Emsal:** Bir önceki ayın aynı gün ve saat verilerini baz alan emsal model.
* **⚡ Canlı Backtesting (Geriye Dönük Çapraz Doğrulama) Motoru:**
  * Sistem, girilen geçmiş saatlik verilerin son 168 saatini test seti olarak ayırıp modelin tahmin başarısını sınar.
  * **MAPE (Ortalama Mutlak Yüzde Hata)** ve **Ortalama Puan Sapması** hesaplanarak o trafoya ve veriye özel **Canlı Model Güven Skoru (`%65.0 - %99.6`)** üretilir.
* **🔬 Müdahale Senaryo Simülasyonu:**
  * **Senaryo Türleri:** Şönt Reaktör Devreye Alma ($kVArh$ sönümleme), Yük Transferi ($kWh$ ekleme), Yeraltı Kablo Çıkarma.
  * **Akıllı Öneriler:** Trafonun saatlik reaktif yük durumuna göre otomatik reaktör veya yük transferi önerisi.
  * **Mühendislik Raporu:** Müdahalesiz kümülatif oran ile simülasyon sonrası oranın saat saat kıyaslanması; ceza sınırının altına inildiğinde fırlatılan başarı bildirimi ve odaklı karşılaştırma grafiği.

---

## 🛠️ Teknoloji Yığıtı & Mimari

* **Ön Yüz (Frontend Core):** Saf HTML5, CSS3 (Modern Glassmorphism, CSS Grid, Koyu Tema Tasarım Sistemi).
* **Masaüstü/Tarayıcı Mantığı:** Vanilla JavaScript (`ES6+`).
* **Modüler IIFE Mimarisi:** Global ad alanı kirliliğini önleyen **IIFE (Immediately Invoked Function Expression)** tabanlı mikro modül yapısı.
* **Görselleştirme:**
  * `Chart.js` & `chartjs-plugin-annotation` (EPDK %15 sınır çizgileri, dinamik eksen ölçeklendirmesi ve özel saatlik araç ipuçları).
  * `HTML5 Canvas 2D API` (Fazör Güç Üçgeni ve açı vektörleri çizimi).
* **Veri Yönetimi:** Bellek içi hızlı hesaplama haritaları (`_veriMap`) ve saatlik tarih dizini arama motoru.

---

## 📁 Dosya ve Klasör Yapısı

```text
SPARK/
├── index.html                  # Ana uygulama iskeleti, navigasyon barı ve SCADA/Modal tanımları
├── README.md                   # Proje dokümantasyonu (Bu dosya)
├── css/
│   └── style.css               # Tasarım sistemi, glassmorphism, SCADA ızgarası ve animasyonlar
└── js/
    ├── app.js                  # Uygulama denetleyicisi (Controller), DOM etkileşimleri ve State
    ├── data.js                 # Veri modülü (VeriModulu) - 19.452 satırlık TEİAŞ 2025 saatlik veritabanı
    ├── calculations.js         # Hesaplama modülü (HesaplamaModulu) - Saatlik & aylık EPDK formülleri
    ├── charts.js               # Grafik modülü (GrafikModulu) - Chart.js yapılandırmaları ve eksenler
    ├── forecast.js             # Tahmin modülü (TahminModulu) - 6 saatlik tahmin modeli & Canlı Backtesting
    ├── scenarios.js            # Senaryo modülü (SenaryoModulu) - Müdahale simülasyon matematigi
    └── topology.js             # Topoloji modülü (TopolojiModulu) - SCADA Tek Hat & Canvas Güç Üçgeni
```

---

## 🚀 Kurulum ve Çalıştırma

Proje tamamen statik ve tarayıcı tabanlı modern web teknolojileriyle geliştirildiği için herhangi bir **Node.js sunucusu, Python arka plan servisi veya dış veritabanı kurulumu gerektirmez.**

1. Proje klasörünü bilgisayarınıza indirin veya klonlayın:
   ```bash
   git clone https://github.com/kullaniciadi/SPARK.git
   cd SPARK
   ```
2. Klasör içindeki **`index.html`** dosyasını doğrudan çift tıklayarak modern bir web tarayıcısında (Chrome, Edge, Safari, Firefox) açın.
3. *(Alternatif)* VS Code kullanıyorsanız, `Live Server` eklentisi ile `index.html` dosyasına sağ tıklayıp **"Open with Live Server"** diyerek canlı geliştirme modunda çalıştırabilirsiniz.

---

<p align="center">
  <b>SPARK</b> — Akıllı Şebekeler İçin Geliştirilmiş Saatlik Reaktif Güç Yönetim ve Karar Destek Platformu.
</p>
