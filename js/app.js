// ============================================
// app.js - Ana Uygulama Mantığı
// Reaktif Güç Takip ve Analiz Sistemi
// ============================================

const App = (() => {
    'use strict';

    // ─── Sabitler ───
    const AY_ADLARI = [
        'Ocak','Şubat','Mart','Nisan','Mayıs','Haziran',
        'Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'
    ];
    const GUN_ADLARI = ['Pazar','Pazartesi','Salı','Çarşamba','Perşembe','Cuma','Cumartesi'];
    const GUN_KISA = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];

    // ─── Uygulama Durumu ───
    let state = {
        currentScreen: 'dashboard',
        selectedTrafoId: null,
        selectedAy: 7,   // 1-12
        selectedYil: 2025,
        selectedYontem: 'ensemble',
    };

    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    function init() {
        // Eğer sayfa ana index.html değilse (örneğin audit.html) DOM elementleri yoksa çık
        if (!document.getElementById('current-date')) return;

        // Tarih gösterimi
        document.getElementById('current-date').textContent = formatDisplayDate(VeriModulu.BUGUN);

        // Tema yönetimi
        initTheme();

        // Varsayılan trafo
        state.selectedTrafoId = VeriModulu.getTrafolar()[0].id;

        // Select doldur
        populateTrafoSelects();

        // Navigasyon
        setupNavigation();

        // Form handler'lar
        setupFormHandlers();

        // Senaryo formu
        setupSenaryoForm();

        // Topoloji Modülü
        if (typeof TopolojiModulu !== 'undefined') {
            TopolojiModulu.init();
        }

        // İlk ekranı çiz
        renderDashboard();
    }

    // ─── Tarih Formatlama ───
    function formatDisplayDate(dateStr) {
        const d = VeriModulu.parseDate(dateStr);
        return `${d.getDate()} ${AY_ADLARI[d.getMonth()]} ${d.getFullYear()}`;
    }

    // ═══════════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════════

    function setupNavigation() {
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                navigate(btn.dataset.screen);
            });
        });
    }

    function navigate(screen) {
        // Nav butonları güncelle
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        document.querySelector(`[data-screen="${screen}"]`)?.classList.add('active');

        // Ekranları göster/gizle
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const el = document.getElementById(`screen-${screen}`);
        if (el) el.classList.add('active');

        state.currentScreen = screen;

        // Ekran içeriğini çiz
        switch (screen) {
            case 'dashboard': 
                renderDashboard(); 
                if (state.dashboardView === 'scada' && typeof TopolojiModulu !== 'undefined') {
                    TopolojiModulu.render();
                }
                break;
            case 'veri-giris': renderVeriGiris(); break;
            case 'trafo-detay': renderTrafoDetay(); break;
            case 'tahmin': renderTahmin(); break;
        }
    }

    // ═══════════════════════════════════════════
    // SELECT POPULATE
    // ═══════════════════════════════════════════

    function populateTrafoSelects() {
        const trafolar = VeriModulu.getTrafolar();
        const selectIds = ['input-trafo', 'table-trafo-filter', 'detay-trafo-select', 'tahmin-trafo-select'];

        selectIds.forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            sel.innerHTML = '';
            if (id === 'table-trafo-filter') {
                const optAll = document.createElement('option');
                optAll.value = '';
                optAll.textContent = 'Tüm Trafolar';
                sel.appendChild(optAll);
            }
            trafolar.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.adi;
                sel.appendChild(opt);
            });
        });

        // Change listeners
        document.getElementById('detay-trafo-select')?.addEventListener('change', (e) => {
            state.selectedTrafoId = e.target.value;
            renderTrafoDetay();
        });
        const syncAySelects = (newAy) => {
            state.selectedAy = newAy;
            const detayAy = document.getElementById('detay-ay-select');
            const topolojiAy = document.getElementById('topoloji-ay-select');
            if (detayAy && parseInt(detayAy.value, 10) !== newAy) detayAy.value = newAy;
            if (topolojiAy && parseInt(topolojiAy.value, 10) !== newAy) topolojiAy.value = newAy;
        };

        document.getElementById('detay-ay-select')?.addEventListener('change', (e) => {
            const newAy = parseInt(e.target.value, 10);
            syncAySelects(newAy);
            renderTrafoDetay();
        });
        document.getElementById('topoloji-ay-select')?.addEventListener('change', (e) => {
            const newAy = parseInt(e.target.value, 10);
            syncAySelects(newAy);
            if (typeof TopolojiModulu !== 'undefined') {
                TopolojiModulu.render();
            }
        });
        document.getElementById('tahmin-trafo-select')?.addEventListener('change', (e) => {
            state.selectedTrafoId = e.target.value;
            renderTahmin();
            if (document.getElementById('senaryo-sonuc')?.style.display !== 'none') {
                runSenaryo(false);
            }
        });
        const syncYontemSelects = (newYontem) => {
            state.selectedYontem = newYontem;
            const detayY = document.getElementById('detay-yontem-select');
            const tahminY = document.getElementById('tahmin-yontem-select');
            if (detayY && detayY.value !== newYontem) detayY.value = newYontem;
            if (tahminY && tahminY.value !== newYontem) tahminY.value = newYontem;
        };

        document.getElementById('detay-yontem-select')?.addEventListener('change', (e) => {
            syncYontemSelects(e.target.value);
            renderTrafoDetay();
        });
        document.getElementById('tahmin-yontem-select')?.addEventListener('change', (e) => {
            syncYontemSelects(e.target.value);
            renderTahmin();
            if (document.getElementById('senaryo-sonuc')?.style.display !== 'none') {
                runSenaryo(false);
            }
        });
        document.getElementById('table-trafo-filter')?.addEventListener('change', () => {
            renderVeriTablosu();
        });
    }

    // ═══════════════════════════════════════════
    // SCREEN 1: DASHBOARD
    // ═══════════════════════════════════════════

    function renderForecastBanner(ozetler) {
        if (!ozetler) {
            const hamOzetler = HesaplamaModulu.tumTrafoOzetleri(state.selectedYil, state.selectedAy);
            ozetler = hamOzetler.map(({ trafo, ozet }) => {
                if (!ozet) return { trafo, ozet: null, tahminOzet: null };
                let tahminOzet = null;
                try {
                    if (typeof TahminModulu !== 'undefined') {
                        const tSonuc = TahminModulu.aySonuTahminiYap(trafo.id, state.selectedYil, state.selectedAy, state.selectedYontem || 'ensemble');
                        if (tSonuc && tSonuc.tumVeriler) {
                            tahminOzet = HesaplamaModulu.aylikOzetHesapla(tSonuc.tumVeriler);
                        }
                    }
                } catch (e) {
                    console.warn('Tahmin hatası:', e);
                }
                return { trafo, ozet, tahminOzet };
            });
        }
        if (!ozetler || ozetler.length === 0) return;

        let toplamTahminAktif = 0;
        let toplamTahminKapasitif = 0;
        let toplamMevcutAktif = 0;
        let toplamMevcutKapasitif = 0;
        let riskliTahminTrafolar = [];
        let dikkatTahminTrafolar = [];

        ozetler.forEach(({ trafo, ozet, tahminOzet }) => {
            if (ozet) {
                toplamMevcutAktif += ozet.toplamAktif;
                toplamMevcutKapasitif += ozet.toplamKapasitif;
            }
            if (tahminOzet) {
                toplamTahminAktif += tahminOzet.toplamAktif;
                toplamTahminKapasitif += tahminOzet.toplamKapasitif;
                if (tahminOzet.kapasitifOran >= HesaplamaModulu.SINIRLAR.kapasitif) {
                    riskliTahminTrafolar.push({ trafo, tahminOzet, mevcutOzet: ozet });
                } else if (tahminOzet.kapasitifOran >= 12) {
                    dikkatTahminTrafolar.push({ trafo, tahminOzet, mevcutOzet: ozet });
                }
            }
        });

        const genelTahminOran = HesaplamaModulu.oranHesapla(toplamTahminKapasitif, toplamTahminAktif);
        const genelMevcutOran = HesaplamaModulu.oranHesapla(toplamMevcutKapasitif, toplamMevcutAktif);

        let bannerHTML = '';
        if (riskliTahminTrafolar.length > 0) {
            bannerHTML = `
                <div class="forecast-alert-card alert-card-riskli">
                    <div class="forecast-alert-left">
                        <div class="forecast-alert-icon">🔴</div>
                        <div class="forecast-alert-text">
                            <h3>AY SONU PROJEKSİYONU & RİSK BİLDİRİMİ <span class="badge badge-tehlikeli" style="margin-left:8px;">🚨 Ceza Sınırı Aşım Riski!</span></h3>
                            <p>
                                Mevcut kullanım trendi devam ederse ay sonunda tesis geneli kapasitif oranı <strong>%${HesaplamaModulu.formatSayi(genelTahminOran)}</strong> seviyesine ulaşacaktır (Mevcut: %${HesaplamaModulu.formatSayi(genelMevcutOran)}).
                                <br>⚠️ <strong>${riskliTahminTrafolar.length} adet trafoda (${riskliTahminTrafolar.map(t => `${t.trafo.adi}: <b>%${HesaplamaModulu.formatSayi(t.tahminOzet.kapasitifOran)}</b>`).join(', ')})</strong> ay sonuna kadar %15 yasal ceza sınırının aşılması beklenmektedir! Acil şönt reaktör devreye alma veya yük transferi önerilir.
                            </p>
                        </div>
                    </div>
                    <div class="forecast-alert-right">
                        <div class="forecast-alert-metric-box">
                            <div class="forecast-alert-metric-label">Ay Sonu Tahmini</div>
                            <div class="forecast-alert-metric-val" style="color: var(--color-danger)">%${HesaplamaModulu.formatSayi(genelTahminOran)}</div>
                        </div>
                        <button class="forecast-alert-btn btn btn-primary" onclick="App.navigateToTrafo('${riskliTahminTrafolar[0].trafo.id}')" style="background: var(--color-danger); border: none;">
                            ⚡ Riskli Trafoyu İncele
                        </button>
                    </div>
                </div>
            `;
        } else if (dikkatTahminTrafolar.length > 0) {
            bannerHTML = `
                <div class="forecast-alert-card alert-card-dikkat">
                    <div class="forecast-alert-left">
                        <div class="forecast-alert-icon">🟡</div>
                        <div class="forecast-alert-text">
                            <h3>AY SONU PROJEKSİYONU & DİKKAT BİLDİRİMİ <span class="badge badge-dikkat" style="margin-left:8px;">⚠️ Uyarı Eşiği</span></h3>
                            <p>
                                Mevcut kullanım trendi devam ederse ay sonunda tesis geneli kapasitif oranı <strong>%${HesaplamaModulu.formatSayi(genelTahminOran)}</strong> seviyesine ulaşacaktır (Mevcut: %${HesaplamaModulu.formatSayi(genelMevcutOran)}).
                                <br>🟡 Hiçbir trafo %15 ceza sınırını aşmayacak olsa da, <strong>${dikkatTahminTrafolar.length} adet trafoda (${dikkatTahminTrafolar.map(t => `${t.trafo.adi}: <b>%${HesaplamaModulu.formatSayi(t.tahminOzet.kapasitifOran)}</b>`).join(', ')})</strong> %12 uyarı sınırının üzerinde seyredilecektir.
                            </p>
                        </div>
                    </div>
                    <div class="forecast-alert-right">
                        <div class="forecast-alert-metric-box">
                            <div class="forecast-alert-metric-label">Ay Sonu Tahmini</div>
                            <div class="forecast-alert-metric-val" style="color: var(--color-warning)">%${HesaplamaModulu.formatSayi(genelTahminOran)}</div>
                        </div>
                        <button class="forecast-alert-btn btn btn-outline" onclick="App.navigateToTrafo('${dikkatTahminTrafolar[0].trafo.id}')">
                            🔍 Detayları Gör
                        </button>
                    </div>
                </div>
            `;
        } else {
            bannerHTML = `
                <div class="forecast-alert-card alert-card-guvenli">
                    <div class="forecast-alert-left">
                        <div class="forecast-alert-icon">🟢</div>
                        <div class="forecast-alert-text">
                            <h3>AY SONU PROJEKSİYONU & RİSK BİLDİRİMİ <span class="badge badge-guvenli" style="margin-left:8px;">✅ Tamamen Güvenli</span></h3>
                            <p>
                                Harika! Tesis geneli ay sonu tahmini kapasitif oranı <strong>%${HesaplamaModulu.formatSayi(genelTahminOran)}</strong> ile güvenli yeşil bölgede öngörülmektedir (Mevcut: %${HesaplamaModulu.formatSayi(genelMevcutOran)}).
                                <br>🎉 Tüm trafoların ay sonuna kadar hem %15 yasal ceza sınırının hem de %12 uyarı eşiğinin çok altında kalarak konforlu bir şekilde ayı tamamlaması bekleniyor.
                            </p>
                        </div>
                    </div>
                    <div class="forecast-alert-right">
                        <div class="forecast-alert-metric-box">
                            <div class="forecast-alert-metric-label">Ay Sonu Tahmini</div>
                            <div class="forecast-alert-metric-val" style="color: var(--color-success)">%${HesaplamaModulu.formatSayi(genelTahminOran)}</div>
                        </div>
                        <button class="forecast-alert-btn btn btn-outline" onclick="App.navigate('tahmin')">
                            📈 Tahmin Detayları
                        </button>
                    </div>
                </div>
            `;
        }

        const bannerCharts = document.getElementById('dashboard-forecast-banner');
        const bannerScada = document.getElementById('scada-forecast-banner');
        if (bannerCharts) bannerCharts.innerHTML = bannerHTML;
        if (bannerScada) bannerScada.innerHTML = bannerHTML;
    }

    function renderDashboard() {
        const hamOzetler = HesaplamaModulu.tumTrafoOzetleri(state.selectedYil, state.selectedAy);
        const ozetler = hamOzetler.map(({ trafo, ozet }) => {
            if (!ozet) return { trafo, ozet: null, tahminOzet: null };
            let tahminOzet = null;
            try {
                if (typeof TahminModulu !== 'undefined') {
                    const tSonuc = TahminModulu.aySonuTahminiYap(trafo.id, state.selectedYil, state.selectedAy, state.selectedYontem || 'ensemble');
                    if (tSonuc && tSonuc.tumVeriler) {
                        tahminOzet = HesaplamaModulu.aylikOzetHesapla(tSonuc.tumVeriler);
                    }
                }
            } catch (e) {
                console.warn('Tahmin hatası:', e);
            }
            return { trafo, ozet, tahminOzet };
        });

        // ── Ay Sonu Tahmin Barını Göster ──
        renderForecastBanner(ozetler);

        // ── KPI Kartları ──
        let guvenliSayisi = 0, dikkatSayisi = 0, riskliSayisi = 0, tehlikeliSayisi = 0;
        let toplamAktif = 0, toplamEnduktif = 0, toplamKapasitif = 0;

        ozetler.forEach(({ ozet }) => {
            if (!ozet) return;
            toplamAktif += ozet.toplamAktif;
            toplamEnduktif += ozet.toplamEnduktif;
            toplamKapasitif += ozet.toplamKapasitif;

            const sev = ozet.kapasitifRisk.seviye;
            if (sev === 'guvenli' || sev === 'normal') guvenliSayisi++;
            else if (sev === 'dikkat') dikkatSayisi++;
            else if (sev === 'riskli') riskliSayisi++;
            else tehlikeliSayisi++;
        });

        document.getElementById('summary-cards').innerHTML = `
            <div class="summary-card card-total">
                <div class="card-icon">⚡</div>
                <div class="card-content">
                    <div class="card-value">${ozetler.length}</div>
                    <div class="card-label">Toplam Trafo</div>
                </div>
            </div>
            <div class="summary-card card-safe">
                <div class="card-icon">✅</div>
                <div class="card-content">
                    <div class="card-value">${guvenliSayisi}</div>
                    <div class="card-label">Güvenli / Normal</div>
                </div>
            </div>
            <div class="summary-card card-warning">
                <div class="card-icon">⚠️</div>
                <div class="card-content">
                    <div class="card-value">${dikkatSayisi + riskliSayisi}</div>
                    <div class="card-label">Dikkat / Riskli</div>
                </div>
            </div>
            <div class="summary-card card-danger">
                <div class="card-icon">🔴</div>
                <div class="card-content">
                    <div class="card-value">${tehlikeliSayisi}</div>
                    <div class="card-label">Tehlikeli (Sınır Aşıldı)</div>
                </div>
            </div>
        `;

        // ── Grafikler ──
        GrafikModulu.createDashboardBarChart('chart-dashboard-bar', ozetler);
        GrafikModulu.createEnergyDoughnut('chart-dashboard-doughnut', toplamAktif, toplamEnduktif, toplamKapasitif);

        // ── Dashboard Ay Badge Güncelle ──
        const ayBadge = document.getElementById('dashboard-ay-badge');
        if (ayBadge) ayBadge.textContent = `${AY_ADLARI[state.selectedAy - 1]} ${state.selectedYil}`;

        // ── Trafo Kartları ──
        const gridEl = document.getElementById('trafo-grid');
        gridEl.innerHTML = ozetler.map(({ trafo, ozet, tahminOzet }, idx) => {
            if (!ozet) return '';
            const risk = ozet.kapasitifRisk;
            const ratio = Math.min((ozet.kapasitifOran / 20) * 100, 100);
            const limitPos = (15 / 20) * 100; // %15 sınırın bar üzerindeki pozisyonu

            const tOran = tahminOzet ? tahminOzet.kapasitifOran : ozet.kapasitifOran;
            const tRisk = tahminOzet ? tahminOzet.kapasitifRisk : risk;
            const tahminIkon = tOran >= 15 ? '🚨' : (tOran >= 12 ? '⚠️' : '✅');
            const tahminEtiket = tOran >= 15 ? 'Ceza Riski!' : (tOran >= 12 ? 'Dikkat' : 'Güvenli');

            return `
                <div class="trafo-card risk-${risk.seviye}" style="animation-delay: ${idx * 0.06}s"
                     onclick="App.navigateToTrafo('${trafo.id}')">
                    <div class="trafo-card-header">
                        <div>
                            <h3>${trafo.adi}</h3>
                            <div class="trafo-tip">${trafo.tip} · ${trafo.bolge}</div>
                        </div>
                        <span class="badge badge-${risk.seviye}">${risk.ikon} ${risk.etiket}</span>
                    </div>
                    <div class="trafo-card-stats">
                        <div class="trafo-stat">
                            <span class="trafo-stat-label">Mevcut Oran</span>
                            <span class="trafo-stat-value highlight" style="color:${risk.renk}">
                                %${HesaplamaModulu.formatSayi(ozet.kapasitifOran)}
                            </span>
                        </div>
                        <div class="trafo-stat">
                            <span class="trafo-stat-label">Ay Sonu Tahmini</span>
                            <span class="trafo-stat-value highlight" style="color:${tRisk.renk}">
                                %${HesaplamaModulu.formatSayi(tOran)}
                                <span style="font-size: 13px; margin-left: 2px;" title="${tahminEtiket}">${tahminIkon}</span>
                            </span>
                        </div>
                        <div class="trafo-stat">
                            <span class="trafo-stat-label">Endüktif Oran</span>
                            <span class="trafo-stat-value">
                                %${HesaplamaModulu.formatSayi(ozet.enduktifOran)}
                            </span>
                        </div>
                        <div class="trafo-stat">
                            <span class="trafo-stat-label">Aktif Enerji</span>
                            <span class="trafo-stat-value">${HesaplamaModulu.formatEnerji(ozet.toplamAktif)}</span>
                        </div>
                    </div>
                    <div class="ratio-meter">
                        <div class="ratio-meter-bar">
                            <div class="ratio-meter-fill" style="width:${ratio}%; background:${risk.renk}"></div>
                            <div class="ratio-meter-limit" style="left:${limitPos}%" data-label="%15"></div>
                        </div>
                    </div>
                    <div class="trafo-card-footer" style="margin-top: 12px; display: flex; justify-content: flex-end; gap: 8px;" onclick="event.stopPropagation();">
                        <button class="btn btn-sm btn-outline" onclick="App.navigateToTrafo('${trafo.id}')" style="font-size: 11px; padding: 4px 10px;">🔍 Detaylar</button>
                        <button class="btn btn-sm btn-primary" onclick="if(typeof TopolojiModulu !== 'undefined') TopolojiModulu.openPowerTriangleModal('${trafo.id}')" style="font-size: 11px; padding: 4px 10px;">📐 Güç Üçgeni & Fazör Analizi</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    function switchDashboardView(viewName) {
        state.dashboardView = viewName;
        const btnCharts = document.getElementById('btn-view-charts');
        const btnScada = document.getElementById('btn-view-scada');
        const panelCharts = document.getElementById('dashboard-view-charts');
        const panelScada = document.getElementById('dashboard-view-scada');

        if (btnCharts && btnScada) {
            btnCharts.classList.toggle('active', viewName === 'charts');
            btnScada.classList.toggle('active', viewName === 'scada');
        }
        if (panelCharts && panelScada) {
            panelCharts.style.display = viewName === 'charts' ? 'block' : 'none';
            panelScada.style.display = viewName === 'scada' ? 'block' : 'none';
        }

        if (viewName === 'scada' && typeof TopolojiModulu !== 'undefined') {
            TopolojiModulu.render();
        } else if (viewName === 'charts') {
            renderDashboard();
        }
    }

    // Trafo kartına tıklayınca detay ekranına git
    function navigateToTrafo(trafoId) {
        state.selectedTrafoId = trafoId;
        const sel = document.getElementById('detay-trafo-select');
        if (sel) sel.value = trafoId;
        navigate('trafo-detay');
    }

    // ═══════════════════════════════════════════
    // SCREEN 2: VERİ GİRİŞİ
    // ═══════════════════════════════════════════

    function setupFormHandlers() {
        // Manuel veri giriş formu
        const form = document.getElementById('veri-giris-form');
        form?.addEventListener('submit', (e) => {
            e.preventDefault();

            const trafoId = document.getElementById('input-trafo').value;
            const tarih = document.getElementById('input-tarih').value;
            const aktif = parseInt(document.getElementById('input-aktif').value);
            const enduktif = parseInt(document.getElementById('input-enduktif').value);
            const kapasitif = parseInt(document.getElementById('input-kapasitif').value);

            if (!trafoId || !tarih || isNaN(aktif) || isNaN(enduktif) || isNaN(kapasitif)) {
                showToast('Lütfen tüm alanları doldurun.', 'error');
                return;
            }

            const d = VeriModulu.parseDate(tarih);
            VeriModulu.veriEkle({
                trafoId,
                tarih,
                aktifEnerji: aktif,
                enduktifEnerji: enduktif,
                kapasitifEnerji: kapasitif,
                haftaSonu: d.getDay() === 0 || d.getDay() === 6,
                tatil: false,
            });

            showToast('Veri başarıyla kaydedildi!', 'success');
            form.reset();
            renderVeriTablosu();
        });

        // CSV dosya seçimi
        document.getElementById('btn-csv-sec')?.addEventListener('click', () => {
            document.getElementById('csv-file-input')?.click();
        });

        document.getElementById('csv-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            handleCSVUpload(file);
        });

        // Drag & drop
        const dropArea = document.getElementById('csv-upload-area');
        if (dropArea) {
            ['dragover', 'dragenter'].forEach(ev => {
                dropArea.addEventListener(ev, (e) => {
                    e.preventDefault();
                    dropArea.classList.add('drag-over');
                });
            });
            ['dragleave', 'drop'].forEach(ev => {
                dropArea.addEventListener(ev, (e) => {
                    // dragleave: Yalnızca alanın dışına çıkıldığında kaldır
                    // (child elementlere geçişte titreşmeyi önle)
                    if (ev === 'dragleave' && dropArea.contains(e.relatedTarget)) return;
                    dropArea.classList.remove('drag-over');
                });
            });
            dropArea.addEventListener('drop', (e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file && file.name.endsWith('.csv')) {
                    handleCSVUpload(file);
                }
            });
        }
    }

    function handleCSVUpload(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(l => l.trim());
            if (lines.length < 2) {
                showToast('CSV dosyası boş veya geçersiz.', 'error');
                return;
            }

            const trafolar = VeriModulu.getTrafolar();
            const trafoMap = new Set(trafolar.map(t => t.id));
            let count = 0;
            let skipped = 0;

            // ── Format tespiti ──────────────────────────────────────────
            // TEİAŞ geniş formatı: ilk sütun CREATED_AT, ardından "TRAFO ADI (P/Q)" çiftleri
            const headerParts = lines[0].split(/[,;\t]/).map(s => s.trim());
            const isTeıasFormat = headerParts[0].toUpperCase().includes('CREATED') ||
                                  headerParts.some(h => /\(P\)|\(Q\)/i.test(h));

            if (isTeıasFormat) {
                // ── TEİAŞ Geniş Format ───────────────────────────────────
                // Başlık sütunlarını trafo ID'si ve P/Q tipine eşle
                // Sütun adı örn: "ÜMRANİYE TRA (P)" → UMR-TRA, aktif
                //                "ÜMRANİYE TRA (Q)" → UMR-TRA, reaktif
                //                "KARTAL TRA (P)"   → KRT-TRA, aktif
                //                "KARTAL TRB (Q)"   → KRT-TRB, reaktif

                // Sütun → Trafo eşlemesi: header metni ile trafo adını karşılaştır
                // Önce basit anahtar kelime eşlemesi
                const SUTUN_TRAFO_ESLEMESI = {
                    'ÜMRANİYE TRA': 'UMR-TRA',
                    'UMRANİYE TRA': 'UMR-TRA',
                    'UMRANIYE TRA': 'UMR-TRA',
                    'ÜMRANİYE TRB': 'UMR-TRB',
                    'UMRANİYE TRB': 'UMR-TRB',
                    'UMRANIYE TRB': 'UMR-TRB',
                    'KARTAL TRA':   'KRT-TRA',
                    'KARTAL TRB':   'KRT-TRB',
                };

                // Her trafo için P ve Q sütun indekslerini bul
                const trafoSutunlar = {}; // { trafoId: { pIdx, qIdx } }

                for (let col = 1; col < headerParts.length; col++) {
                    const h = headerParts[col];
                    const isPCol = /\(P\)/i.test(h);
                    const isQCol = /\(Q\)/i.test(h);
                    if (!isPCol && !isQCol) continue;

                    // Sütun adından trafo adını çıkar: "ÜMRANİYE TRA (P)" → "ÜMRANİYE TRA"
                    const baslik = h.replace(/\s*\(P\)\s*|\s*\(Q\)\s*/i, '').trim().toUpperCase();

                    // Direkt eşleme dene
                    let trafoId = SUTUN_TRAFO_ESLEMESI[baslik];

                    // Direkt eşleme bulunamazsa trafo adlarıyla kısmi eşleme dene
                    if (!trafoId) {
                        for (const trafo of trafolar) {
                            const trafoAdi = trafo.adi.toUpperCase().replace(/[–\-]/g, ' ').replace(/\s+/g, ' ');
                            if (trafoAdi.includes(baslik) || baslik.includes(trafo.id)) {
                                trafoId = trafo.id;
                                break;
                            }
                        }
                    }

                    if (!trafoId) continue;

                    if (!trafoSutunlar[trafoId]) trafoSutunlar[trafoId] = { pIdx: -1, qIdx: -1 };
                    if (isPCol) trafoSutunlar[trafoId].pIdx = col;
                    if (isQCol) trafoSutunlar[trafoId].qIdx = col;
                }

                const eslesenTrafolar = Object.keys(trafoSutunlar);
                if (eslesenTrafolar.length === 0) {
                    showToast('TEİAŞ CSV formatı tanındı ancak hiçbir trafo eşlenemedi. Sütun başlıklarını kontrol edin.', 'error');
                    return;
                }

                // Veri satırlarını işle
                for (let i = 1; i < lines.length; i++) {
                    const cols = lines[i].split(/[,;\t]/).map(s => s.trim());
                    if (!cols[0]) { skipped++; continue; }

                    // Tarih: "2025-07-01 00:00:00" → "2025-07-01 00:00"
                    const tarihRaw = cols[0].replace(/:\d{2}$/, '').trim(); // saniye kısmını kaldır
                    const tarihGun = tarihRaw.split(' ')[0]; // "2025-07-01"
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(tarihGun)) { skipped++; continue; }

                    const d = VeriModulu.parseDate(tarihGun);
                    if (isNaN(d.getTime())) { skipped++; continue; }

                    for (const trafoId of eslesenTrafolar) {
                        const { pIdx, qIdx } = trafoSutunlar[trafoId];
                        if (pIdx < 0 || qIdx < 0) continue;

                        const pMW = parseFloat(cols[pIdx]);
                        const qMVAr = parseFloat(cols[qIdx]);
                        if (isNaN(pMW) || isNaN(qMVAr)) { skipped++; continue; }

                        // MW → kWh (saatlik ölçüm olduğu için ×1000)
                        const aktifEnerji = Math.round(Math.abs(pMW) * 1000);
                        // Q: negatif = kapasitif, pozitif = endüktif
                        const enduktifEnerji = qMVAr > 0 ? Math.round(qMVAr * 1000) : 0;
                        const kapasitifEnerji = qMVAr < 0 ? Math.round(Math.abs(qMVAr) * 1000) : 0;

                        VeriModulu.veriEkle({
                            trafoId,
                            tarih: tarihRaw,           // "2025-07-01 00:00" ile saatlik kayıt
                            aktifEnerji,
                            enduktifEnerji,
                            kapasitifEnerji,
                            haftaSonu: d.getDay() === 0 || d.getDay() === 6,
                            tatil: false,
                        });
                        count++;
                    }
                }

            } else {
                // ── SPARK Satır Formatı (eski) ───────────────────────────
                // trafoId;tarih;aktif;endüktif;kapasitif
                for (let i = 1; i < lines.length; i++) {
                    const parts = lines[i].split(/[,;\t]/).map(s => s.trim());
                    if (parts.length >= 5) {
                        const [trafoId, tarih, aktifStr, enduktifStr, kapasitifStr] = parts;
                        const aktif = parseInt(aktifStr, 10);
                        const enduktif = parseInt(enduktifStr, 10);
                        const kapasitif = parseInt(kapasitifStr, 10);
                        const dateMatch = /^\d{4}-\d{2}-\d{2}/.test(tarih);

                        if (!trafoMap.has(trafoId) || !dateMatch || isNaN(aktif) || isNaN(enduktif) || isNaN(kapasitif)) {
                            skipped++;
                            continue;
                        }

                        const d = VeriModulu.parseDate(tarih);
                        if (isNaN(d.getTime())) { skipped++; continue; }

                        VeriModulu.veriEkle({
                            trafoId,
                            tarih,
                            aktifEnerji: aktif,
                            enduktifEnerji: enduktif,
                            kapasitifEnerji: kapasitif,
                            haftaSonu: d.getDay() === 0 || d.getDay() === 6,
                            tatil: false,
                        });
                        count++;
                    } else {
                        skipped++;
                    }
                }
            }

            if (count > 0) {
                showToast(`${count} adet veri başarıyla yüklendi!${skipped > 0 ? ` (${skipped} satır/hücre atlandı)` : ''}`, 'success');
                renderVeriTablosu();
            } else {
                showToast(`Yüklenecek geçerli veri bulunamadı.${skipped > 0 ? ` (${skipped} hatalı satır atlandı)` : ''}`, 'error');
            }
        };
        reader.readAsText(file, 'UTF-8');
    }

    function renderVeriGiris() {
        // Tarih varsayılan değeri
        document.getElementById('input-tarih').value = VeriModulu.BUGUN;
        renderVeriTablosu();
    }

    function renderVeriTablosu() {
        const filterTrafo = document.getElementById('table-trafo-filter')?.value || '';
        let veriler;

        if (filterTrafo) {
            veriler = VeriModulu.getAylikVeriler(filterTrafo, state.selectedYil, state.selectedAy);
        } else {
            // Tüm trafoların en güncel/son 50 kaydı (ay kısıtı olmaksızın)
            veriler = [...VeriModulu.getTumVeriler()];
            veriler.sort((a, b) => b.tarih.localeCompare(a.tarih));
            veriler = veriler.slice(0, 50);
        }

        const tbody = document.getElementById('veri-table-body');
        if (!tbody) return;

        tbody.innerHTML = veriler.map(v => {
            const oran = HesaplamaModulu.oranHesapla(v.kapasitifEnerji, v.aktifEnerji);
            const risk = HesaplamaModulu.riskSeviyesiBelirle(oran, 'kapasitif');
            const trafo = VeriModulu.getTrafo(v.trafoId);
            const rowClass = v.haftaSonu ? 'row-weekend' : (v.tatil ? 'row-tatil' : '');

            return `
                <tr class="${rowClass}">
                    <td>${v.tarih}</td>
                    <td>${trafo ? (trafo.adi.split(' – ').length > 1 ? trafo.adi.split(' – ')[0] + ' (' + trafo.adi.split(' – ')[1] + ')' : trafo.adi) : v.trafoId}</td>
                    <td class="text-right">${HesaplamaModulu.formatEnerji(v.aktifEnerji)}</td>
                    <td class="text-right">${HesaplamaModulu.formatEnerji(v.enduktifEnerji)}</td>
                    <td class="text-right">${HesaplamaModulu.formatEnerji(v.kapasitifEnerji)}</td>
                    <td class="text-right" style="color:${risk.renk}; font-weight:600;">
                        %${HesaplamaModulu.formatSayi(oran)}
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm btn-ghost" onclick="App.silVeri('${v.trafoId}','${v.tarih}')">🗑️</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function silVeri(trafoId, tarih) {
        VeriModulu.veriSil(trafoId, tarih);
        showToast('Veri silindi.', 'info');
        renderVeriTablosu();
    }

    // ═══════════════════════════════════════════
    // SCREEN 3: TRAFO DETAY & RİSK ANALİZİ
    // ═══════════════════════════════════════════

    function renderTrafoDetay() {
        const trafoId = state.selectedTrafoId;
        const ay = state.selectedAy;
        const yil = state.selectedYil;

        const trafo = VeriModulu.getTrafo(trafoId);
        if (!trafo) return;

        const veriler = VeriModulu.getAylikVeriler(trafoId, yil, ay);
        const ozet = HesaplamaModulu.aylikOzetHesapla(veriler);

        if (!ozet) {
            document.getElementById('detay-summary').innerHTML = '<p class="text-muted">Bu ay için veri bulunamadı.</p>';
            return;
        }

        // Tahmin yap (seçilen yöntemle)
        const yontem = document.getElementById('detay-yontem-select')?.value || state.selectedYontem || 'ensemble';
        const selYontem = document.getElementById('detay-yontem-select');
        if (selYontem && selYontem.value !== yontem) selYontem.value = yontem;

        const tahminSonucu = TahminModulu.aySonuTahminiYap(trafoId, yil, ay, yontem);
        const tahminOzet = HesaplamaModulu.aylikOzetHesapla(tahminSonucu.tumVeriler);
        const tahminOranStr = tahminOzet ? HesaplamaModulu.formatSayi(tahminOzet.kapasitifOran) : '—';
        const tahminRisk = tahminOzet ? HesaplamaModulu.riskSeviyesiBelirle(tahminOzet.kapasitifOran, 'kapasitif') : null;

        // ── Özet Kartlar ──
        document.getElementById('detay-summary').innerHTML = `
            <div class="detay-card">
                <div class="dc-label">Kapasitif Oran</div>
                <div class="dc-value" style="color:${ozet.kapasitifRisk.renk}">%${HesaplamaModulu.formatSayi(ozet.kapasitifOran)}</div>
                <div class="dc-unit">
                    <span class="badge badge-${ozet.kapasitifRisk.seviye}">${ozet.kapasitifRisk.ikon} ${ozet.kapasitifRisk.etiket}</span>
                </div>
            </div>
            <div class="detay-card">
                <div class="dc-label">Endüktif Oran</div>
                <div class="dc-value" style="color:${ozet.enduktifRisk.renk}">%${HesaplamaModulu.formatSayi(ozet.enduktifOran)}</div>
                <div class="dc-unit">
                    <span class="badge badge-${ozet.enduktifRisk.seviye}">${ozet.enduktifRisk.ikon} ${ozet.enduktifRisk.etiket}</span>
                </div>
            </div>
            <div class="detay-card">
                <div class="dc-label">Aktif Enerji</div>
                <div class="dc-value text-info">${HesaplamaModulu.formatEnerji(ozet.toplamAktif)}</div>
                <div class="dc-unit">kWh (toplam)</div>
            </div>
            <div class="detay-card">
                <div class="dc-label">Ay Sonu Tahmini <span style="font-size:11px; font-weight:normal; color:var(--text-dim);">(${tahminSonucu.modelBilgi ? (tahminSonucu.modelBilgi.adi.split(' ')[1] || 'Model') : 'Ensemble'})</span></div>
                <div class="dc-value" style="color:${tahminRisk ? tahminRisk.renk : 'inherit'}">%${tahminOranStr}</div>
                <div class="dc-unit">${tahminRisk ? `<span class="badge badge-${tahminRisk.seviye}">${tahminRisk.ikon} ${tahminRisk.etiket}</span>` : ''}</div>
            </div>
            <div class="detay-card">
                <div class="dc-label">Veri Süresi</div>
                <div class="dc-value text-info">${ozet.gunSayisi} Gün</div>
                <div class="dc-unit">${ozet.saatSayisi} saat kayıt (${TahminModulu.aydakiGunSayisi(yil, ay)} günden)</div>
            </div>
        `;

        // ── Grafik ──
        const tahminBadge = document.getElementById('detay-tahmin-badge');
        const barTahminBadge = document.getElementById('detay-bar-tahmin-badge');
        if (!tahminSonucu.tamamlanmis && tahminSonucu.tahminVeriler.length > 0) {
            tahminBadge.style.display = '';
            if (barTahminBadge) barTahminBadge.style.display = '';
            GrafikModulu.createCumulativeLineChart(
                'chart-detay-line',
                ozet.kumulatifGunluk,
                tahminSonucu.tahminVeriler,
                HesaplamaModulu.SINIRLAR.kapasitif
            );
            GrafikModulu.createDailyBarChart(
                'chart-detay-bar',
                ozet.kumulatifGunluk,
                tahminSonucu.tahminVeriler,
                HesaplamaModulu.SINIRLAR.kapasitif
            );
        } else {
            tahminBadge.style.display = 'none';
            if (barTahminBadge) barTahminBadge.style.display = 'none';
            GrafikModulu.createCumulativeLineChart(
                'chart-detay-line',
                ozet.kumulatifGunluk,
                null,
                HesaplamaModulu.SINIRLAR.kapasitif
            );
            GrafikModulu.createDailyBarChart(
                'chart-detay-bar',
                ozet.kumulatifGunluk,
                null,
                HesaplamaModulu.SINIRLAR.kapasitif
            );
        }

        // ── Uyarı Kutusu ──
        const uyariEl = document.getElementById('detay-uyari');
        const uyariMesaj = HesaplamaModulu.uyariMesajiUret(
            trafo.adi,
            ozet.kapasitifOran,
            tahminOzet ? tahminOzet.kapasitifOran : null
        );
        uyariEl.style.display = '';
        uyariEl.className = `alert-box alert-${ozet.kapasitifRisk.seviye}`;
        uyariEl.innerHTML = uyariMesaj;

        // ── Günlük Tablo ──
        const kumulatifler = ozet.kumulatifGunluk;
        const tbody = document.getElementById('detay-table-body');
        tbody.innerHTML = kumulatifler.map(v => {
            const tarih = VeriModulu.parseDate(v.tarih);
            const gunAdi = GUN_KISA[tarih.getDay()];
            const risk = HesaplamaModulu.riskSeviyesiBelirle(v.kumulatifKapasitifOran, 'kapasitif');
            const rowClass = v.haftaSonu ? 'row-weekend' : (v.tatil ? 'row-tatil' : '');

            return `
                <tr class="${rowClass}">
                    <td>${v.tarih}</td>
                    <td>${gunAdi}${v.tatil ? ' 🎌' : ''}</td>
                    <td class="text-right">${HesaplamaModulu.formatEnerji(v.aktifEnerji)}</td>
                    <td class="text-right">${HesaplamaModulu.formatEnerji(v.enduktifEnerji)}</td>
                    <td class="text-right">${HesaplamaModulu.formatEnerji(v.kapasitifEnerji)}</td>
                    <td class="text-right">%${HesaplamaModulu.formatSayi(v.gunlukKapasitifOran)}</td>
                    <td class="text-right" style="color:${risk.renk}; font-weight:600;">
                        %${HesaplamaModulu.formatSayi(v.kumulatifKapasitifOran)}
                    </td>
                    <td class="text-center">
                        <span class="badge badge-${risk.seviye}" style="font-size:10px">${risk.ikon}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ═══════════════════════════════════════════
    // SCREEN 4: TAHMİN & SENARYO
    // ═══════════════════════════════════════════

    function renderTahmin() {
        if (!state.selectedTrafoId) {
            const trafolar = VeriModulu.getTrafolar();
            if (trafolar.length) state.selectedTrafoId = trafolar[0].id;
        }
        const trafoId = state.selectedTrafoId;
        const selTrafo = document.getElementById('tahmin-trafo-select');
        if (selTrafo && selTrafo.value !== trafoId) selTrafo.value = trafoId;

        const yontem = document.getElementById('tahmin-yontem-select')?.value || state.selectedYontem || 'ensemble';
        const selY = document.getElementById('tahmin-yontem-select');
        if (selY && selY.value !== yontem) selY.value = yontem;
        const yil = state.selectedYil;
        const ay = state.selectedAy;
        const trafo = VeriModulu.getTrafo(trafoId);

        if (!trafo) return;

        const tahmin = TahminModulu.aySonuTahminiYap(trafoId, yil, ay, yontem);
        const mevcutOzet = HesaplamaModulu.aylikOzetHesapla(tahmin.mevcutVeriler);
        const tahminOzet = HesaplamaModulu.aylikOzetHesapla(tahmin.tumVeriler);

        if (!mevcutOzet || !tahminOzet) {
            document.getElementById('tahmin-summary').innerHTML = '<p class="text-muted">Yeterli veri bulunamadı.</p>';
            return;
        }

        const mevcutRisk = mevcutOzet.kapasitifRisk;
        const tahminRisk = tahminOzet.kapasitifRisk;
        const fark = tahminOzet.kapasitifOran - mevcutOzet.kapasitifOran;
        const farkStr = fark >= 0 ? `+${HesaplamaModulu.formatSayi(fark)}` : HesaplamaModulu.formatSayi(fark);
        const bilgi = tahmin.modelBilgi || { adi: 'Seçilen Model', skor: 92.5, aciklama: 'Aylık tahmin projeksiyonu.' };

        // ── Özet Kartlar & Model Bilgi Paneli ──
        document.getElementById('tahmin-summary').innerHTML = `
            <div class="detay-card">
                <div class="dc-label">Mevcut Oran (${mevcutOzet.gunSayisi} gün / ${mevcutOzet.saatSayisi} saat)</div>
                <div class="dc-value" style="color:${mevcutRisk.renk}">%${HesaplamaModulu.formatSayi(mevcutOzet.kapasitifOran)}</div>
                <div class="dc-unit"><span class="badge badge-${mevcutRisk.seviye}">${mevcutRisk.ikon} ${mevcutRisk.etiket}</span></div>
            </div>
            <div class="detay-card">
                <div class="dc-label">Tahmini Ay Sonu Oranı</div>
                <div class="dc-value" style="color:${tahminRisk.renk}">%${HesaplamaModulu.formatSayi(tahminOzet.kapasitifOran)}</div>
                <div class="dc-unit"><span class="badge badge-${tahminRisk.seviye}">${tahminRisk.ikon} ${tahminRisk.etiket}</span></div>
            </div>
            <div class="detay-card">
                <div class="dc-label">Model Değişimi</div>
                <div class="dc-value" style="color:${fark >= 0 ? 'var(--color-danger)' : 'var(--color-success)'}">
                    ${farkStr}
                </div>
                <div class="dc-unit">puan (${bilgi.adi.split(' ')[1] || 'Model'})</div>
            </div>
            <div class="detay-card" style="border-left: 3px solid #3b82f6; cursor: pointer;" onclick="App.toggleModelDetail()" title="Açıklama ve test detayları için tıklayın">
                <div class="dc-label">🎯 Canlı Model Güven Skoru</div>
                <div class="dc-value text-info">
                    %${bilgi.skor}
                </div>
                <div class="dc-unit" id="model-info-hint" style="font-size:11px; color:#3b82f6; font-weight:600; display:flex; align-items:center; gap:4px; margin-top:4px;">
                    ℹ️ Detay ve Açıklamayı Göster ▼
                </div>
                <div id="model-info-detail" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(148,163,184,0.2); font-size:11px; white-space:normal; line-height:1.4; color:var(--text-secondary);" onclick="event.stopPropagation();">
                    <div style="margin-bottom:6px; color:var(--text-primary); font-weight:500;">${bilgi.aciklama}</div>
                    ${bilgi.canliTest ? `<div style="padding:8px 10px; background:rgba(59,130,246,0.1); border-radius:6px; color:#3b82f6; border-left:3px solid #3b82f6;">${bilgi.canliTest.detay}</div>` : ''}
                </div>
            </div>
        `;

        // ── Grafik ──
        const kumulatif = HesaplamaModulu.kumulatifOranlarHesapla(tahmin.mevcutVeriler);
        GrafikModulu.createCumulativeLineChart(
            'chart-tahmin-line',
            kumulatif,
            tahmin.tahminVeriler,
            HesaplamaModulu.SINIRLAR.kapasitif
        );

        // Senaryo tarih varsayılanı
        const senaryoTarih = document.getElementById('senaryo-tarih');
        if (senaryoTarih && !senaryoTarih.value) {
            senaryoTarih.value = VeriModulu.BUGUN;
        }

        // Akıllı miktar varsayılan önerisi
        const miktarInput = document.getElementById('senaryo-miktar');
        if (miktarInput && !miktarInput.value) {
            const tur = document.getElementById('senaryo-tur')?.value || 'reaktor';
            miktarInput.value = tur === 'yukTransferi' ? 3500 : 2500;
        }
    }

    function setupSenaryoForm() {
        const turSelect = document.getElementById('senaryo-tur');
        const miktarInput = document.getElementById('senaryo-miktar');

        turSelect?.addEventListener('change', () => {
            const tur = turSelect.value;
            const turInfo = SenaryoModulu.SENARYO_TURLERI[tur];
            document.getElementById('senaryo-miktar-label').textContent = turInfo.etiketMiktar;
            document.getElementById('senaryo-aciklama').textContent = turInfo.aciklama;
            if (miktarInput) {
                miktarInput.value = tur === 'yukTransferi' ? 3500 : 2500;
            }
        });

        const form = document.getElementById('senaryo-form');
        form?.addEventListener('submit', (e) => {
            e.preventDefault();
            runSenaryo(true);
        });
    }

    function runSenaryo(shouldScroll = true) {
        if (!state.selectedTrafoId) {
            const trafolar = VeriModulu.getTrafolar();
            if (trafolar.length) state.selectedTrafoId = trafolar[0].id;
        }
        const trafoId = state.selectedTrafoId;
        const yontem = document.getElementById('tahmin-yontem-select')?.value || state.selectedYontem || 'ensemble';
        const senaryoTuru = document.getElementById('senaryo-tur').value;
        const baslangicTarihi = document.getElementById('senaryo-tarih').value;
        const miktar = parseInt(document.getElementById('senaryo-miktar').value);

        if (!baslangicTarihi || isNaN(miktar) || miktar <= 0) {
            showToast('Lütfen geçerli bir tarih ve miktar girin.', 'error');
            return;
        }

        const tahmin = TahminModulu.aySonuTahminiYap(trafoId, state.selectedYil, state.selectedAy, yontem);
        const orijinalVeriler = tahmin.tumVeriler;
        const senaryoluVeriler = SenaryoModulu.senaryoUygula(orijinalVeriler, senaryoTuru, baslangicTarihi, miktar);
        const karsilastirma = SenaryoModulu.senaryoKarsilastir(orijinalVeriler, senaryoluVeriler);

        if (!karsilastirma) {
            showToast('Karşılaştırma yapılamadı.', 'error');
            return;
        }

        const sonucEl = document.getElementById('senaryo-sonuc');
        sonucEl.style.display = '';

        const orijRisk = karsilastirma.orijinal.kapasitifRisk;
        const senRisk = karsilastirma.senaryo.kapasitifRisk;

        const tasarrufKap = Math.round(karsilastirma.orijinal.toplamKapasitif - karsilastirma.senaryo.toplamKapasitif);
        const eklenenAktif = Math.round(karsilastirma.senaryo.toplamAktif - karsilastirma.orijinal.toplamAktif);

        const resultClass = karsilastirma.iyilesmeSaglandi ? 'result-positive' : 'result-negative';
        let resultText;
        if (karsilastirma.sinirAltinaIndi) {
            resultText = `🎉 Mükemmel! ${SenaryoModulu.SENARYO_TURLERI[senaryoTuru].adi} müdahalesi ile kapasitif oran %${HesaplamaModulu.formatSayi(karsilastirma.kapasitifOranSenaryo)} seviyesine düşürüldü ve %15 ceza sınırının altına inildi! (${tasarrufKap > 0 ? tasarrufKap + ' kVArh reaktif yük sönümlendi' : eklenenAktif + ' kWh aktif yük dengelendi'})`;
        } else if (karsilastirma.iyilesmeSaglandi && karsilastirma.kapasitifOranSenaryo < 12) {
            resultText = `✅ Başarılı Müdahale! Oran %${HesaplamaModulu.formatSayi(Math.abs(karsilastirma.kapasitifFark))} puan düşürülerek %${HesaplamaModulu.formatSayi(karsilastirma.kapasitifOranSenaryo)} ile Güvenli Yeşil Bölgede konforlu bir seviyeye ulaştı.`;
        } else if (karsilastirma.iyilesmeSaglandi) {
            resultText = `⚡ Oran %${HesaplamaModulu.formatSayi(Math.abs(karsilastirma.kapasitifFark))} puan iyileştirildi (${tasarrufKap > 0 ? tasarrufKap + ' kVArh azaltıldı' : eklenenAktif + ' kWh eklendi'}). Ancak %${HesaplamaModulu.formatSayi(karsilastirma.kapasitifOranSenaryo)} seviyesi hâlâ ${karsilastirma.kapasitifOranSenaryo >= 15 ? '%15 ceza sınırının üzerinde. Ceza sınırının altına inmek için günlük müdahale miktarını (kVArh) artırmanız veya müdahaleye ayın daha erken bir gününde başlamanız önerilir!' : '%12 uyarı sınırına yakın. Daha güvenli bir seviye için müdahale miktarını bir miktar yükseltebilirsiniz.'}`;
        } else {
            resultText = `⚠️ Bu senaryo ile oranda iyileşme sağlanamadı. Lütfen günlük müdahale miktarını (kVArh) artırmayı veya müdahaleye ayın daha erken bir gününde başlamayı deneyin.`;
        }

        document.getElementById('senaryo-karsilastirma').innerHTML = `
            <div class="senaryo-comparison">
                <div class="senaryo-col">
                    <div class="sc-label">Müdahalesiz Orijinal</div>
                    <div class="sc-value" style="color:${orijRisk.renk}">%${HesaplamaModulu.formatSayi(karsilastirma.kapasitifOranOrijinal)}</div>
                    <span class="badge badge-${orijRisk.seviye}" style="margin-top:8px">${orijRisk.ikon} ${orijRisk.etiket}</span>
                </div>
                <div class="senaryo-arrow">→</div>
                <div class="senaryo-col">
                    <div class="sc-label">Müdahale Sonrası</div>
                    <div class="sc-value" style="color:${senRisk.renk}">%${HesaplamaModulu.formatSayi(karsilastirma.kapasitifOranSenaryo)}</div>
                    <span class="badge badge-${senRisk.seviye}" style="margin-top:8px">${senRisk.ikon} ${senRisk.etiket}</span>
                </div>
            </div>
            <div class="senaryo-result-text ${resultClass}" style="line-height:1.5; font-size:14px; margin-top:16px;">${resultText}</div>
        `;

        GrafikModulu.createScenarioChart(
            'chart-senaryo-line',
            orijinalVeriler,
            senaryoluVeriler,
            HesaplamaModulu.SINIRLAR.kapasitif
        );

        if (shouldScroll) {
            sonucEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ═══════════════════════════════════════════
    // TOAST NOTIFICATIONS
    // ═══════════════════════════════════════════

    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span> ${message}`;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ═══════════════════════════════════════════
    // THEME MANAGEMENT
    // ═══════════════════════════════════════════

    function initTheme() {
        const savedTheme = localStorage.getItem('spark_theme') || 'dark';
        applyTheme(savedTheme);

        const toggleBtn = document.getElementById('btn-theme-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const currentTheme = document.body.getAttribute('data-theme') || 'dark';
                const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
                applyTheme(newTheme);
            });
        }
    }

    function applyTheme(themeName) {
        document.body.setAttribute('data-theme', themeName);
        localStorage.setItem('spark_theme', themeName);

        const iconEl = document.getElementById('theme-icon');
        const textEl = document.getElementById('theme-text');
        if (iconEl) iconEl.textContent = themeName === 'light' ? '🌙' : '☀️';
        if (textEl) textEl.textContent = themeName === 'light' ? 'Koyu' : 'Açık';

        if (typeof GrafikModulu !== 'undefined' && GrafikModulu.updateTheme) {
            GrafikModulu.updateTheme(themeName === 'light');
        }

        if (state.currentScreen) {
            navigate(state.currentScreen);
        }

        const modal = document.getElementById('power-triangle-modal');
        if (modal && modal.style.display === 'flex' && typeof TopolojiModulu !== 'undefined' && state.selectedTrafoId) {
            TopolojiModulu.openPowerTriangleModal(state.selectedTrafoId);
        }
    }

    function toggleModelDetail() {
        const el = document.getElementById('model-info-detail');
        const hint = document.getElementById('model-info-hint');
        if (!el) return;
        const isHidden = el.style.display === 'none';
        el.style.display = isHidden ? 'block' : 'none';
        if (hint) {
            hint.innerHTML = isHidden ? 'ℹ️ Detayı Gizle ▲' : 'ℹ️ Detay ve Açıklamayı Göster ▼';
        }
    }

    // ═══════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════

    return {
        init,
        navigate,
        navigateToTrafo,
        silVeri,
        switchDashboardView,
        toggleModelDetail,
        renderForecastBanner,
        renderDashboard,
        getState: () => state,
    };
})();

// Uygulama başlatma
document.addEventListener('DOMContentLoaded', App.init);
