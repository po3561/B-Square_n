// view_curriculum.js
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initCurriculum = function (data) {
    console.log("📚 Curriculum Module Initializing...");
    renderCurriculum(data);
    initToggleAll();
};

function renderCurriculum(data) {
    const currList = document.getElementById('viewCurriculum');
    const chapCount = document.getElementById('chapCount');
    if (!currList) return;

    const curriculums = data.curriculum || [];
    if (chapCount) chapCount.textContent = `챕터 ${curriculums.length}개`;

    if (curriculums.length === 0) {
        currList.innerHTML = '<p class="empty-state">준비 중인 커리큘럼입니다.</p>';
        return;
    }

    currList.innerHTML = curriculums.map((ch, i) => {
        const chapterNum = (i + 1).toString().padStart(2, '0');
        // Placeholder lessons for demonstration (in real app, these would come from the chapter data)
        const lessons = ch.lessons || [
            { title: "첫 번째 단계: 기초 다지기", duration: "12:30", isFree: true },
            { title: "주요 핵심 테크닉 가이드", duration: "25:15", isFree: false }
        ];

        return `
        <div class="curriculum-chapter" data-index="${i}">
            <div class="chapter-header">
                <div class="chapter-title-group">
                    <span class="chapter-num">CHAPTER ${chapterNum}</span>
                    <span class="chapter-title-text">${ch.title}</span>
                </div>
                <div class="chapter-meta">
                    <span class="lesson-count">강의 ${lessons.length}개</span>
                    <span class="toggle-icon">▼</span>
                </div>
            </div>
            <div class="lesson-list-container" id="chapter-${i}">
                ${lessons.map((lesson, j) => `
                    <div class="lesson-item">
                        <div class="lesson-info">
                            <span class="lesson-index">${j + 1}.</span>
                            <span class="lesson-name">${lesson.title}</span>
                        </div>
                        <div class="lesson-actions">
                            ${lesson.isFree ? '<span class="badge-preview">미리보기</span>' : ''}
                            <span class="lesson-duration">${lesson.duration}</span>
                            <span class="lesson-status-icon">${lesson.isFree ? '▶️' : '🔒'}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `}).join('');

    // Add click events for toggling
    document.querySelectorAll('.chapter-header').forEach((header, idx) => {
        header.addEventListener('click', () => toggleChapter(idx));
    });
}

function toggleChapter(idx, forceState) {
    const container = document.getElementById(`chapter-${idx}`);
    const chapter = container.closest('.curriculum-chapter');
    const icon = chapter.querySelector('.toggle-icon');

    const isOpening = forceState !== undefined ? forceState : !container.classList.contains('active');

    if (isOpening) {
        container.classList.add('active');
        icon.style.transform = 'rotate(180deg)';
    } else {
        container.classList.remove('active');
        icon.style.transform = 'rotate(0deg)';
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
        btn.textContent = allOpen ? "전체 챕터 닫기" : "전체 챕터 열기";
    });
}
