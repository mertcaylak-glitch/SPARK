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
    };

    // ═══════════════════════════════════════════
    // INITIALIZATION
    // ═══════════════════════════════════════════

    function init() {
        // Tarih gösterimi
        document.getElementById('current-date').textContent = formatDisplayDate(VeriModulu.BUGUN);

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
        document.getElementById('tahmin-yontem-select')?.addEventListener('change', () => {
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

    function renderDashboard() {
        const ozetler = HesaplamaModulu.tumTrafoOzetleri(state.selectedYil, state.selectedAy);

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
        gridEl.innerHTML = ozetler.map(({ trafo, ozet }, idx) => {
            if (!ozet) return '';
            const risk = ozet.kapasitifRisk;
            const ratio = Math.min((ozet.kapasitifOran / 20) * 100, 100);
            const limitPos = (15 / 20) * 100; // %15 sınırın bar üzerindeki pozisyonu

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
                            <span class="trafo-stat-label">Kapasitif Oran</span>
                            <span class="trafo-stat-value highlight" style="color:${risk.renk}">
                                %${HesaplamaModulu.formatSayi(ozet.kapasitifOran)}
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
                        <div class="trafo-stat">
                            <span class="trafo-stat-label">Veri Süresi</span>
                            <span class="trafo-stat-value">${ozet.gunSayisi} Gün (${ozet.saatSayisi || ozet.gunSayisi*24} sa)</span>
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
            let count = 0;
            let skipped = 0;
            const trafolar = VeriModulu.getTrafolar();
            const trafoMap = new Set(trafolar.map(t => t.id));

            // Başlık satırını atla
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(/[,;\t]/).map(s => s.trim());
                if (parts.length >= 5) {
                    const [trafoId, tarih, aktifStr, enduktifStr, kapasitifStr] = parts;
                    const aktif = parseInt(aktifStr, 10);
                    const enduktif = parseInt(enduktifStr, 10);
                    const kapasitif = parseInt(kapasitifStr, 10);
                    const dateMatch = /^\d{4}-\d{2}-\d{2}$/.test(tarih);

                    if (!trafoMap.has(trafoId) || !dateMatch || isNaN(aktif) || isNaN(enduktif) || isNaN(kapasitif)) {
                        skipped++;
                        continue;
                    }

                    const d = VeriModulu.parseDate(tarih);
                    if (isNaN(d.getTime())) {
                        skipped++;
                        continue;
                    }

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

            if (count > 0) {
                showToast(`${count} adet veri başarıyla yüklendi!${skipped > 0 ? ` (${skipped} satır atlandı)` : ''}`, 'success');
                renderVeriTablosu();
            } else {
                showToast(`Yüklenecek geçerli veri bulunamadı.${skipped > 0 ? ` (${skipped} hatalı satır atlandı)` : ''}`, 'error');
            }
        };
        reader.readAsText(file);
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
                    <td>${trafo ? trafo.adi.split(' – ')[0] : v.trafoId}</td>
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

        // Tahmin yap (ensemble yöntemiyle)
        const tahminSonucu = TahminModulu.aySonuTahminiYap(trafoId, yil, ay, 'ensemble');
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
                <div class="dc-label">Ay Sonu Tahmini</div>
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

        const yontem = document.getElementById('tahmin-yontem-select')?.value || 'ensemble';
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
            <div class="detay-card" style="border-left: 3px solid #3b82f6;">
                <div class="dc-label">🎯 Canlı Model Güven Skoru</div>
                <div class="dc-value text-info" style="display:flex; align-items:baseline; gap:6px;">
                    %${bilgi.skor}
                    ${bilgi.canliTest ? `<span style="font-size:12px; color:#94a3b8; font-weight:normal;">(Teorik: %${bilgi.teorikSkor})</span>` : ''}
                </div>
                <div class="dc-unit" style="font-size:11px; white-space:normal; line-height:1.3; margin-top:4px; color:#cbd5e1;">
                    ${bilgi.aciklama}
                    ${bilgi.canliTest ? `<div style="margin-top:6px; padding:6px 8px; background:rgba(59,130,246,0.1); border-radius:4px; color:#60a5fa; font-size:11px; border-left:2px solid #3b82f6;">${bilgi.canliTest.detay}</div>` : ''}
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
        const yontem = document.getElementById('tahmin-yontem-select')?.value || 'ensemble';
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
            resultText = `⚡ Oran %${HesaplamaModulu.formatSayi(Math.abs(karsilastirma.kapasitifFark))} puan iyileştirildi (${tasarrufKap > 0 ? tasarrufKap + ' kVArh azaltıldı' : eklenenAktif + ' kWh eklendi'}). Ancak %${HesaplamaModulu.formatSayi(karsilastirma.kapasitifOranSenaryo)} seviyesi hâlâ ${karsilastirma.kapasitifOranSenaryo >= 15 ? '%15 ceza sınırının üzerinde. Miktarı veya erken müdahale tarihini artırmanız önerilir!' : '%12 uyarı sınırına yakın.'}`;
        } else {
            resultText = `⚠️ Bu senaryo ile oranda iyileşme sağlanamadı. Lütfen miktar parametresini veya müdahale tarihini kontrol edin.`;
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
    // PUBLIC API
    // ═══════════════════════════════════════════

    return {
        init,
        navigate,
        navigateToTrafo,
        silVeri,
        switchDashboardView,
        getState: () => state,
    };
})();

// Uygulama başlatma
document.addEventListener('DOMContentLoaded', App.init);
