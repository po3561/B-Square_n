// view_intro.js
window.BSquareModules = window.BSquareModules || {};
window.BSquareModules.initIntro = function (data) {
    console.log("📖 Intro Module Initializing...");
    renderIntroContent(data);
};

function renderIntroContent(data) {
    // 1. Target Audience
    const targetList = document.getElementById('targetList');
    if (targetList) {
        const targetData = data.target_audience || [
            "관련 분야 기초를 탄탄하게 다지고 싶은 분",
            "실무에서 바로 활용 가능한 기술을 배우고 싶은 분",
            "자신만의 포트폴리오를 완성하고 싶은 입문자",
            "이론보다 실습 위주의 학습을 선호하시는 분"
        ];
        targetList.innerHTML = targetData.map(item => `<li><span class="check-icon">✓</span> ${item}</li>`).join('');
    }

    // 2. Learning Objectives
    const objectiveGrid = document.getElementById('objectiveGrid');
    if (objectiveGrid) {
        const objectiveData = data.objectives || [
            { icon: "💡", title: "기초 개념 완벽 이해", desc: "복잡한 개념도 쉽게 이해할 수 있도록 설명합니다." },
            { icon: "🛠️", title: "실전 프로젝트 완성", desc: "직접 결과물을 만들어 보며 실력을 증명합니다." },
            { icon: "🚀", title: "전문가 노하우 습득", desc: "검증된 크리에이터의 실전 팁을 모두 공유합니다." },
            { icon: "🤝", title: "평생 학습 커뮤니티", desc: "클래스 종료 후에도 함께 성장하는 동료를 얻습니다." }
        ];
        objectiveGrid.innerHTML = objectiveData.map(obj => `
            <div class="objective-card">
                <div class="obj-icon">${obj.icon}</div>
                <div class="obj-text">
                    <strong>${obj.title}</strong>
                    <p>${obj.desc}</p>
                </div>
            </div>
        `).join('');
    }

    // 3. Basic Info (Summary/Description) stays in HTML IDs
    const summaryEl = document.getElementById('viewSummary');
    const descEl = document.getElementById('viewDescription');
    if (summaryEl) summaryEl.textContent = data.summary || "";
    if (descEl) descEl.innerHTML = (data.description || "").replace(/\n/g, '<br>');
}
