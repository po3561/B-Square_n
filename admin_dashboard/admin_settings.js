// admin_settings.js - Handles Global Site Settings (Homepage & Footer)

document.addEventListener('DOMContentLoaded', () => {
    const tabHomepage = document.getElementById('tabHomepage');
    const tabFooter = document.getElementById('tabFooter');
    const tabSEO = document.getElementById('tabSEO');
    
    // Check if we start on one of these tabs
    if (tabHomepage && tabHomepage.classList.contains('active')) {
        loadSiteSettings('homepage');
    } else if (tabFooter && tabFooter.classList.contains('active')) {
        loadSiteSettings('footer');
    } else if (tabSEO && tabSEO.classList.contains('active')) {
        loadSiteSettings('seo');
    }

    // Add Banner Button
    document.getElementById('btnAddBanner')?.addEventListener('click', () => {
        window.addBannerItem();
    });

    // Listen for tab changes
    window.addEventListener('adminTabChanged', (e) => {
        if (e.detail.tabId === 'tabHomepage') {
            loadSiteSettings('homepage');
        } else if (e.detail.tabId === 'tabFooter') {
            loadSiteSettings('footer');
        } else if (e.detail.tabId === 'tabSEO') {
            loadSiteSettings('seo');
        }
    });

    // Save Homepage Settings
    document.getElementById('btnSaveHomepage')?.addEventListener('click', async () => {
        await saveSiteSettings('homepage');
    });

    // Save Footer Settings
    document.getElementById('btnSaveFooter')?.addEventListener('click', async () => {
        await saveSiteSettings('footer');
    });

    // Save SEO Settings
    document.getElementById('btnSaveSEO')?.addEventListener('click', async () => {
        await saveSiteSettings('seo');
    });

    // Image Compression Utility
    function compressImage(file, maxWidth = 800, quality = 0.8) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width;
                    let h = img.height;
                    
                    // Always try to maintain some ratio, but clamp width.
                    if (w > maxWidth) {
                        h = Math.round(h * maxWidth / w);
                        w = maxWidth;
                    }
                    
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    // Convert back to base64
                    resolve(canvas.toDataURL('image/webp', quality));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // Logo Upload Handling
    document.getElementById('settingLogoFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            // Compress logo (logos don't need to be huge, max 600px width is plenty)
            const compressedBase64 = await compressImage(file, 600, 0.9);
            
            // Set hidden input value for DB save
            document.getElementById('settingLogoURL').value = compressedBase64;
            
            // Update UI Previews
            const preview = document.getElementById('previewLogo');
            preview.src = compressedBase64;
            preview.style.display = 'block';
            document.getElementById('logoPlaceholderTxt').style.display = 'none';
        } catch (err) {
            console.error('Logo compression failed:', err);
            alert('이미지 처리 중 오류가 발생했습니다.');
        }
    });

    document.getElementById('btnRemoveLogo')?.addEventListener('click', () => {
        document.getElementById('settingLogoURL').value = '';
        document.getElementById('settingLogoFile').value = '';
        document.getElementById('previewLogo').style.display = 'none';
        document.getElementById('logoPlaceholderTxt').style.display = 'inline';
    });

    // Favicon Upload Handling
    document.getElementById('settingFaviconFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            // Favicons should be small (e.g. 192x192 max is safe)
            const compressedBase64 = await compressImage(file, 192, 0.9);
            
            document.getElementById('settingFaviconURL').value = compressedBase64;
            
            const preview = document.getElementById('previewFavicon');
            preview.src = compressedBase64;
            preview.style.display = 'block';
            document.getElementById('faviconPlaceholderTxt').style.display = 'none';
        } catch (err) {
            console.error('Favicon compression failed:', err);
            alert('이미지 처리 중 오류가 발생했습니다.');
        }
    });

    document.getElementById('btnRemoveFavicon')?.addEventListener('click', () => {
        document.getElementById('settingFaviconURL').value = '';
        document.getElementById('settingFaviconFile').value = '';
        document.getElementById('previewFavicon').style.display = 'none';
        document.getElementById('faviconPlaceholderTxt').style.display = 'inline';
    });
});

