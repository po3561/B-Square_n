;(function () {
  'use strict';

  const DEFAULT_GROUP = 'general';
  const DEFAULT_TYPE = 'image';
  const MAX_RAW_FILE_BYTES = 5 * 1024 * 1024;

  const GROUP_LABELS = {
    brand: '브랜드',
    theme: '테마',
    profile: '프로필',
    sns: 'SNS',
    class: '클래스',
    footer: '푸터',
    business: '사업 자료',
    document: '문서',
    general: '일반',
  };

  const TYPE_LABELS = {
    image: '이미지',
    document: '문서',
    icon: '아이콘',
  };

  const GROUP_OPTIONS = Object.keys(GROUP_LABELS);
  const TYPE_OPTIONS = Object.keys(TYPE_LABELS);

  const $ = (id) => document.getElementById(id);

  const state = {
    assets: [],
    filteredAssets: [],
    loading: false,
    editingId: '',
    filters: {
      q: '',
      group: 'all',
      type: 'all',
    },
  };

  function escapeHtml(value = '') {
    return String(value)
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

  function normalizeText(value = '') {
    return String(value).trim();
  }

  function normalizeMimeType(value = '') {
    return normalizeText(value).toLowerCase();
  }

  function isImageMime(mimeType = '', dataUrl = '') {
    return normalizeMimeType(mimeType).startsWith('image/') || String(dataUrl || '').startsWith('data:image/');
  }

  function normalizeGroup(value) {
    const next = normalizeText(value || DEFAULT_GROUP).toLowerCase();
    return GROUP_LABELS[next] ? next : DEFAULT_GROUP;
  }

  function normalizeType(value) {
    const next = normalizeText(value || DEFAULT_TYPE).toLowerCase();
    return TYPE_LABELS[next] ? next : DEFAULT_TYPE;
  }

  function normalizeTags(value) {
    return normalizeText(value)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .join(', ');
  }

  function estimateDataUrlBytes(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return 0;
    const commaIndex = dataUrl.indexOf(',');
    if (commaIndex < 0) return 0;
    const base64 = dataUrl.slice(commaIndex + 1);
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
  }

  function readImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
      image.src = dataUrl;
    });
  }

  async function compressImageDataUrl(dataUrl, fileType) {
    if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return dataUrl || '';
    }

    const originalBytes = estimateDataUrlBytes(dataUrl);
    if (originalBytes && originalBytes < 220 * 1024) {
      return dataUrl;
    }

    const image = await readImage(dataUrl);
    const width = image.naturalWidth || image.width || 0;
    const height = image.naturalHeight || image.height || 0;
    if (!width || !height) return dataUrl;

    const scale = Math.min(1600 / width, 1600 / height, 1);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

    const mime = String(fileType || '').toLowerCase() === 'image/png' ? 'image/webp' : 'image/webp';
    const blob = await new Promise((resolve) => {
      canvas.toBlob((result) => resolve(result), mime, 0.84);
    });

    if (!blob) return dataUrl;
    if (originalBytes && blob.size >= originalBytes) return dataUrl;

    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || dataUrl));
      reader.onerror = () => reject(new Error('이미지 압축에 실패했습니다.'));
      reader.readAsDataURL(blob);
    });
  }

  function getGroupLabel(group) {
    return GROUP_LABELS[normalizeGroup(group)] || GROUP_LABELS[DEFAULT_GROUP];
  }

  function getTypeLabel(type) {
    return TYPE_LABELS[normalizeType(type)] || TYPE_LABELS[DEFAULT_TYPE];
  }

  function getFileBadge(asset) {
    if (isImageMime(asset.mime_type, asset.data_url)) return 'IMG';
    const ext = String(asset.file_name || '').split('.').pop().toUpperCase();
    if (ext && ext.length <= 4) return ext;
    return 'FILE';
  }

  function getPreviewMarkup(asset) {
    if (isImageMime(asset.mime_type, asset.data_url)) {
      return `<img src="${escapeHtml(asset.data_url)}" alt="${escapeHtml(asset.alt_text || asset.name || '')}">`;
    }

    return `
      <div class="media-assets-file-preview">
        <strong>${escapeHtml(getFileBadge(asset))}</strong>
        <span>${escapeHtml(asset.file_name || asset.name || 'FILE')}</span>
      </div>
    `;
  }

  function updateMetrics() {
    const total = state.assets.length;
    const active = state.assets.filter((item) => item.is_active).length;
    const images = state.assets.filter((item) => isImageMime(item.mime_type, item.data_url)).length;
    const files = Math.max(0, total - images);

    const totalEl = $('mediaAssetMetricTotal');
    const activeEl = $('mediaAssetMetricActive');
    const imageEl = $('mediaAssetMetricImage');
    const fileEl = $('mediaAssetMetricFile');
    const countEl = $('mediaAssetListCount');

    if (totalEl) totalEl.textContent = `${total}개`;
    if (activeEl) activeEl.textContent = `${active}개`;
    if (imageEl) imageEl.textContent = `${images}개`;
    if (fileEl) fileEl.textContent = `${files}개`;
    if (countEl) countEl.textContent = `${state.filteredAssets.length}개`;
  }

  function resetForm() {
    state.editingId = '';
    $('mediaAssetId').value = '';
    $('mediaAssetName').value = '';
    $('mediaAssetDescription').value = '';
    $('mediaAssetAltText').value = '';
    $('mediaAssetTags').value = '';
    $('mediaAssetSortOrder').value = '0';
    $('mediaAssetGroup').value = DEFAULT_GROUP;
    $('mediaAssetType').value = DEFAULT_TYPE;
    $('mediaAssetDataUrl').value = '';
    $('mediaAssetFileName').value = '';
    $('mediaAssetMimeType').value = '';
    $('mediaAssetFileSize').value = '';
    $('mediaAssetFile').value = '';
    $('mediaAssetFileHint').textContent = '파일을 선택하면 D1에 데이터 URL로 저장됩니다.';
    $('btnDeleteMediaAsset').style.display = 'none';
    $('btnUseMediaAsset').style.display = 'none';
    $('mediaAssetFormTitle').textContent = '새 보관 항목';
    $('mediaAssetFormSubtitle').textContent = '이미지나 문서를 저장하고, 필요한 곳에 복사해서 사용할 수 있습니다.';
    updatePreview(null);
  }

  function updatePreview(asset) {
    const img = $('mediaAssetPreviewImage');
    const placeholder = $('mediaAssetPreviewPlaceholder');
    const meta = $('mediaAssetPreviewMeta');

    if (!asset) {
      if (img) {
        img.removeAttribute('src');
        img.style.display = 'none';
      }
      if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.textContent = '파일을 선택하면 미리보기가 표시됩니다.';
      }
      if (meta) meta.textContent = '';
      return;
    }

    if (isImageMime(asset.mime_type, asset.data_url)) {
      if (img) {
        img.src = asset.data_url;
        img.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
    } else {
      if (img) {
        img.removeAttribute('src');
        img.style.display = 'none';
      }
      if (placeholder) {
        placeholder.style.display = 'flex';
        placeholder.textContent = '문서 보관 항목은 파일 정보 위주로 표시됩니다.';
      }
    }

    if (meta) {
      const lines = [
        `${getGroupLabel(asset.asset_group)} · ${getTypeLabel(asset.asset_type)}`,
        asset.file_name ? asset.file_name : '',
        `${formatBytes(asset.file_size || estimateDataUrlBytes(asset.data_url))} · ${asset.is_active ? '활성' : '비활성'}`,
      ].filter(Boolean);
      meta.innerHTML = lines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');
    }
  }

  function fillForm(asset) {
    if (!asset) {
      resetForm();
      return;
    }

    state.editingId = asset.id;
    $('mediaAssetId').value = asset.id || '';
    $('mediaAssetName').value = asset.name || '';
    $('mediaAssetDescription').value = asset.description || '';
    $('mediaAssetAltText').value = asset.alt_text || '';
    $('mediaAssetTags').value = asset.tags || '';
    $('mediaAssetSortOrder').value = String(asset.sort_order || 0);
    $('mediaAssetGroup').value = normalizeGroup(asset.asset_group);
    $('mediaAssetType').value = normalizeType(asset.asset_type);
    $('mediaAssetDataUrl').value = asset.data_url || '';
    $('mediaAssetFileName').value = asset.file_name || '';
    $('mediaAssetMimeType').value = asset.mime_type || '';
    $('mediaAssetFileSize').value = String(asset.file_size || 0);
    $('mediaAssetFile').value = '';
    $('mediaAssetFileHint').textContent = asset.file_name
      ? `${asset.file_name} · ${formatBytes(asset.file_size || estimateDataUrlBytes(asset.data_url))}`
      : '파일을 선택하면 D1에 데이터 URL로 저장됩니다.';
    $('btnDeleteMediaAsset').style.display = 'inline-flex';
    $('btnUseMediaAsset').style.display = 'inline-flex';
    $('mediaAssetFormTitle').textContent = '보관 항목 수정';
    $('mediaAssetFormSubtitle').textContent = '선택한 항목을 수정하거나 다른 화면에서 다시 사용할 수 있습니다.';
    updatePreview(asset);
  }

  function getFilteredAssets() {
    const q = normalizeText(state.filters.q).toLowerCase();
    const group = normalizeText(state.filters.group);
    const type = normalizeText(state.filters.type);

    return state.assets.filter((asset) => {
      if (group !== 'all' && normalizeGroup(asset.asset_group) !== group) return false;
      if (type !== 'all' && normalizeType(asset.asset_type) !== type) return false;

      if (!q) return true;

      const haystack = [
        asset.name,
        asset.description,
        asset.alt_text,
        asset.tags,
        asset.file_name,
        asset.asset_group,
        asset.asset_type,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }

  function renderList() {
    state.filteredAssets = getFilteredAssets();
    updateMetrics();

    const host = $('mediaAssetsList');
    if (!host) return;

    if (!state.filteredAssets.length) {
      host.innerHTML = `
        <div class="media-assets-empty-state">
          <strong>보관된 항목이 없습니다.</strong>
          <p>새 이미지를 추가하거나 필터를 초기화해 보세요.</p>
        </div>
      `;
      return;
    }

    host.innerHTML = state.filteredAssets.map((asset) => {
      const activeClass = asset.is_active ? '' : ' is-inactive';
      const preview = getPreviewMarkup(asset);
      const tags = (asset.tags || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4);

      return `
        <article class="media-asset-card${activeClass}" data-id="${escapeHtml(asset.id)}">
          <button type="button" class="media-asset-card-media" data-action="edit-asset" data-id="${escapeHtml(asset.id)}">
            ${preview}
          </button>
          <div class="media-asset-card-body">
            <div class="media-asset-card-head">
              <strong>${escapeHtml(asset.name || '이름 없음')}</strong>
              <span>${escapeHtml(getGroupLabel(asset.asset_group))}</span>
            </div>
            <p>${escapeHtml(asset.description || '설명 없음')}</p>
            <div class="media-asset-meta-row">
              <span>${escapeHtml(getTypeLabel(asset.asset_type))}</span>
              <span>${escapeHtml(asset.file_name || asset.mime_type || '파일 정보 없음')}</span>
            </div>
            <div class="media-asset-tags">
              ${tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join('')}
            </div>
            <div class="media-asset-card-actions">
              <button type="button" class="btn-small outline" data-action="use-asset" data-id="${escapeHtml(asset.id)}">사용</button>
              <button type="button" class="btn-small outline" data-action="copy-asset" data-id="${escapeHtml(asset.id)}">복사</button>
              <button type="button" class="btn-small outline" data-action="edit-asset" data-id="${escapeHtml(asset.id)}">수정</button>
              <button type="button" class="btn-small outline" data-action="delete-asset" data-id="${escapeHtml(asset.id)}" style="color:var(--mac-danger); border-color:rgba(255,59,48,0.25);">삭제</button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  async function loadAssets() {
    if (!window.BSQ?.api) return;
    state.loading = true;

    try {
      const params = new URLSearchParams();
      if (state.filters.group && state.filters.group !== 'all') params.set('group', state.filters.group);
      if (state.filters.type && state.filters.type !== 'all') params.set('type', state.filters.type);
      if (state.filters.q) params.set('q', state.filters.q);

      const query = params.toString();
      const res = await window.BSQ.api(`/api/admin/media-assets${query ? `?${query}` : ''}`);
      if (!res?.success) throw new Error(res?.error || '보관 목록을 불러오지 못했습니다.');

      state.assets = Array.isArray(res.data) ? res.data : [];
      renderList();
    } catch (error) {
      console.error('[admin_media_assets] load failed:', error);
      state.assets = [];
      state.filteredAssets = [];
      renderList();
      alert(error.message || '보관 목록을 불러오지 못했습니다.');
    } finally {
      state.loading = false;
    }
  }

  async function saveAsset() {
    const id = normalizeText($('mediaAssetId').value);
    const name = normalizeText($('mediaAssetName').value);
    let dataUrl = normalizeText($('mediaAssetDataUrl').value);
    const fileInput = $('mediaAssetFile');
    const file = fileInput?.files?.[0] || null;

    if (!name) {
      alert('이름을 입력해 주세요.');
      return;
    }

    if (file) {
      if (file.size > MAX_RAW_FILE_BYTES) {
        alert('파일이 너무 큽니다. 5MB 이하의 파일을 사용해 주세요.');
        return;
      }

      const rawDataUrl = await readFileAsDataURL(file);
      dataUrl = file.type.startsWith('image/')
        ? await compressImageDataUrl(rawDataUrl, file.type)
        : rawDataUrl;
      $('mediaAssetDataUrl').value = dataUrl;
      $('mediaAssetFileName').value = file.name || '';
      $('mediaAssetMimeType').value = file.type || '';
      $('mediaAssetFileSize').value = String(file.size || estimateDataUrlBytes(dataUrl));
    }

    if (!dataUrl) {
      alert('파일을 선택해 주세요.');
      return;
    }

    const payload = {
      id: id || undefined,
      asset_group: $('mediaAssetGroup').value,
      asset_type: $('mediaAssetType').value,
      name,
      description: $('mediaAssetDescription').value.trim(),
      file_name: $('mediaAssetFileName').value.trim(),
      mime_type: $('mediaAssetMimeType').value.trim(),
      file_size: Number($('mediaAssetFileSize').value || 0),
      data_url: dataUrl,
      alt_text: $('mediaAssetAltText').value.trim(),
      tags: normalizeTags($('mediaAssetTags').value),
      sort_order: Number($('mediaAssetSortOrder').value || 0),
      is_active: true,
    };

    const btn = $('btnSaveMediaAsset');
    const original = btn?.textContent || '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '저장 중...';
    }

    try {
      const res = await window.BSQ.api(
        '/api/admin/media-assets',
        id ? 'PUT' : 'POST',
        payload,
      );

      if (!res?.success) throw new Error(res?.error || '저장에 실패했습니다.');

      if (window.BSQ?.triggerSync) window.BSQ.triggerSync('media-assets');
      if (res.data) fillForm(res.data);
      await loadAssets();
      alert(res.message || '보관 항목이 저장되었습니다.');
    } catch (error) {
      console.error('[admin_media_assets] save failed:', error);
      alert(error.message || '보관 항목 저장에 실패했습니다.');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = original;
      }
    }
  }

  async function deleteAsset(id) {
    const asset = state.assets.find((item) => item.id === id);
    if (!asset) return;
    if (!confirm(`"${asset.name}" 항목을 삭제할까요?`)) return;

    try {
      const res = await window.BSQ.api('/api/admin/media-assets', 'DELETE', { id });
      if (!res?.success) throw new Error(res?.error || '삭제에 실패했습니다.');
      if (window.BSQ?.triggerSync) window.BSQ.triggerSync('media-assets');
      if (state.editingId === id) resetForm();
      await loadAssets();
      alert(res.message || '보관 항목이 삭제되었습니다.');
    } catch (error) {
      console.error('[admin_media_assets] delete failed:', error);
      alert(error.message || '보관 항목 삭제에 실패했습니다.');
    }
  }

  async function copyAsset(asset) {
    if (!asset?.data_url) return;

    try {
      await navigator.clipboard.writeText(asset.data_url);
      alert('데이터 URL을 복사했습니다.');
    } catch {
      window.prompt('데이터 URL을 복사해 사용하세요.', asset.data_url);
    }
  }

  function emitAssetSelection(asset) {
    if (!asset) return;
    window.dispatchEvent(new CustomEvent('adminMediaAssetSelected', {
      detail: {
        asset: {
          ...asset,
          data_url: asset.data_url || '',
          file_name: asset.file_name || '',
          mime_type: asset.mime_type || '',
        },
      },
    }));
    copyAsset(asset);
  }

  function bindEvents() {
    $('btnReloadMediaAssets')?.addEventListener('click', () => loadAssets());
    $('btnOpenMediaAssetForm')?.addEventListener('click', () => {
      resetForm();
      $('mediaAssetName')?.focus();
    });
    $('btnResetMediaAssetForm')?.addEventListener('click', () => resetForm());
    $('btnSaveMediaAsset')?.addEventListener('click', () => saveAsset());
    $('btnDeleteMediaAsset')?.addEventListener('click', async () => {
      const id = normalizeText($('mediaAssetId').value);
      if (id) await deleteAsset(id);
    });
    $('btnPickMediaAssetFile')?.addEventListener('click', () => $('mediaAssetFile')?.click());
    $('btnClearMediaAssetFile')?.addEventListener('click', () => {
      $('mediaAssetFile').value = '';
      $('mediaAssetDataUrl').value = state.editingId ? ($('mediaAssetDataUrl').value || '') : '';
      $('mediaAssetFileName').value = '';
      $('mediaAssetMimeType').value = '';
      $('mediaAssetFileSize').value = '';
      $('mediaAssetFileHint').textContent = '파일을 선택하면 D1에 데이터 URL로 저장됩니다.';
      updatePreview(state.assets.find((item) => item.id === state.editingId) || null);
    });
    $('mediaAssetFile')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        if (file.size > MAX_RAW_FILE_BYTES) {
          alert('파일이 너무 큽니다. 5MB 이하의 파일을 사용해 주세요.');
          event.target.value = '';
          return;
        }
        const raw = await readFileAsDataURL(file);
        const dataUrl = file.type.startsWith('image/')
          ? await compressImageDataUrl(raw, file.type)
          : raw;

        $('mediaAssetDataUrl').value = dataUrl;
        $('mediaAssetFileName').value = file.name || '';
        $('mediaAssetMimeType').value = file.type || '';
        $('mediaAssetFileSize').value = String(file.size || estimateDataUrlBytes(dataUrl));
        $('mediaAssetFileHint').textContent = `${file.name || '선택된 파일'} · ${formatBytes(file.size || estimateDataUrlBytes(dataUrl))}`;

        const asset = {
          asset_group: $('mediaAssetGroup').value,
          asset_type: $('mediaAssetType').value,
          name: $('mediaAssetName').value,
          description: $('mediaAssetDescription').value,
          file_name: file.name,
          mime_type: file.type || '',
          file_size: file.size || estimateDataUrlBytes(dataUrl),
          data_url: dataUrl,
          alt_text: $('mediaAssetAltText').value,
          tags: $('mediaAssetTags').value,
          sort_order: Number($('mediaAssetSortOrder').value || 0),
          is_active: true,
        };
        updatePreview(asset);
      } catch (error) {
        console.error('[admin_media_assets] file load failed:', error);
        alert(error.message || '파일을 읽지 못했습니다.');
      }
    });

    ['mediaAssetSearchInput', 'mediaAssetGroupFilter', 'mediaAssetTypeFilter'].forEach((id) => {
      $(id)?.addEventListener(id === 'mediaAssetSearchInput' ? 'input' : 'change', () => {
        state.filters.q = $('mediaAssetSearchInput')?.value.trim() || '';
        state.filters.group = $('mediaAssetGroupFilter')?.value || 'all';
        state.filters.type = $('mediaAssetTypeFilter')?.value || 'all';
        renderList();
      });
    });

    $('btnMediaAssetReset')?.addEventListener('click', () => {
      state.filters.q = '';
      state.filters.group = 'all';
      state.filters.type = 'all';
      $('mediaAssetSearchInput').value = '';
      $('mediaAssetGroupFilter').value = 'all';
      $('mediaAssetTypeFilter').value = 'all';
      renderList();
    });

    document.getElementById('mediaAssetsList')?.addEventListener('click', (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;
      const id = normalizeText(target.dataset.id || '');
      const asset = state.assets.find((item) => item.id === id);
      if (!asset) return;

      switch (target.dataset.action) {
        case 'edit-asset':
          fillForm(asset);
          break;
        case 'delete-asset':
          void deleteAsset(id);
          break;
        case 'copy-asset':
          void copyAsset(asset);
          break;
        case 'use-asset':
          emitAssetSelection(asset);
          break;
        default:
          break;
      }
    });

    window.addEventListener('adminTabChanged', (event) => {
      if (String(event.detail?.tabId || '') === 'tabMediaAssets' && !state.loading) {
        void loadAssets();
      }
    });

    window.addEventListener('bsq_sync', (event) => {
      if (String(event.detail?.type || '') === 'media-assets') {
        void loadAssets();
      }
    });

    window.addEventListener('adminMediaAssetSelected', (event) => {
      const asset = event.detail?.asset;
      if (!asset) return;
      // Keep the form open and usable even when another editor dispatched the selection.
      if (state.editingId && state.editingId !== asset.id) {
        return;
      }
    });
  }

  function applyAssetToFocusedField(asset) {
    if (!asset) return;
    const active = document.activeElement;
    const dataUrl = asset.data_url || '';
    const fileName = asset.file_name || '';
    const fileSize = asset.file_size || estimateDataUrlBytes(dataUrl);
    const mimeType = asset.mime_type || '';

    const fields = [
      'settingLogoURL',
      'settingLogoLightURL',
      'settingLogoDarkURL',
      'settingFaviconURL',
      'settingFaviconLightURL',
      'settingFaviconDarkURL',
      'seoImage',
      'classCategoryImageUrl',
    ];

    const targetId = String(window.__BSQ_MEDIA_ASSET_TARGET__ || '').trim();
    const targetField = targetId ? document.getElementById(targetId) : null;
    const target = (targetField && fields.includes(targetField.id) && targetField.tagName === 'INPUT')
      ? targetField
      : (active && fields.includes(active.id) && active.tagName === 'INPUT' ? active : null);

    if (!target) return;

    target.value = dataUrl;
    const event = new Event('input', { bubbles: true });
    target.dispatchEvent(event);

    void fileName;
    void fileSize;
    void mimeType;
  }

  function init() {
    if (!document.getElementById('tabMediaAssets')) return;

    bindEvents();
    resetForm();
    void loadAssets();

    window.addEventListener('adminMediaAssetSelected', (event) => {
      applyAssetToFocusedField(event.detail?.asset);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
