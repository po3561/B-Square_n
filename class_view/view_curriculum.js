window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initCurriculum = function (data) {
    renderCurriculum(data);
    initToggleAll();
};

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatLessonDuration(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') return '';
    if (typeof rawValue === 'number' && Number.isFinite(rawValue) && rawValue > 0) {
        const totalSeconds = Math.round(rawValue);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    }
    return String(rawValue).trim();
}

function normalizeLessons(chapter) {
    const lessons = Array.isArray(chapter?.lessons) ? chapter.lessons : [];
    return lessons
        .map((lesson) => ({
            title: String(lesson?.title || lesson?.name || '').trim(),
            duration: formatLessonDuration(lesson?.duration || lesson?.play_time || lesson?.runtime || ''),
            isFree: Boolean(lesson?.isFree || lesson?.is_free || lesson?.preview || lesson?.is_preview),
        }))
        .filter((lesson) => lesson.title || lesson.duration);
}

function getChapterDetail(chapter) {
    return String(
        chapter?.detail
        || chapter?.summary
        || chapter?.description
        || chapter?.note
        || ''
    ).trim();
}

function getChapterMaterials(chapter) {
    return String(
        chapter?.materials
        || chapter?.material
        || chapter?.prep
        || chapter?.preparation
        || ''
    ).trim();
}

function renderLessonRows(lessons, chapter) {
    const detail = getChapterDetail(chapter);
    const materials = getChapterMaterials(chapter);

    if (!lessons.length) {
        return `
            <div class="lesson-empty-state">
                <strong>강의 상세 준비 중</strong>
                ${detail ? `<p class="lesson-empty-detail">${escapeHtml(detail)}</p>` : '<p>이 챕터는 강의 순서와 시간이 정리되는 대로 공개됩니다.</p>'}
                ${materials ? `<p class="lesson-empty-materials">준비물: ${escapeHtml(materials)}</p>` : ''}
            </div>
        `;
    }

    return lessons.map((lesson, index) => `
        <div class="lesson-item">
            <div class="lesson-info">
                <span class="lesson-index">${index + 1}.</span>
                <span class="lesson-name">${escapeHtml(lesson.title || '강의 제목')}</span>
            </div>
            <div class="lesson-actions">
                ${lesson.isFree ? '<span class="badge-preview">미리보기</span>' : ''}
                ${lesson.duration ? `<span class="lesson-duration">${escapeHtml(lesson.duration)}</span>` : '<span class="lesson-duration lesson-duration-empty">시간 미정</span>'}
                <span class="lesson-status-icon">${lesson.isFree ? '▶' : '●'}</span>
            </div>
        </div>
    `).join('');
}

function renderCurriculum(data) {
    const currList = document.getElementById('viewCurriculum');
    const chapCount = document.getElementById('chapCount');
    const toggleAllButton = document.getElementById('btnToggleAll');
    if (!currList) return;

    const curriculums = Array.isArray(data?.curriculum) ? data.curriculum : [];
    if (chapCount) chapCount.textContent = `챕터 ${curriculums.length}개`;
    if (toggleAllButton) {
        toggleAllButton.textContent = '전체 펼치기';
        toggleAllButton.disabled = curriculums.length === 0;
    }

    if (curriculums.length === 0) {
        currList.innerHTML = '<div class="lesson-empty-state curriculum-empty-state"><strong>준비 중인 커리큘럼입니다.</strong><p>수업 설계가 정리되는 대로 챕터와 강의 목록이 표시됩니다.</p></div>';
        return;
    }

    currList.innerHTML = curriculums.map((chapter, index) => {
        const chapterNum = String(index + 1).padStart(2, '0');
        const lessons = normalizeLessons(chapter);
        const chapterTitle = String(chapter?.title || chapter?.name || '').trim() || '챕터 제목';
        const chapterSummary = getChapterDetail(chapter);
        const chapterMaterials = getChapterMaterials(chapter);

        return `
            <article class="curriculum-chapter" data-index="${index}">
                <button class="chapter-header" type="button" aria-expanded="false" aria-controls="chapter-${index}">
                    <div class="chapter-title-group">
                        <span class="chapter-num">CHAPTER ${chapterNum}</span>
                        <span class="chapter-title-text">${escapeHtml(chapterTitle)}</span>
                        ${chapterSummary ? `<p class="chapter-summary">${escapeHtml(chapterSummary)}</p>` : ''}
                        ${chapterMaterials ? `<p class="chapter-materials">${escapeHtml(chapterMaterials)}</p>` : ''}
                    </div>
                    <div class="chapter-meta">
                        <span class="lesson-count">강의 ${lessons.length}개</span>
                        <span class="toggle-icon" aria-hidden="true">⌄</span>
                    </div>
                </button>
                <div class="lesson-list-container" id="chapter-${index}">
                    ${renderLessonRows(lessons, chapter)}
                </div>
            </article>
        `;
    }).join('');

    document.querySelectorAll('.chapter-header').forEach((header, idx) => {
        header.addEventListener('click', () => toggleChapter(idx));
    });
}

function toggleChapter(idx, forceState) {
    const container = document.getElementById(`chapter-${idx}`);
    if (!container) return;

    const chapter = container.closest('.curriculum-chapter');
    const header = chapter?.querySelector('.chapter-header');
    const icon = chapter?.querySelector('.toggle-icon');
    const isOpening = forceState !== undefined ? forceState : !container.classList.contains('active');

    if (isOpening) {
        container.classList.add('active');
        header?.setAttribute('aria-expanded', 'true');
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        container.classList.remove('active');
        header?.setAttribute('aria-expanded', 'false');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

function initToggleAll() {
    const btn = document.getElementById('btnToggleAll');
    if (!btn) return;

    let allOpen = false;
    btn.onclick = () => {
        allOpen = !allOpen;
        document.querySelectorAll('.curriculum-chapter').forEach((_, idx) => toggleChapter(idx, allOpen));
        btn.textContent = allOpen ? '전체 닫기' : '전체 펼치기';
    };
}