// Banner Component Builder
window.addBannerItem = function(imgUrl = '', linkUrl = '') {
    const container = document.getElementById('bannerListContainer');
    if (!container) return;

    const div = document.createElement('div');
    div.className = 'banner-item admin-grid-layout';
    div.style.cssText = 'display:grid; grid-template-columns: 100px 1fr auto; gap:1rem; align-items:center; background:#fff; padding:1rem; border:1px solid var(--mac-border-light); border-radius:8px;';

    // Unique ID for the file input
    const uniqueId = 'bannerFile_' + Date.now() + Math.floor(Math.random() * 1000);

    div.innerHTML = `
        <div class="banner-preview" style="width:100px; height:60px; background:#f5f5f7; border-radius:6px; overflow:hidden; display:flex; justify-content:center; align-items:center; border:1px solid var(--mac-border-light);">
            <img src="${imgUrl}" alt="Banner" style="max-width:100%; max-height:100%; display:${imgUrl ? 'block' : 'none'};">
            <span style="font-size:0.7rem; color:var(--mac-text-muted); display:${imgUrl ? 'none' : 'block'};">No Image</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.5rem;">
            <div style="display:flex; gap:0.5rem; align-items:center;">
                <input type="file" id="${uniqueId}" accept="image/*" style="display:none;">
                <button type="button" class="btn-small outline banner-upload-btn" style="white-space:nowrap;">배너 업로드</button>
                <input type="text" class="admin-form-input banner-img-input" placeholder="업로드 시 자동 변환된 코드가 들어갑니다." value="${imgUrl}" style="margin:0; background:#f9f9fb;" readonly>
            </div>
            <input type="text" class="admin-form-input banner-link-input" placeholder="클릭 시 이동할 링크 URL" value="${linkUrl}" style="margin:0;">
        </div>
        <button type="button" class="btn-remove-banner" style="background:none; border:none; color:var(--mac-danger); font-size:1.2rem; cursor:pointer; padding:0.5rem;">&times;</button>
    `;

    // Upload Handler
    const fileInput = div.querySelector(`#${uniqueId}`);
    const uploadBtn = div.querySelector('.banner-upload-btn');
    const imgInput = div.querySelector('.banner-img-input');
    const previewImg = div.querySelector('.banner-preview img');
    const previewSpan = div.querySelector('.banner-preview span');

    uploadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Banners shouldn't be too heavy. Resize to 1200px max width.
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > 1200) {
                    h = Math.round(h * 1200 / w);
                    w = 1200;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                
                const base64 = canvas.toDataURL('image/webp', 0.8);
                imgInput.value = base64;
                previewImg.src = base64;
                previewImg.style.display = 'block';
                previewSpan.style.display = 'none';
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    });

    // Remove Handler
    div.querySelector('.btn-remove-banner').addEventListener('click', () => {
        div.remove();
    });

    container.appendChild(div);
};

