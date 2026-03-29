window.BSquareModules = window.BSquareModules || {};

window.BSquareModules.initIntro = function (data) {
    renderIntroContent(data);
};

function renderIntroContent(data) {
    const heroSummary = document.getElementById('heroSummary');
    const introSummary = document.getElementById('introSummary');
    const summaryText = String(data?.summary || '').trim();

    if (heroSummary) {
        heroSummary.textContent = summaryText || '클래스의 핵심 장점과 수강 포인트를 한눈에 보여줍니다.';
    }

    if (introSummary) {
        introSummary.textContent = summaryText || '이 클래스의 목적, 학습 방식, 기대 효과를 짧게 정리합니다.';
    }

    const targetList = document.getElementById('targetList');
    if (targetList) {
        const targetData = Array.isArray(data?.target_audience) && data.target_audience.length
            ? data.target_audience
            : [
                '기초부터 차근차근 배우고 싶은 입문자',
                '실무에 바로 적용할 포트폴리오가 필요한 학습자',
                '혼자 공부하던 내용을 체계적으로 정리하고 싶은 분',
                '수업 후에도 커뮤니티와 함께 성장하고 싶은 분',
            ];

        targetList.innerHTML = targetData
            .map((item) => `<li><span class="check-icon">✓</span> ${String(item)}</li>`)
            .join('');
    }

    const objectiveGrid = document.getElementById('objectiveGrid');
    if (objectiveGrid) {
        const objectiveData = Array.isArray(data?.objectives) && data.objectives.length
            ? data.objectives
            : [
                {
                    icon: '💡',
                    title: '기초 개념을 쉽게 이해',
                    desc: '복잡한 개념도 예시와 비유를 활용해 자연스럽게 이해할 수 있도록 돕습니다.',
                },
                {
                    icon: '🛠️',
                    title: '실전 결과물 완성',
                    desc: '배운 내용을 직접 적용해 결과물을 만들고, 완성도 있게 마무리합니다.',
                },
                {
                    icon: '🚀',
                    title: '현업 노하우 습득',
                    desc: '검증된 제작 방식과 운영 팁을 함께 배워 실전 감각을 높입니다.',
                },
                {
                    icon: '🤝',
                    title: '학습 커뮤니티 연결',
                    desc: '수강 이후에도 질문과 피드백이 이어지는 구조로 학습을 유지합니다.',
                },
            ];

        objectiveGrid.innerHTML = objectiveData.map((obj) => `
            <div class="objective-card">
                <div class="obj-icon">${obj.icon || '•'}</div>
                <div class="obj-text">
                    <strong>${obj.title || '목표'}</strong>
                    <p>${obj.desc || ''}</p>
                </div>
            </div>
        `).join('');
    }
}
