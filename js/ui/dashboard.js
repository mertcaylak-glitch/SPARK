/**
 * SPARK Dashboard Ekranı Modülü (dashboard.js)
 */
const DashboardUI = (() => {
    'use strict';

    const _dashboardCache = new Map();
    let _chartType = 'kapasitif';
    let _currentFilter = 'all';

    async function renderForecastBanner(ozetler) {
        const state = App.getState();
        const currentKey = `${state.selectedYil}-${state.selectedAy}-${state.selectedYontem}`;

        if (!ozetler) {
            if (state.lastOzetler && state.lastOzetlerKey === currentKey) {
                ozetler = state.lastOzetler;
            } else {
                const hamOzetler = HesaplamaModulu.tumTrafoOzetleri(state.selectedYil, state.selectedAy);
                ozetler = await Promise.all(hamOzetler.map(async ({ trafo, ozet }) => {
                    if (!ozet) return { trafo, ozet: null, tahminOzet: null };
                    let tahminOzet = null;
                    try {
                        if (typeof TahminModulu !== 'undefined') {
                            const tSonuc = await TahminModulu.aySonuTahminiYap(trafo.id, state.selectedYil, state.selectedAy, state.selectedYontem || 'ensemble');
                            if (tSonuc && tSonuc.tumVeriler) {
                                tahminOzet = HesaplamaModulu.aylikOzetHesapla(tSonuc.tumVeriler);
                            }
                        }
                    } catch (e) {
                        console.warn('Tahmin hatası:', e);
                    }
                    return { trafo, ozet, tahminOzet };
                }));
                state.lastOzetler = ozetler;
                state.lastOzetlerKey = currentKey;
            }
        } else {
            state.lastOzetler = ozetler;
            state.lastOzetlerKey = currentKey;
        }

        if (!ozetler || ozetler.length === 0) return;

        let toplamTahminAktif = 0;
        let toplamTahminKapasitif = 0;
        let toplamTahminEnduktif = 0;
        let toplamMevcutAktif = 0;
        let toplamMevcutKapasitif = 0;
        let toplamMevcutEnduktif = 0;
        let riskliTahminTrafolar = [];
        let dikkatTahminTrafolar = [];

        ozetler.forEach(({ trafo, ozet, tahminOzet }) => {
            if (ozet) {
                toplamMevcutAktif += ozet.toplamAktif;
                toplamMevcutKapasitif += ozet.toplamKapasitif;
                toplamMevcutEnduktif += ozet.toplamEnduktif || 0;
            }
            if (tahminOzet) {
                toplamTahminAktif += tahminOzet.toplamAktif;
                toplamTahminKapasitif += tahminOzet.toplamKapasitif;
                toplamTahminEnduktif += tahminOzet.toplamEnduktif || 0;
                
                const isKapRisk = tahminOzet.kapasitifOran >= (HesaplamaModulu.SINIRLAR?.kapasitif || 15);
                const isEndRisk = (tahminOzet.enduktifOran || 0) >= (HesaplamaModulu.SINIRLAR?.enduktif || 20);
                const isKapDikkat = tahminOzet.kapasitifOran >= (HesaplamaModulu.SINIRLAR?.kapasitifUyari || 12);
                const isEndDikkat = (tahminOzet.enduktifOran || 0) >= (HesaplamaModulu.SINIRLAR?.enduktifUyari || 16);

                if (isKapRisk || isEndRisk) {
                    riskliTahminTrafolar.push({ trafo, tahminOzet, mevcutOzet: ozet, isKapRisk, isEndRisk });
                } else if (isKapDikkat || isEndDikkat) {
                    dikkatTahminTrafolar.push({ trafo, tahminOzet, mevcutOzet: ozet, isKapDikkat, isEndDikkat });
                }
            }
        });

        const genelTahminOran = HesaplamaModulu.oranHesapla(toplamTahminKapasitif, toplamTahminAktif);
        const genelMevcutOran = HesaplamaModulu.oranHesapla(toplamMevcutKapasitif, toplamMevcutAktif);
        const genelTahminEndOran = HesaplamaModulu.oranHesapla(toplamTahminEnduktif, toplamTahminAktif);
        const genelMevcutEndOran = HesaplamaModulu.oranHesapla(toplamMevcutEnduktif, toplamMevcutAktif);

        let bannerHTML = '';
        if (riskliTahminTrafolar.length > 0) {
            const trafoListText = riskliTahminTrafolar.map(t => {
                const parts = [];
                if (t.isKapRisk) parts.push(`Kapasitif: <b>%${HesaplamaModulu.formatSayi(t.tahminOzet.kapasitifOran)}</b>`);
                if (t.isEndRisk) parts.push(`Endüktif: <b>%${HesaplamaModulu.formatSayi(t.tahminOzet.enduktifOran)}</b>`);
                return `${App.escapeHTML(t.trafo.adi)} (${parts.join(', ')})`;
            }).join('; ');

            bannerHTML = `
                <div class="forecast-alert-card alert-card-riskli collapsible collapsed" onclick="this.classList.toggle('collapsed'); this.parentElement.classList.toggle('expanded');">
                    <div class="forecast-alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
                    <span class="collapsed-text-label">Şebeke Durumu</span>
                    <div class="forecast-alert-details" onclick="event.stopPropagation()">
                        <div class="forecast-alert-left">
                            <div class="forecast-alert-text">
                                <h3>AY SONU PROJEKSİYONU & RİSK BİLDİRİMİ <span class="badge badge-tehlikeli" style="margin-left:8px;">Ceza Sınırı Aşım Riski!</span></h3>
                                <p>
                                    Mevcut kullanım trendi devam ederse ay sonunda reaktif güç ceza sınırlarının aşılması beklenmektedir. (Tesis Kapasitif Tahmini: %${HesaplamaModulu.formatSayi(genelTahminOran)}, Endüktif Tahmini: %${HesaplamaModulu.formatSayi(genelTahminEndOran)}).
                                    <br><strong>${riskliTahminTrafolar.length} adet trafoda (${trafoListText})</strong> ay sonuna kadar yasal ceza sınırının aşılması beklenmektedir! Acil müdahale (şönt reaktör/kondansatör veya yük transferi) önerilir.
                                </p>
                            </div>
                        </div>
                        <div class="forecast-alert-right" style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; gap: 8px;">
                                <div class="forecast-alert-metric-box" style="flex: 1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                                    <div class="forecast-alert-metric-label" style="font-size: 11px;">Kapasitif Tahmin</div>
                                    <div class="forecast-alert-metric-val" style="color: ${genelTahminOran >= (HesaplamaModulu.SINIRLAR?.kapasitif || 15) ? 'var(--color-danger)' : 'var(--text-primary)'}; font-size: 16px;">%${HesaplamaModulu.formatSayi(genelTahminOran)}</div>
                                </div>
                                <div class="forecast-alert-metric-box" style="flex: 1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                                    <div class="forecast-alert-metric-label" style="font-size: 11px;">Endüktif Tahmin</div>
                                    <div class="forecast-alert-metric-val" style="color: ${genelTahminEndOran >= (HesaplamaModulu.SINIRLAR?.enduktif || 20) ? 'var(--color-danger)' : 'var(--text-primary)'}; font-size: 16px;">%${HesaplamaModulu.formatSayi(genelTahminEndOran)}</div>
                                </div>
                            </div>
                            <button class="forecast-alert-btn btn btn-primary" onclick="event.stopPropagation(); App.navigateToTrafo('${App.escapeHTML(riskliTahminTrafolar[0].trafo.id)}')" style="background: var(--color-danger); border: none; width: 100%;">
                                Riskli Trafoyu İncele
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else if (dikkatTahminTrafolar.length > 0) {
            const trafoListText = dikkatTahminTrafolar.map(t => {
                const parts = [];
                if (t.isKapDikkat) parts.push(`Kapasitif: <b>%${HesaplamaModulu.formatSayi(t.tahminOzet.kapasitifOran)}</b>`);
                if (t.isEndDikkat) parts.push(`Endüktif: <b>%${HesaplamaModulu.formatSayi(t.tahminOzet.enduktifOran)}</b>`);
                return `${App.escapeHTML(t.trafo.adi)} (${parts.join(', ')})`;
            }).join('; ');

            bannerHTML = `
                <div class="forecast-alert-card alert-card-dikkat collapsible collapsed" onclick="this.classList.toggle('collapsed'); this.parentElement.classList.toggle('expanded');">
                    <div class="forecast-alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
                    <span class="collapsed-text-label">Şebeke Durumu</span>
                    <div class="forecast-alert-details" onclick="event.stopPropagation()">
                        <div class="forecast-alert-left">
                            <div class="forecast-alert-text">
                                <h3>AY SONU PROJEKSİYONU & DİKKAT BİLDİRİMİ <span class="badge badge-dikkat" style="margin-left:8px;">Uyarı Eşiği</span></h3>
                                <p>
                                    Mevcut kullanım trendi devam ederse ay sonunda bazı trafolarda uyarı seviyelerine ulaşılacaktır.
                                    <br>Hiçbir trafo yasal ceza sınırını aşmayacak olsa da, <strong>${dikkatTahminTrafolar.length} adet trafoda (${trafoListText})</strong> uyarı sınırının üzerinde seyredilecektir.
                                </p>
                            </div>
                        </div>
                        <div class="forecast-alert-right" style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; gap: 8px;">
                                <div class="forecast-alert-metric-box" style="flex: 1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                                    <div class="forecast-alert-metric-label" style="font-size: 11px;">Kapasitif Tahmin</div>
                                    <div class="forecast-alert-metric-val" style="color: ${genelTahminOran >= (HesaplamaModulu.SINIRLAR?.kapasitifUyari || 12) ? 'var(--color-warning)' : 'var(--text-primary)'}; font-size: 16px;">%${HesaplamaModulu.formatSayi(genelTahminOran)}</div>
                                </div>
                                <div class="forecast-alert-metric-box" style="flex: 1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                                    <div class="forecast-alert-metric-label" style="font-size: 11px;">Endüktif Tahmin</div>
                                    <div class="forecast-alert-metric-val" style="color: ${genelTahminEndOran >= (HesaplamaModulu.SINIRLAR?.enduktifUyari || 16) ? 'var(--color-warning)' : 'var(--text-primary)'}; font-size: 16px;">%${HesaplamaModulu.formatSayi(genelTahminEndOran)}</div>
                                </div>
                            </div>
                            <button class="forecast-alert-btn btn btn-outline" onclick="event.stopPropagation(); App.navigateToTrafo('${App.escapeHTML(dikkatTahminTrafolar[0].trafo.id)}')">
                                Detayları Gör
                            </button>
                        </div>
                    </div>
                </div>
            `;
        } else {
            bannerHTML = `
                <div class="forecast-alert-card alert-card-guvenli collapsible collapsed" onclick="this.classList.toggle('collapsed'); this.parentElement.classList.toggle('expanded');">
                    <div class="forecast-alert-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg></div>
                    <span class="collapsed-text-label">Şebeke Durumu</span>
                    <div class="forecast-alert-details" onclick="event.stopPropagation()">
                        <div class="forecast-alert-left">
                            <div class="forecast-alert-text">
                                <h3>AY SONU PROJEKSİYONU & RİSK BİLDİRİMİ <span class="badge badge-guvenli" style="margin-left:8px;">Tamamen Güvenli</span></h3>
                                <p>
                                    Harika! Tesis geneli ay sonu tahmini reaktif güç oranları güvenli yeşil bölgede öngörülmektedir (Kapasitif Tahmin: %${HesaplamaModulu.formatSayi(genelTahminOran)}, Endüktif Tahmini: %${HesaplamaModulu.formatSayi(genelTahminEndOran)}).
                                    <br>Tüm trafoların ay sonuna kadar ceza sınırlarının ve uyarı eşiklerinin çok altında kalarak konforlu bir şekilde ayı tamamlaması bekleniyor.
                                </p>
                            </div>
                        </div>
                        <div class="forecast-alert-right" style="display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; gap: 8px;">
                                <div class="forecast-alert-metric-box" style="flex: 1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                                    <div class="forecast-alert-metric-label" style="font-size: 11px;">Kapasitif Tahmin</div>
                                    <div class="forecast-alert-metric-val" style="color: var(--color-success); font-size: 16px;">%${HesaplamaModulu.formatSayi(genelTahminOran)}</div>
                                </div>
                                <div class="forecast-alert-metric-box" style="flex: 1; padding: 10px; background: var(--bg-body); border-radius: 8px; border: 1px solid var(--border-color);">
                                    <div class="forecast-alert-metric-label" style="font-size: 11px;">Endüktif Tahmin</div>
                                    <div class="forecast-alert-metric-val" style="color: var(--color-success); font-size: 16px;">%${HesaplamaModulu.formatSayi(genelTahminEndOran)}</div>
                                </div>
                            </div>
                            <button class="forecast-alert-btn btn btn-outline" onclick="event.stopPropagation(); App.navigate('tahmin')">
                                Tahmin Detayları
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        const bannerCharts = document.getElementById('dashboard-forecast-banner');
        const bannerScada = document.getElementById('scada-forecast-banner');
        
        // Wrap the banner in a way that handles the inline display properly
        const finalHTML = bannerHTML ? `<div class="collapsible-alert-wrapper">${bannerHTML}</div>` : '';
        
        if (bannerCharts) bannerCharts.innerHTML = finalHTML;
        if (bannerScada) bannerScada.innerHTML = finalHTML;
    }

    async function renderManeuverBanner() {
        const container = document.getElementById('dashboard-maneuver-banner');
        if (!container) return;

        try {
            const suggestions = await ApiClient.fetchManeuverSuggestions();
            if (!suggestions || suggestions.length === 0) {
                container.innerHTML = `
                    <div class="alert alert-success" style="display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        <div>
                            <strong style="color: var(--color-success);">Sistem Optimizasyonu Tamam</strong>
                            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">Şu an için şebekede yapılması gereken aktif bir manevra önerisi bulunmuyor.</div>
                        </div>
                    </div>
                `;
                return;
            }

            // En yüksek öncelikli olanı bul
            const topSuggestion = suggestions[0];
            const isPredictive = topSuggestion.is_predictive;
            
            container.innerHTML = `
                <div class="collapsible-alert-wrapper">
                    <div class="alert maneuver-alert collapsible collapsed" onclick="toggleManeuverAlert(this)">
                        <div class="maneuver-icon-container">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M13 6h3a2 2 0 0 1 2 2v7"></path><line x1="6" y1="9" x2="6" y2="21"></line></svg>
                        </div>
                        <span class="collapsed-text-label">Manevra Önerisi</span>
                        <div class="maneuver-details-wrapper" onclick="event.stopPropagation()">
                            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <strong class="maneuver-title-text" style="color: var(--color-primary);">Aktif Manevra Önerisi Var</strong>
                                    <span class="badge maneuver-count-badge" style="background: var(--color-primary); color: white; padding: 2px 6px; font-size: 11px; border-radius: 4px;">${suggestions.length} Öneri</span>
                                </div>
                            </div>
                            
                            <div class="maneuver-content-area" style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(49, 116, 246, 0.2);">
                                <div style="font-size: 13px; color: var(--text-secondary); flex: 1; padding-right: 20px;">
                                    <b>${App.escapeHTML(topSuggestion.title)}</b>: ${App.escapeHTML(topSuggestion.description)}
                                </div>
                                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.navigate('manevra')">Manevra Paneline Git</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
        } catch (e) {
            console.error("Manevra önerileri alınamadı:", e);
            container.innerHTML = '';
        }
    }

    async function renderDashboard() {
        const state = App.getState();
        const cacheKey = `${state.selectedYil}_${state.selectedAy}_${state.selectedYontem}`;
        let ozetler;

        document.getElementById('summary-cards').innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-muted);">Sunucudan analizler ve projeksiyonlar çekiliyor... <span class="loading-spinner"></span></div>';
        const bannerCharts = document.getElementById('dashboard-forecast-banner');
        if (bannerCharts) bannerCharts.innerHTML = '';

        // Manevra önerilerini ve Sistem alarmlarını arka planda getir
        renderManeuverBanner();
        if (typeof AlertManager !== 'undefined') AlertManager.loadAlerts(state.selectedYil, state.selectedAy);

        if (_dashboardCache.has(cacheKey)) {
            ozetler = _dashboardCache.get(cacheKey);
            renderForecastBanner(ozetler);
            updateDashboardUI(ozetler);
        } else {
            try {
                const hamOzetler = await ApiClient.fetchAnalysisSummary(state.selectedYil, state.selectedAy);
                
                // Başlangıçta tahminsiz render et (Ekranı anında yüklemek için)
                ozetler = hamOzetler.map(item => {
                    return { 
                        trafo: item.trafo, 
                        ozet: item.ozet ? {
                            ...item.ozet,
                            kapasitifRisk: HesaplamaModulu.riskSeviyesiBelirle(item.ozet.kapasitifOran || 0, 'kapasitif'),
                            enduktifRisk: HesaplamaModulu.riskSeviyesiBelirle(item.ozet.enduktifOran || 0, 'enduktif')
                        } : null, 
                        tahminOzet: null 
                    };
                });
                
                // Tahminleri yükleyene kadar ekranda yükleniyor animasyonu kalsın
                // Sunucuyu yormamak için yine sırayla çekiyoruz, ama UI'ı tek seferde render edeceğiz.
                for (let i = 0; i < hamOzetler.length; i++) {
                    const item = hamOzetler[i];
                    try {
                        const tSonuc = await TahminModulu.aySonuTahminiYap(item.trafo.id, state.selectedYil, state.selectedAy, state.selectedYontem || 'ensemble');
                        if (tSonuc && tSonuc.tumVeriler) {
                            ozetler[i].tahminOzet = HesaplamaModulu.aylikOzetHesapla(tSonuc.tumVeriler);
                        }
                    } catch (e) {
                        console.error(`Tahmin hatası (${item.trafo.id}):`, e);
                    }
                }
                
                _dashboardCache.set(cacheKey, ozetler);
                renderForecastBanner(ozetler);
                updateDashboardUI(ozetler); // Tüm veriler hazır olunca tek seferde render et
                
            } catch (error) {
                document.getElementById('summary-cards').innerHTML = `<div style="padding: 20px; color: var(--color-danger);">Bağlantı hatası: ${error.message}</div>`;
                return;
            }
        }
    }

    function switchDashboardView(viewName) {
        const state = App.getState();
        state.dashboardView = viewName;
        const panelCharts = document.getElementById('dashboard-view-charts');

        if (panelCharts) {
            panelCharts.style.display = viewName === 'charts' ? 'block' : 'none';
        }

        if (viewName === 'charts') {
            renderDashboard();
        }
    }

    function updateDashboardUI(ozetler) {
        const siralamaOnceligi = ['Ümraniye', 'Kartal'];
        ozetler.sort((a, b) => {
            const aName = a.trafo.adi || '';
            const bName = b.trafo.adi || '';
            let aIndex = siralamaOnceligi.findIndex(prefix => aName.includes(prefix));
            let bIndex = siralamaOnceligi.findIndex(prefix => bName.includes(prefix));
            if (aIndex === -1) aIndex = 999;
            if (bIndex === -1) bIndex = 999;
            
            if (aIndex !== bIndex) return aIndex - bIndex;
            return aName.localeCompare(bName);
        });

        const state = App.getState();
        const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
        let guvenliSayisi = 0, dikkatSayisi = 0, riskliSayisi = 0, tehlikeliSayisi = 0;
        let toplamAktif = 0, toplamEnduktif = 0, toplamKapasitif = 0;
        
        let guvenliTrafolar = [];
        let dikkatTrafolar = [];
        let riskliTrafolar = [];

        ozetler.forEach(({ trafo, ozet }) => {
            if (!ozet) return;
            toplamAktif     += ozet.toplamAktif;
            toplamEnduktif  += ozet.toplamEnduktif;
            toplamKapasitif += ozet.toplamKapasitif;

            const _RISK_SIRA = { guvenli: 0, dikkat: 1, riskli: 2, tehlikeli: 3 };
            const kapSev = ozet.kapasitifRisk ? ozet.kapasitifRisk.seviye : 'guvenli';
            const endSev = ozet.enduktifRisk  ? ozet.enduktifRisk.seviye  : 'guvenli';
            const sev = (_RISK_SIRA[kapSev] >= _RISK_SIRA[endSev]) ? kapSev : endSev;
            
            const kapOranText = `%${HesaplamaModulu.formatSayi(ozet.kapasitifOran)}`;
            const endOranText = `%${HesaplamaModulu.formatSayi(ozet.enduktifOran)}`;
            const tText = `${trafo.adi} (Kap: ${kapOranText}, End: ${endOranText})`;

            if (sev === 'guvenli' || sev === 'normal') {
                guvenliSayisi++;
                guvenliTrafolar.push(tText);
            }
            else if (sev === 'dikkat') {
                dikkatSayisi++;
                dikkatTrafolar.push(tText);
            }
            else {
                riskliSayisi++;
                tehlikeliSayisi++;
                riskliTrafolar.push(tText);
            }
        });
        
        const guvenliTitle = guvenliTrafolar.length > 0 ? "Güvenli Trafolar:\n" + guvenliTrafolar.join('\n') : "Güvenli trafo yok";
        const dikkatTitle = dikkatTrafolar.length > 0 ? "Dikkat Durumundaki Trafolar:\n" + dikkatTrafolar.join('\n') : "Dikkat durumunda trafo yok";
        const riskliTitle = riskliTrafolar.length > 0 ? "Riskli Trafolar:\n" + riskliTrafolar.join('\n') : "Riskli trafo yok";

        document.getElementById('summary-cards').innerHTML = `
            <div class="summary-card card-total custom-tooltip-container" style="cursor: pointer;" onclick="DashboardUI.filterTrafos('all')">
                <div class="custom-tooltip">Tüm Trafoları Göster</div>
                <div class="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="5"></circle><circle cx="15" cy="12" r="5"></circle><line x1="1" y1="12" x2="4" y2="12"></line><line x1="20" y1="12" x2="23" y2="12"></line></svg></div>
                <div class="card-content">
                    <div class="card-value">${ozetler.length}</div>
                    <div class="card-label">Toplam Trafo</div>
                </div>
            </div>
            <div class="summary-card card-safe custom-tooltip-container" style="cursor: pointer;" onclick="DashboardUI.filterTrafos('guvenli')">
                <div class="custom-tooltip">${App.escapeHTML(guvenliTitle)}</div>
                <div class="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg></div>
                <div class="card-content">
                    <div class="card-value">${guvenliSayisi}</div>
                    <div class="card-label">Güvenli / Normal</div>
                </div>
            </div>
            <div class="summary-card card-warning custom-tooltip-container" style="cursor: pointer;" onclick="DashboardUI.filterTrafos('dikkat')">
                <div class="custom-tooltip">${App.escapeHTML(dikkatTitle)}</div>
                <div class="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg></div>
                <div class="card-content">
                    <div class="card-value">${dikkatSayisi}</div>
                    <div class="card-label">Dikkat Durumu</div>
                </div>
            </div>
            <div class="summary-card card-danger custom-tooltip-container" style="cursor: pointer;" onclick="DashboardUI.filterTrafos('riskli')">
                <div class="custom-tooltip">${App.escapeHTML(riskliTitle)}</div>
                <div class="card-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg></div>
                <div class="card-content">
                    <div class="card-value">${riskliSayisi}</div>
                    <div class="card-label">Ceza Riski</div>
                </div>
            </div>
        `;

        if (typeof GrafikModulu !== 'undefined') {
            GrafikModulu.createDashboardBarChart('chart-dashboard-bar', ozetler, _chartType);
        }

        const ayBadge = document.getElementById('dashboard-ay-badge');
        if (ayBadge) ayBadge.style.display = 'none'; // Kullanıcı isteği: tarih ibaresi kaldırıldı

        const gridEl = document.getElementById('trafo-grid');
        if (!gridEl) return;
        
        // Mevcut açık olan detay sekmelerini kaydet
        const expandedIds = [];
        gridEl.querySelectorAll('.trafo-card.expanded').forEach(card => {
            const idMatch = card.id.match(/trafo-card-(.+)/);
            if (idMatch) expandedIds.push(idMatch[1]);
        });

        gridEl.innerHTML = ozetler.map(({ trafo, ozet, tahminOzet }, idx) => {
            if (!ozet) return '';

            const _RISK_SIRA = { guvenli: 0, dikkat: 1, riskli: 2, tehlikeli: 3 };
            const kapRisk = ozet.kapasitifRisk || HesaplamaModulu.riskSeviyesiBelirle(ozet.kapasitifOran || 0, 'kapasitif');
            const endRisk = ozet.enduktifRisk  || HesaplamaModulu.riskSeviyesiBelirle(ozet.enduktifOran  || 0, 'enduktif');
            const risk = (_RISK_SIRA[kapRisk.seviye] >= _RISK_SIRA[endRisk.seviye]) ? kapRisk : endRisk;

            const ratio = Math.min((ozet.kapasitifOran / 20) * 100, 100);
            const limitPos = (15 / 20) * 100;
            
            const endRatio = Math.min((ozet.enduktifOran / 25) * 100, 100);
            const endLimitPos = (20 / 25) * 100;

            const tOran = tahminOzet ? tahminOzet.kapasitifOran : ozet.kapasitifOran;
            const tRisk = tahminOzet && tahminOzet.kapasitifRisk ? tahminOzet.kapasitifRisk : HesaplamaModulu.riskSeviyesiBelirle(tOran || 0, 'kapasitif');
            
            const tEndOran = tahminOzet ? tahminOzet.enduktifOran : ozet.enduktifOran;
            const tEndRisk = tahminOzet && tahminOzet.enduktifRisk ? tahminOzet.enduktifRisk : HesaplamaModulu.riskSeviyesiBelirle(tEndOran || 0, 'enduktif');

            return `
                <div class="trafo-card risk-${risk.seviye}" id="trafo-card-${trafo.id}" style="animation-delay: ${idx * 0.06}s"
                     onclick="if(typeof DashboardUI !== 'undefined') DashboardUI.toggleTrafoDetail('${App.escapeHTML(trafo.id)}')">
                    <div class="trafo-card-main">
                        <div class="trafo-card-header">
                            <div style="flex: 1; min-width: 0; padding-right: 8px;">
                                <h3 style="margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${App.escapeHTML(trafo.adi)}">
                                    ${App.escapeHTML(trafo.adi)}
                                </h3>
                                <div class="trafo-tip">${trafo.tip ? App.escapeHTML(trafo.tip) + ' · ' : ''}${App.escapeHTML(trafo.bolge)}</div>
                            </div>
                            <span class="badge badge-${risk.seviye}" style="flex-shrink: 0; white-space: nowrap;">${risk.ikon || ''} ${risk.etiket || risk.seviye.toUpperCase()}</span>
                        </div>
                        <div class="trafo-card-stats" style="gap: 12px;">
                            <div class="trafo-stat">
                                <span class="trafo-stat-label">Kapasitif Oran</span>
                                <span class="trafo-stat-value highlight" style="color:${kapRisk.renk || 'var(--text)'}">
                                    %${HesaplamaModulu.formatSayi(ozet.kapasitifOran)}
                                </span>
                            </div>
                            <div class="trafo-stat">
                                <span class="trafo-stat-label">Kap. Tahmini</span>
                                <span class="trafo-stat-value highlight" style="color:${tRisk.renk || 'var(--text)'}">
                                    %${HesaplamaModulu.formatSayi(tOran)}
                                </span>
                            </div>
                            <div class="trafo-stat">
                                <span class="trafo-stat-label">Endüktif Oran</span>
                                <span class="trafo-stat-value" style="color:${endRisk.renk || 'var(--text)'}">
                                    %${HesaplamaModulu.formatSayi(ozet.enduktifOran)}
                                    ${(_RISK_SIRA[endRisk.seviye] >= 2) ? `<span class="badge badge-${endRisk.seviye}" style="font-size:9px;margin-left:4px;">${endRisk.ikon}</span>` : ''}
                                </span>
                            </div>
                            <div class="trafo-stat">
                                <span class="trafo-stat-label">End. Tahmini</span>
                                <span class="trafo-stat-value highlight" style="color:${tEndRisk.renk || 'var(--text)'}">
                                    %${HesaplamaModulu.formatSayi(tEndOran)}
                                </span>
                            </div>
                            <div class="trafo-stat" style="margin-right: 15px;">
                                <span class="trafo-stat-label">Aktif Enerji</span>
                                <span class="trafo-stat-value">${HesaplamaModulu.formatEnerji(ozet.toplamAktif)}</span>
                            </div>
                        </div>

                        <div class="ratio-meter" style="display: flex; flex-direction: column; justify-content: center; gap: 15px; min-width: 120px; width: 100%;">
                            <div class="ratio-meter-bar" title="Kapasitif Oran: %${HesaplamaModulu.formatSayi(ozet.kapasitifOran)}">
                                <div class="ratio-meter-fill" style="width:${ratio}%; background:${kapRisk.renk || 'var(--color-primary)'}"></div>
                                <div class="ratio-meter-limit" style="left:${limitPos}%" data-label="%15"></div>
                            </div>
                            <div class="ratio-meter-bar" title="Endüktif Oran: %${HesaplamaModulu.formatSayi(ozet.enduktifOran)}">
                                <div class="ratio-meter-fill" style="width:${endRatio}%; background:${endRisk.renk || 'var(--color-primary)'}"></div>
                                <div class="ratio-meter-limit limit-bottom" style="left:${endLimitPos}%" data-label="%20"></div>
                            </div>
                        </div>

                        <div class="trafo-card-actions" style="display: flex; align-items: center; gap: 10px;">
                            <button class="btn btn-sm btn-primary" onclick="event.stopPropagation(); if(typeof TopolojiModulu !== 'undefined') TopolojiModulu.openPowerTriangleModal('${App.escapeHTML(trafo.id)}')" style="font-size: 11px; padding: 4px 10px;">Güç Üçgeni</button>
                            <svg class="trafo-expand-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="cursor:pointer;"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </div>
                    <div class="trafo-card-details" id="trafo-details-${trafo.id}" onclick="event.stopPropagation();">
                        <!-- Details will be injected here on expand -->
                    </div>
                </div>
            `;
        }).join('');

        // Açık olan detay sekmelerini tekrar aç
        setTimeout(() => {
            expandedIds.forEach(id => {
                if (typeof DashboardUI !== 'undefined') {
                    DashboardUI.toggleTrafoDetail(id);
                }
            });
            // Apply current filter after generating cards
            filterTrafos(_currentFilter, false);
        }, 50);
    }

    function clearCache() {
        _dashboardCache.clear();
        // Apply current filter after generating cards
        filterTrafos(_currentFilter, false);
    }
    
    function filterTrafos(status, scrollToGrid = true) {
        _currentFilter = status;
        const gridEl = document.getElementById('trafo-grid');
        if (!gridEl) return;
        
        const cards = gridEl.querySelectorAll('.trafo-card');
        cards.forEach(card => {
            if (status === 'all') {
                card.style.display = 'flex'; // It's a flex container
            } else if (status === 'guvenli' && (card.classList.contains('risk-guvenli') || card.classList.contains('risk-normal'))) {
                card.style.display = 'flex';
            } else if (status === 'dikkat' && card.classList.contains('risk-dikkat')) {
                card.style.display = 'flex';
            } else if (status === 'riskli' && (card.classList.contains('risk-riskli') || card.classList.contains('risk-tehlikeli'))) {
                card.style.display = 'flex';
            } else {
                card.style.display = 'none';
            }
        });
        
        // Update filter button styles if they exist
        ['all', 'guvenli', 'dikkat', 'riskli'].forEach(key => {
            const btn = document.getElementById(`btn-filter-${key}`);
            if (btn) {
                if (key === status) {
                    btn.classList.add('btn-primary');
                    btn.classList.remove('btn-outline');
                } else {
                    btn.classList.add('btn-outline');
                    btn.classList.remove('btn-primary');
                }
            }
        });
        
        if (scrollToGrid) {
            const header = document.querySelector('.section-header h2');
            if (header) {
                header.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                gridEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    async function toggleTrafoDetail(trafoId) {
        const cardEl = document.getElementById(`trafo-card-${trafoId}`);
        const detailsEl = document.getElementById(`trafo-details-${trafoId}`);
        if (!cardEl || !detailsEl) return;

        const isExpanded = cardEl.classList.contains('expanded');
        
        if (isExpanded) {
            // Collapse
            cardEl.classList.remove('expanded');
        } else {
            // Expand
            cardEl.classList.add('expanded');
            
            // Render details if not already rendered
            if (!detailsEl.hasAttribute('data-rendered')) {
                detailsEl.innerHTML = '<div style="padding: 20px; text-align: center;">Yükleniyor... <span class="loading-spinner"></span></div>';
                if (typeof DetailUI !== 'undefined' && DetailUI.renderTrafoDetayInContainer) {
                    await DetailUI.renderTrafoDetayInContainer(trafoId, detailsEl);
                    detailsEl.setAttribute('data-rendered', 'true');
                } else {
                    detailsEl.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--color-danger);">Detay modülü yüklenemedi.</div>';
                }
            }
        }
    }

    function toggleChartType(type) {
        _chartType = type;
        const state = App.getState();
        const cacheKey = `${state.selectedYil}_${state.selectedAy}_${state.selectedYontem}`;
        const ozetler = _dashboardCache.get(cacheKey) || state.lastOzetler;
        
        if (ozetler && typeof GrafikModulu !== 'undefined') {
            GrafikModulu.createDashboardBarChart('chart-dashboard-bar', ozetler, _chartType);
        }
        
        const btnKap = document.getElementById('btn-chart-kapasitif');
        const btnEnd = document.getElementById('btn-chart-enduktif');
        const title = document.getElementById('dashboard-chart-title');
        
        if (type === 'kapasitif') {
            if (btnKap) { btnKap.classList.remove('btn-outline'); btnKap.classList.add('btn-primary'); }
            if (btnEnd) { btnEnd.classList.remove('btn-primary'); btnEnd.classList.add('btn-outline'); }
            if (title) title.innerText = 'Trafo Kapasitif Oranları';
        } else {
            if (btnEnd) { btnEnd.classList.remove('btn-outline'); btnEnd.classList.add('btn-primary'); }
            if (btnKap) { btnKap.classList.remove('btn-primary'); btnKap.classList.add('btn-outline'); }
            if (title) title.innerText = 'Trafo Endüktif Oranları';
        }
    }

    return {
        renderDashboard,
        renderForecastBanner,
        switchDashboardView,
        updateDashboardUI,
        clearCache,
        toggleTrafoDetail,
        toggleChartType,
        filterTrafos
    };
})();

window.toggleManeuverAlert = async function(element) {
    if (!element.classList.contains('collapsed')) {
        element.classList.add('collapsed');
        element.parentElement.classList.remove('expanded');
        return;
    }
    
    // Yükleniyor durumu
    const iconContainer = element.querySelector('.maneuver-icon-container');
    const originalIcon = iconContainer.innerHTML;
    iconContainer.innerHTML = '<span class="loading-spinner" style="width:20px;height:20px;border-width:2px;display:inline-block;"></span>';
    const textSpan = element.querySelector('.maneuver-title-text');
    const originalText = textSpan.innerText;
    textSpan.innerText = 'Güncel Öneriler Hesaplanıyor...';
    
    try {
        const suggestions = await ApiClient.fetchManeuverSuggestions();
        const contentArea = element.querySelector('.maneuver-content-area');
        const badgeSpan = element.querySelector('.maneuver-count-badge');
        
        if (!suggestions || suggestions.length === 0) {
            element.className = "alert alert-success";
            element.style = "display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); width: 100%;";
            element.onclick = null;
            element.parentElement.classList.add('expanded');
            element.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <div>
                    <strong style="color: var(--color-success);">Sistem Optimizasyonu Tamam</strong>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">Şu an için şebekede yapılması gereken aktif bir manevra önerisi bulunmuyor.</div>
                </div>
            `;
            return;
        }
        
        const topSuggestion = suggestions[0];
        badgeSpan.innerText = `${suggestions.length} Öneri`;
        contentArea.innerHTML = `
            <div style="font-size: 13px; color: var(--text-secondary); flex: 1; padding-right: 20px;">
                <b>${App.escapeHTML(topSuggestion.title)}</b>: ${App.escapeHTML(topSuggestion.description)}
            </div>
            <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); App.navigate('manevra')">Manevra Paneline Git</button>
        `;
        
        iconContainer.innerHTML = originalIcon;
        textSpan.innerText = originalText;
        element.classList.remove('collapsed');
        element.parentElement.classList.add('expanded');
        
    } catch(e) {
        console.error(e);
        iconContainer.innerHTML = originalIcon;
        textSpan.innerText = originalText;
        element.classList.remove('collapsed');
        element.parentElement.classList.add('expanded');
    }
}

// Dışarıya tıklandığında popover menüleri kapatma
document.addEventListener('click', function(event) {
    const openAlerts = document.querySelectorAll('.collapsible:not(.collapsed)');
    openAlerts.forEach(alert => {
        if (!alert.contains(event.target)) {
            alert.classList.add('collapsed');
            if (alert.parentElement) {
                alert.parentElement.classList.remove('expanded');
            }
        }
    });
});