async function loadSiteSettings(type) {
    try {
        if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
        const res = await window.BSQ.api('/api/site-settings');

        if (!res || !res.success) {
            throw new Error(res?.error || 'Failed to load settings');
        }

        const settings = res.data || {};
        // 전역 캐시 업데이트 (배너 업데이트 등을 위해)
        window.__BSQ_SITE_SETTINGS__ = settings;

        if (type === 'homepage') {
            document.getElementById('settingSiteName').value = settings.site_name || '';
            document.getElementById('settingSiteURL').value = settings.site_url || '';
            
            const logoURL = settings.logo_url || '';
            const faviconURL = settings.favicon_url || '';
            
            document.getElementById('settingLogoURL').value = logoURL;
            if (logoURL) {
                document.getElementById('previewLogo').src = logoURL;
                document.getElementById('previewLogo').style.display = 'block';
                const el = document.getElementById('logoPlaceholderTxt');
                if (el) el.style.display = 'none';
            }
            
            document.getElementById('settingFaviconURL').value = faviconURL;
            if (faviconURL) {
                document.getElementById('previewFavicon').src = faviconURL;
                document.getElementById('previewFavicon').style.display = 'block';
                const el = document.getElementById('faviconPlaceholderTxt');
                if (el) el.style.display = 'none';
            }

            // Load Banners
            const container = document.getElementById('bannerListContainer');
            if (container) {
                container.innerHTML = ''; // clear existing
                const banners = settings.banners || [];
                if (typeof window.addBannerItem === 'function') {
                    banners.forEach(b => window.addBannerItem(b.imgUrl, b.linkUrl));
                }
            }
        } 
        else if (type === 'footer') {
            document.getElementById('setFooterCompany').value = settings.company_name || '';
            document.getElementById('setFooterCEO').value = settings.ceo_name || '';
            document.getElementById('setFooterAddress').value = settings.address || '';
            document.getElementById('setFooterBizNum').value = settings.biz_num || '';
            document.getElementById('setFooterMailNum').value = settings.mail_order_num || '';
            document.getElementById('setFooterCS').value = settings.cs_phone || '';
            document.getElementById('setFooterEmail').value = settings.cs_email || '';
        } 
        else if (type === 'seo') {
            const seo = settings.seo || {};
            document.getElementById('seoTitle').value = seo.title || '';
            document.getElementById('seoDescription').value = seo.description || '';
            document.getElementById('seoKeywords').value = seo.keywords || '';
            document.getElementById('seoImage').value = seo.image || '';
        }
    } catch (err) {
        console.error("Failed to load site settings from D1:", err);
        alert("설정을 불러오는데 실패했습니다: " + err.message);
    }
}

async function saveSiteSettings(type) {
    const btn = document.querySelector(`.btn-primary[onclick="saveSiteSettings('${type}')"]`) || document.getElementById('btnSaveSettings');
    if (btn) {
        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = '저장 중...';
    }

    try {
        // 기존 캐시된 데이터 가져오기
        if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;
        const resCurrent = await window.BSQ.api('/api/site-settings');
        const currentData = resCurrent.success ? resCurrent.data : {};

        const payload = { ...currentData };

        if (type === 'homepage') {
            payload.site_name = document.getElementById('settingSiteName').value.trim();
            payload.site_url = document.getElementById('settingSiteURL').value.trim();
            payload.logo_url = document.getElementById('settingLogoURL').value.trim();
            payload.favicon_url = document.getElementById('settingFaviconURL').value.trim();

            const bannerItems = document.querySelectorAll('.banner-item');
            const banners = Array.from(bannerItems).map(item => {
                return {
                    imgUrl: item.querySelector('.banner-img-input').value.trim(),
                    linkUrl: item.querySelector('.banner-link-input').value.trim()
                };
            }).filter(b => b.imgUrl !== '');
            
            payload.banners = banners;
        } 
        else if (type === 'footer') {
            payload.company_name = document.getElementById('setFooterCompany').value.trim();
            payload.ceo_name = document.getElementById('setFooterCEO').value.trim();
            payload.address = document.getElementById('setFooterAddress').value.trim();
            payload.biz_num = document.getElementById('setFooterBizNum').value.trim();
            payload.mail_order_num = document.getElementById('setFooterMailNum').value.trim();
            payload.cs_phone = document.getElementById('setFooterCS').value.trim();
            payload.cs_email = document.getElementById('setFooterEmail').value.trim();
        } 
        else if (type === 'seo') {
            payload.seo = {
                title: document.getElementById('seoTitle').value.trim(),
                description: document.getElementById('seoDescription').value.trim(),
                keywords: document.getElementById('seoKeywords').value.trim(),
                image: document.getElementById('seoImage').value.trim(),
            };
        }

        const res = await window.BSQ.api('/api/site-settings', {
            method: 'POST',
            body: payload
        });

        if (res && res.success) {
            alert("설정이 저장되었습니다.");
            loadSiteSettings(type);
        } else {
            throw new Error(res?.error || "Save failed");
        }
        
    } catch (err) {
        console.error("Failed to save site settings to D1:", err);
        alert("설정 저장에 실패했습니다: " + err.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '설정 저장하기';
        }
    }
}
