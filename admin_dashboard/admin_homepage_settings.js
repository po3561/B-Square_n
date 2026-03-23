// admin_homepage_settings.js - homepage / footer settings for admin dashboard

(function () {
  'use strict';

  const MEDIA_CONFIG = {
    logo: {
      fileId: 'settingLogoFile',
      valueId: 'settingLogoURL',
      previewId: 'previewLogo',
      placeholderId: 'logoPlaceholderTxt',
      sizeId: 'logoSizeHint',
      recommended: '권장 480 × 120px · PNG/WebP',
    },
    favicon: {
      fileId: 'settingFaviconFile',
      valueId: 'settingFaviconURL',
      previewId: 'previewFavicon',
      placeholderId: 'faviconPlaceholderTxt',
      sizeId: 'faviconSizeHint',
      recommended: '권장 512 × 512px · PNG/ICO/WebP',
    },
  };

  const BANNER_CONFIG = {
    main: {
      containerId: 'bannerListContainer',
      emptyText: '메인 배너가 없습니다. + 메인 배너 추가 버튼으로 등록해 주세요.',
      recommended: '권장 1600 × 500px · 16:5 비율',
      label: '메인 홈페이지 광고 배너',
      previewRatio: '16 / 5',
    },
    bottom: {
      containerId: 'bottomBannerListContainer',
      emptyText: '하단 배너가 없습니다. + 하단 배너 추가 버튼으로 등록해 주세요.',
      recommended: '권장 3200 × 600px · 16:3 비율',
      label: '하단 배너',
      previewRatio: '16 / 3',
    },
  };

  const $ = (id) => document.getElementById(id);

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    const size = Number(bytes || 0);
    if (!size) return '0 KB';
    if (size < 1024) return `${size} B`;
    const kb = size / 1024;
    if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
  }

  function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value ?? '';
  }

  function getContainer(section) {
    return $(BANNER_CONFIG[section]?.containerId || '');
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  function readImageMeta(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        resolve({
          width: img.naturalWidth || img.width || 0,
          height: img.naturalHeight || img.height || 0,
        });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  }

  function setMediaPlaceholder(section, visible) {
    const cfg = MEDIA_CONFIG[section];
    const preview = $(cfg.previewId);
    const placeholder = $(cfg.placeholderId);
    const sizeHint = $(cfg.sizeId);
    if (preview) preview.style.display = visible ? 'none' : 'block';
    if (placeholder) placeholder.style.display = visible ? 'inline' : 'none';
    if (sizeHint) sizeHint.textContent = cfg.recommended;
  }

  async function applyMediaFile(section, file) {
    const cfg = MEDIA_CONFIG[section];
    if (!cfg || !file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    const dataUrl = await readFileAsDataURL(file);
    const meta = await readImageMeta(dataUrl);
    setValue(cfg.valueId, dataUrl);

    const preview = $(cfg.previewId);
    const placeholder = $(cfg.placeholderId);
    const sizeHint = $(cfg.sizeId);

    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (sizeHint) {
      const dimensionText = meta ? `${meta.width} × ${meta.height}px` : '이미지 업로드됨';
      sizeHint.textContent = `${dimensionText} · ${formatBytes(file.size)} · ${cfg.recommended}`;
    }
  }

  function resetMediaFile(section) {
    const cfg = MEDIA_CONFIG[section];
    if (!cfg) return;
    setValue(cfg.valueId, '');
    const fileInput = $(cfg.fileId);
    if (fileInput) fileInput.value = '';
    const preview = $(cfg.previewId);
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    const placeholder = $(cfg.placeholderId);
    if (placeholder) placeholder.style.display = 'inline';
    const sizeHint = $(cfg.sizeId);
    if (sizeHint) sizeHint.textContent = cfg.recommended;
  }

  function setBannerEmptyState(section) {
    const config = BANNER_CONFIG[section];
    const container = getContainer(section);
    if (!config || !container) return;

    if (!container.querySelector('.banner-item')) {
      container.innerHTML = `
        <div class="banner-empty-state" style="padding:1rem 1.25rem; border:1px dashed #d4d7dd; border-radius:14px; background:#fafbff; color:#6b7280; font-size:0.9rem; line-height:1.6;">
          ${escapeHtml(config.emptyText)}
        </div>
      `;
    }
  }

  async function applyBannerImage(item, section, file) {
    const config = BANNER_CONFIG[section];
    if (!config || !item || !file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드할 수 있습니다.');
      return;
    }

    const dataUrl = await readFileAsDataURL(file);
    const meta = await readImageMeta(dataUrl);
    const hiddenInput = item.querySelector('.banner-img-input');
    const preview = item.querySelector('.banner-preview-img');
    const placeholder = item.querySelector('.banner-preview-placeholder');
    const sizeHint = item.querySelector('.banner-size-hint');
    const metaLabel = item.querySelector('.banner-dimension-label');

    if (hiddenInput) hiddenInput.value = dataUrl;
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    if (sizeHint) {
      const dimensionText = meta ? `${meta.width} × ${meta.height}px` : '이미지 업로드됨';
      sizeHint.textContent = `${dimensionText} · ${formatBytes(file.size)} · ${config.recommended}`;
    }
    if (metaLabel) {
      metaLabel.textContent = meta ? `${meta.width} × ${meta.height}px` : '등록됨';
    }
  }

  function clearBannerImage(item, section) {
    const config = BANNER_CONFIG[section];
    if (!config || !item) return;

    const hiddenInput = item.querySelector('.banner-img-input');
    const fileInput = item.querySelector('.banner-file-input');
    const preview = item.querySelector('.banner-preview-img');
    const placeholder = item.querySelector('.banner-preview-placeholder');
    const sizeHint = item.querySelector('.banner-size-hint');
    const metaLabel = item.querySelector('.banner-dimension-label');

    if (hiddenInput) hiddenInput.value = '';
    if (fileInput) fileInput.value = '';
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    if (placeholder) placeholder.style.display = 'block';
    if (sizeHint) sizeHint.textContent = config.recommended;
    if (metaLabel) metaLabel.textContent = '미등록';
  }

  function createBannerItem(section, imgUrl = '', linkUrl = '') {
    const config = BANNER_CONFIG[section];
    const item = document.createElement('article');
    item.className = 'banner-item';
    item.dataset.section = section;
    item.style.cssText = [
      'display:grid',
      'grid-template-columns:minmax(180px, 260px) minmax(0, 1fr) auto',
      'gap:1rem',
      'align-items:stretch',
      'padding:1rem',
      'background:#fff',
      'border:1px solid var(--admin-border)',
      'border-radius:14px',
      'box-shadow:0 10px 28px rgba(15,23,42,0.05)',
    ].join(';');

    item.innerHTML = `
      <div class="banner-preview" style="position:relative; border-radius:14px; overflow:hidden; background:linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%); border:1px solid #e5e7eb; aspect-ratio:${config.previewRatio}; min-height:120px; display:flex; align-items:center; justify-content:center;">
        <img class="banner-preview-img" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(config.label)}" style="width:100%; height:100%; object-fit:contain; display:${imgUrl ? 'block' : 'none'}; background:#111;">
        <div class="banner-preview-placeholder" style="display:${imgUrl ? 'none' : 'block'}; color:#6b7280; text-align:center; padding:1rem; line-height:1.6;">
          <strong style="display:block; font-size:0.95rem; color:#111827; margin-bottom:0.35rem;">${escapeHtml(config.label)}</strong>
          <span style="font-size:0.82rem;">권장 ${escapeHtml(config.recommended)}</span>
        </div>
      </div>
      <div class="banner-editor" style="display:flex; flex-direction:column; gap:0.75rem;">
        <div style="display:flex; flex-wrap:wrap; gap:0.5rem; align-items:center;">
          <input type="file" class="banner-file-input" accept="image/*" hidden>
          <button type="button" class="btn-small outline banner-upload-btn" style="white-space:nowrap;">이미지 선택</button>
          <button type="button" class="btn-small outline banner-clear-btn" style="white-space:nowrap;">이미지 초기화</button>
        </div>
        <input type="hidden" class="banner-img-input" value="${escapeHtml(imgUrl)}">
        <input type="text" class="admin-form-input banner-link-input" value="${escapeHtml(linkUrl)}" placeholder="클릭 시 이동할 링크 URL (선택)" style="margin:0;">
        <p class="banner-size-hint" style="margin:0; color:var(--admin-text-muted); font-size:0.85rem;">${escapeHtml(config.recommended)}</p>
      </div>
      <div style="display:flex; flex-direction:column; justify-content:space-between; align-items:flex-end; gap:0.75rem;">
        <span class="banner-dimension-label" style="font-size:0.8rem; color:#64748b;">${imgUrl ? '등록됨' : '미등록'}</span>
        <button type="button" class="btn-remove-banner" style="border:none; background:#fee2e2; color:#ef4444; border-radius:10px; padding:0.6rem 0.9rem; font-weight:700; cursor:pointer;">삭제</button>
      </div>
    `;

    const fileInput = item.querySelector('.banner-file-input');
    const uploadBtn = item.querySelector('.banner-upload-btn');
    const clearBtn = item.querySelector('.banner-clear-btn');
    const removeBtn = item.querySelector('.btn-remove-banner');

    uploadBtn?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await applyBannerImage(item, section, file);
      } catch (error) {
        console.error('[admin_homepage_settings] banner upload failed', error);
        alert(error?.message || '배너 업로드에 실패했습니다.');
      }
    });

    clearBtn?.addEventListener('click', () => clearBannerImage(item, section));
    removeBtn?.addEventListener('click', () => {
      item.remove();
      setBannerEmptyState(section);
    });

    return item;
  }

  function renderBannerSection(section, banners) {
    const container = getContainer(section);
    if (!container) return;

    container.innerHTML = '';
    const items = Array.isArray(banners) ? banners : [];
    if (!items.length) {
      setBannerEmptyState(section);
      return;
    }

    items.forEach((banner) => {
      container.appendChild(createBannerItem(section, banner?.imgUrl || '', banner?.linkUrl || ''));
    });
  }

  function serializeBannerSection(section) {
    const container = getContainer(section);
    if (!container) return [];

    return Array.from(container.querySelectorAll('.banner-item'))
      .map((item) => ({
        imgUrl: item.querySelector('.banner-img-input')?.value.trim() || '',
        linkUrl: item.querySelector('.banner-link-input')?.value.trim() || '',
      }))
      .filter((item) => item.imgUrl);
  }

  function fillFooterFields(settings) {
    setValue('setFooterCompany', settings.company_name || '');
    setValue('setFooterCEO', settings.ceo_name || '');
    setValue('setFooterAddress', settings.address || '');
    setValue('setFooterBizNum', settings.biz_num || '');
    setValue('setFooterMailNum', settings.mail_order_num || '');
    setValue('setFooterCS', settings.cs_phone || '');
    setValue('setFooterEmail', settings.cs_email || '');
    setValue('setFooterHours', settings.footer_hours || '');
    setValue('setFooterTermsUrl', settings.footer_terms_url || '');
    setValue('setFooterPrivacyUrl', settings.footer_privacy_url || '');
    setValue('setFooterInstagramUrl', settings.footer_instagram_url || '');
    setValue('setFooterYoutubeUrl', settings.footer_youtube_url || '');
  }

  function fillSeoFields(settings) {
    const seo = settings.seo || {};
    setValue('seoTitle', seo.title || '');
    setValue('seoDescription', seo.description || '');
    setValue('seoKeywords', seo.keywords || '');
    setValue('seoImage', seo.image || '');
  }

  function fillHomepageFields(settings) {
    const logoURL = settings.logo_url || '';
    const faviconURL = settings.favicon_url || '';

    if (logoURL) {
      setValue('settingLogoURL', logoURL);
      const preview = $('previewLogo');
      if (preview) {
        preview.src = logoURL;
        preview.style.display = 'block';
      }
      const placeholder = $('logoPlaceholderTxt');
      if (placeholder) placeholder.style.display = 'none';
      const sizeHint = $('logoSizeHint');
      if (sizeHint) sizeHint.textContent = `업로드됨 · ${MEDIA_CONFIG.logo.recommended}`;
    } else {
      resetMediaFile('logo');
    }

    if (faviconURL) {
      setValue('settingFaviconURL', faviconURL);
      const preview = $('previewFavicon');
      if (preview) {
        preview.src = faviconURL;
        preview.style.display = 'block';
      }
      const placeholder = $('faviconPlaceholderTxt');
      if (placeholder) placeholder.style.display = 'none';
      const sizeHint = $('faviconSizeHint');
      if (sizeHint) sizeHint.textContent = `업로드됨 · ${MEDIA_CONFIG.favicon.recommended}`;
    } else {
      resetMediaFile('favicon');
    }

    renderBannerSection('main', settings.banners || []);
    renderBannerSection('bottom', settings.bottom_banners || []);
  }

  async function loadSiteSettings(type) {
    try {
      if (window.BSQ?.ready) await window.BSQ.ready;
      const res = await window.BSQ.api('/api/site-settings');
      if (!res?.success) throw new Error(res?.error || '설정을 불러오지 못했습니다.');

      const settings = res.data || {};
      window.__BSQ_SITE_SETTINGS__ = settings;

      if (type === 'homepage') {
        fillHomepageFields(settings);
      } else if (type === 'footer') {
        fillFooterFields(settings);
      } else if (type === 'seo') {
        fillSeoFields(settings);
      }
    } catch (error) {
      console.error('[admin_homepage_settings] load failed', error);
      alert(`설정을 불러오지 못했습니다: ${error.message}`);
    }
  }

  async function saveSiteSettings(type) {
    const buttonMap = {
      homepage: $('btnSaveHomepage'),
      footer: $('btnSaveFooter'),
      seo: $('btnSaveSEO'),
    };
    const btn = buttonMap[type];
    const originalText = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '저장 중...';
    }

    try {
      if (window.BSQ?.ready) await window.BSQ.ready;
      const currentRes = await window.BSQ.api('/api/site-settings');
      const currentData = currentRes?.success ? (currentRes.data || {}) : {};
      const payload = { ...currentData };

      if (type === 'homepage') {
        payload.logo_url = $('settingLogoURL')?.value.trim() || '';
        payload.favicon_url = $('settingFaviconURL')?.value.trim() || '';
        payload.banners = serializeBannerSection('main');
        payload.bottom_banners = serializeBannerSection('bottom');
      } else if (type === 'footer') {
        payload.company_name = $('setFooterCompany')?.value.trim() || '';
        payload.ceo_name = $('setFooterCEO')?.value.trim() || '';
        payload.address = $('setFooterAddress')?.value.trim() || '';
        payload.biz_num = $('setFooterBizNum')?.value.trim() || '';
        payload.mail_order_num = $('setFooterMailNum')?.value.trim() || '';
        payload.cs_phone = $('setFooterCS')?.value.trim() || '';
        payload.cs_email = $('setFooterEmail')?.value.trim() || '';
        payload.footer_hours = $('setFooterHours')?.value.trim() || '';
        payload.footer_terms_url = $('setFooterTermsUrl')?.value.trim() || '';
        payload.footer_privacy_url = $('setFooterPrivacyUrl')?.value.trim() || '';
        payload.footer_instagram_url = $('setFooterInstagramUrl')?.value.trim() || '';
        payload.footer_youtube_url = $('setFooterYoutubeUrl')?.value.trim() || '';
      } else if (type === 'seo') {
        payload.seo = {
          title: $('seoTitle')?.value.trim() || '',
          description: $('seoDescription')?.value.trim() || '',
          keywords: $('seoKeywords')?.value.trim() || '',
          image: $('seoImage')?.value.trim() || '',
        };
      }

      const res = await window.BSQ.api('/api/site-settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (!res?.success) throw new Error(res?.error || '저장에 실패했습니다.');

      alert('설정이 저장되었습니다.');
      await loadSiteSettings(type);
    } catch (error) {
      console.error('[admin_homepage_settings] save failed', error);
      alert(`설정 저장에 실패했습니다: ${error.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    }
  }

  function bindMediaUpload(section) {
    const cfg = MEDIA_CONFIG[section];
    const fileInput = $(cfg.fileId);
    const removeBtn = section === 'logo' ? $('btnRemoveLogo') : $('btnRemoveFavicon');

    fileInput?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await applyMediaFile(section, file);
      } catch (error) {
        console.error('[admin_homepage_settings] media upload failed', error);
        alert(error?.message || '이미지 업로드에 실패했습니다.');
      }
    });

    removeBtn?.addEventListener('click', () => resetMediaFile(section));
  }

  function bindBannerButton(section, buttonId) {
    $(buttonId)?.addEventListener('click', (event) => {
      event.preventDefault();
      const container = getContainer(section);
      if (!container) return;
      const placeholder = container.querySelector('.banner-empty-state');
      if (placeholder) placeholder.remove();
      container.appendChild(createBannerItem(section));
    });
  }

  function init() {
    const tabHomepage = $('tabHomepage');
    const tabFooter = $('tabFooter');
    const tabSEO = $('tabSEO');

    if (tabHomepage?.classList.contains('active')) {
      loadSiteSettings('homepage');
    } else if (tabFooter?.classList.contains('active')) {
      loadSiteSettings('footer');
    } else if (tabSEO?.classList.contains('active')) {
      loadSiteSettings('seo');
    }

    bindMediaUpload('logo');
    bindMediaUpload('favicon');
    bindBannerButton('main', 'btnAddBanner');
    bindBannerButton('bottom', 'btnAddBottomBanner');

    $('btnSaveHomepage')?.addEventListener('click', () => saveSiteSettings('homepage'));
    $('btnSaveFooter')?.addEventListener('click', () => saveSiteSettings('footer'));
    $('btnSaveSEO')?.addEventListener('click', () => saveSiteSettings('seo'));

    window.addEventListener('adminTabChanged', (event) => {
      const tabId = event?.detail?.tabId;
      if (tabId === 'tabHomepage') {
        loadSiteSettings('homepage');
      } else if (tabId === 'tabFooter') {
        loadSiteSettings('footer');
      } else if (tabId === 'tabSEO') {
        loadSiteSettings('seo');
      }
    });
  }

  window.addMainBannerItem = (imgUrl = '', linkUrl = '') => {
    const container = getContainer('main');
    if (!container) return;
    const placeholder = container.querySelector('.banner-empty-state');
    if (placeholder) placeholder.remove();
    container.appendChild(createBannerItem('main', imgUrl, linkUrl));
  };

  window.addBottomBannerItem = (imgUrl = '', linkUrl = '') => {
    const container = getContainer('bottom');
    if (!container) return;
    const placeholder = container.querySelector('.banner-empty-state');
    if (placeholder) placeholder.remove();
    container.appendChild(createBannerItem('bottom', imgUrl, linkUrl));
  };

  window.addBannerItem = window.addMainBannerItem;

  MEDIA_CONFIG.logo.recommended = '권장 480 × 120px · PNG/WebP · 원본 유지';
  MEDIA_CONFIG.favicon.recommended = '권장 512 × 512px · PNG/ICO/WebP · 정사각형';
  BANNER_CONFIG.main.recommended = '권장 1600 × 500px · 16:5 비율 · 중앙 안전영역 확보';
  BANNER_CONFIG.bottom.recommended = '권장 3200 × 600px · 16:3 비율 · 가로형 슬라이드';

  window.getHomepageBannerState = function () {
    return {
      main: serializeBannerSection('main'),
      bottom: serializeBannerSection('bottom'),
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
