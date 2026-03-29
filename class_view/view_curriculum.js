window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initCurriculum = function (data) {
    renderCurriculum(data);
    initToggleAll();
};

function renderCurriculum(data) {
    const currList = document.getElementById('viewCurriculum');
    const chapCount = document.getElementById('chapCount');
    if (!currList) return;

    const curriculums = Array.isArray(data?.curriculum) ? data.curriculum : [];
    if (chapCount) chapCount.textContent = `챕터 ${curriculums.length}개`;

    if (curriculums.length === 0) {
        currList.innerHTML = '<p class="empty-state">준비 중인 커리큘럼입니다.</p>';
        return;
    }

    currList.innerHTML = curriculums.map((ch, i) => {
        const chapterNum = String(i + 1).padStart(2, '0');
        const lessons = Array.isArray(ch.lessons) && ch.lessons.length
            ? ch.lessons
            : [
                { title: '첫 번째 단계: 기초 다지기', duration: '12:30', isFree: true },
                { title: '핵심 테크닉과 실전 응용', duration: '25:15', isFree: false },
            ];

        return `
        <div class="curriculum-chapter" data-index="${i}">
            <div class="chapter-header">
                <div class="chapter-title-group">
                    <span class="chapter-num">CHAPTER ${chapterNum}</span>
                    <span class="chapter-title-text">${ch.title || '챕터 제목'}</span>
                </div>
                <div class="chapter-meta">
                    <span class="lesson-count">강의 ${lessons.length}개</span>
                    <span class="toggle-icon">⌄</span>
                </div>
            </div>
            <div class="lesson-list-container" id="chapter-${i}">
                ${lessons.map((lesson, j) => `
                    <div class="lesson-item">
                        <div class="lesson-info">
                            <span class="lesson-index">${j + 1}.</span>
                            <span class="lesson-name">${lesson.title || '강의 제목'}</span>
                        </div>
                        <div class="lesson-actions">
                            ${lesson.isFree ? '<span class="badge-preview">미리보기</span>' : ''}
                            <span class="lesson-duration">${lesson.duration || '-'}</span>
                            <span class="lesson-status-icon">${lesson.isFree ? '▶' : '●'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
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
    const icon = chapter?.querySelector('.toggle-icon');
    const isOpening = forceState !== undefined ? forceState : !container.classList.contains('active');

    if (isOpening) {
        container.classList.add('active');
        if (icon) icon.style.transform = 'rotate(180deg)';
    } else {
        container.classList.remove('active');
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}

function initToggleAll() {
    const btn = document.getElementById('btnToggleAll');
    if (!btn) return;

    let allOpen = false;
    btn.addEventListener('click', () => {
        allOpen = !allOpen;
        const chapters = document.querySelectorAll('.curriculum-chapter');
        chapters.forEach((_, idx) => toggleChapter(idx, allOpen));
        btn.textContent = allOpen ? '모두 닫기' : '모두 열기';
    });
}
