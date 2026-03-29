// auth_1.js — B-Square 로그인 (D1 API 기반)
document.addEventListener('DOMContentLoaded', async () => {
    // BSQ.ready 대기
    if (window.BSQ && window.BSQ.ready) await window.BSQ.ready;

    const loginForm = document.getElementById('loginForm');
    const loginUsernameInput = document.getElementById('loginUsername');
    const chkSaveId = document.getElementById('chkSaveId');

    // [아이디 저장 불러오기]
    const savedId = localStorage.getItem('savedBsquareId');
    if (savedId && loginUsernameInput && chkSaveId) {
        loginUsernameInput.value = savedId;
        chkSaveId.checked = true;
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = loginUsernameInput.value.trim();
            const password = document.getElementById('loginPassword').value;
            const submitBtn = loginForm.querySelector('button[type="submit"]');

            submitBtn.disabled = true;
            submitBtn.textContent = '확인 중...';

            try {
                // [아이디 저장 처리]
                if (chkSaveId.checked) {
                    localStorage.setItem('savedBsquareId', username);
                } else {
                    localStorage.removeItem('savedBsquareId');
                }

                // ★ D1 API 로그인 호출
                const result = await window.BSQ.login(username, password);

                if (!result.success) {
                    throw new Error(result.error || '로그인에 실패했습니다.');
                }

                // [성공]
                window.location.replace('../index.html');

            } catch (error) {
                alert(error.message);
                console.error('Login Error:', error);
                submitBtn.disabled = false;
                submitBtn.textContent = '로그인';
            }
        });
    }
});
