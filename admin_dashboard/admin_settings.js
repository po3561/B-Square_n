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
        const db = firebase.database();
        const snap = await db.ref('site_settings').once('value');
        const settings = snap.val() || {};

        if (type === 'homepage') {
            document.getElementById('settingSiteName').value = settings.siteName || '';
            document.getElementById('settingSiteURL').value = settings.siteURL || '';
            
            const logoURL = settings.logoURL || '';
            const faviconURL = settings.faviconURL || '';
            
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
            document.getElementById('setFooterCompany').value = settings.companyName || '';
            document.getElementById('setFooterCEO').value = settings.ceoName || '';
            document.getElementById('setFooterAddress').value = settings.address || '';
            document.getElementById('setFooterBizNum').value = settings.bizNum || '';
            document.getElementById('setFooterMailNum').value = settings.mailOrderNum || '';
            document.getElementById('setFooterCS').value = settings.csPhone || '';
            document.getElementById('setFooterEmail').value = settings.csEmail || '';
        } 
        else if (type === 'seo') {
            const seo = settings.seo || {};
            document.getElementById('seoTitle').value = seo.title || '';
            document.getElementById('seoDescription').value = seo.description || '';
            document.getElementById('seoKeywords').value = seo.keywords || '';
            document.getElementById('seoImage').value = seo.image || '';
        }
    } catch (err) {
        console.error("Failed to load site settings", err);
        if (err.message && err.message.toLowerCase().includes('permission_denied')) {
            const banner = document.getElementById('globalErrorBanner');
            if (banner) {
                banner.style.display = 'flex';
                banner.innerHTML = `
                    <div style="flex:1;">
                        <strong style="display:block; margin-bottom:0.3rem;">데이터베이스 접근이 거부되었습니다. (Permission Denied)</strong>
                        <span style="font-size:0.85rem; opacity:0.9; display:block; margin-bottom:0.3rem;">Firebase 익명 로그인이 꺼져있거나 규칙이 누락되었습니다.</span>
                        <span style="font-size:0.8rem; opacity:0.8; display:block;">해결 방법 1: Firebase Console -> Authentication -> Sign-in method -> 익명(Anonymous) 사용 설정<br>
                        해결 방법 2: firebase_rules.json 최신 버전을 복사 후 Realtime Database -> 규칙(Rules)에 게시</span>
                    </div>
                    <button onclick="this.parentElement.style.display='none'" style="background:none; border:none; color:inherit; font-size:1.2rem; cursor:pointer; padding:0 0.5rem;">&times;</button>
                `;
            }
        }
    }
}

async function saveSiteSettings(type) {
    try {
        const db = firebase.database();
        const updates = {};

        if (type === 'homepage') {
            updates['site_settings/siteName'] = document.getElementById('settingSiteName').value.trim();
            updates['site_settings/siteURL'] = document.getElementById('settingSiteURL').value.trim();
            updates['site_settings/logoURL'] = document.getElementById('settingLogoURL').value.trim();
            updates['site_settings/faviconURL'] = document.getElementById('settingFaviconURL').value.trim();

            const bannerItems = document.querySelectorAll('.banner-item');
            const banners = Array.from(bannerItems).map(item => {
                return {
                    imgUrl: item.querySelector('.banner-img-input').value.trim(),
                    linkUrl: item.querySelector('.banner-link-input').value.trim()
                };
            }).filter(b => b.imgUrl !== ''); // 빈 이미지는 무시
            
            updates['site_settings/banners'] = banners;
        } 
        else if (type === 'footer') {
            updates['site_settings/companyName'] = document.getElementById('setFooterCompany').value.trim();
            updates['site_settings/ceoName'] = document.getElementById('setFooterCEO').value.trim();
            updates['site_settings/address'] = document.getElementById('setFooterAddress').value.trim();
            updates['site_settings/bizNum'] = document.getElementById('setFooterBizNum').value.trim();
            updates['site_settings/mailOrderNum'] = document.getElementById('setFooterMailNum').value.trim();
            updates['site_settings/csPhone'] = document.getElementById('setFooterCS').value.trim();
            updates['site_settings/csEmail'] = document.getElementById('setFooterEmail').value.trim();
        } 
        else if (type === 'seo') {
            updates['site_settings/seo'] = {
                title: document.getElementById('seoTitle').value.trim(),
                description: document.getElementById('seoDescription').value.trim(),
                keywords: document.getElementById('seoKeywords').value.trim(),
                image: document.getElementById('seoImage').value.trim(),
            };
        }

        await db.ref().update(updates);
        
        let msg = "저장되었습니다.";
        if (type === 'homepage') msg = "홈페이지 설정이 저장되었습니다.";
        else if (type === 'footer') msg = "푸터 설정이 저장되었습니다.";
        else if (type === 'seo') msg = "SEO 설정이 저장되었습니다.";
        
        alert(msg);
        
    } catch (err) {
        console.error("Failed to save site settings", err);
        if (err.message && err.message.toLowerCase().includes('permission_denied')) {
            const banner = document.getElementById('globalErrorBanner');
            if (banner) {
                banner.style.display = 'flex';
                banner.innerHTML = `
                    <div style="flex:1;">
                        <strong style="display:block; margin-bottom:0.3rem;">데이터베이스 저장이 거부되었습니다. (Permission Denied)</strong>
                        <span style="font-size:0.85rem; opacity:0.9; display:block; margin-bottom:0.3rem;">Firebase 익명 로그인이 꺼져있거나 규칙이 누락되었습니다.</span>
                        <span style="font-size:0.8rem; opacity:0.8; display:block;">해결 방법 1: Firebase Console -> Authentication -> Sign-in method -> 익명(Anonymous) 사용 설정<br>
                        해결 방법 2: firebase_rules.json 최신 버전을 복사 후 Realtime Database -> 규칙(Rules)에 게시</span>
                    </div>
                    <button onclick="this.parentElement.style.display='none'" style="background:none; border:none; color:inherit; font-size:1.2rem; cursor:pointer; padding:0 0.5rem;">&times;</button>
                `;
            }
        }
        alert("설정 저장에 실패했습니다.");
    }
}
