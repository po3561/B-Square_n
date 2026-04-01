// auth_1.js - B-Square login page controller
document.addEventListener('DOMContentLoaded', async () => {
    if (window.BSQ?.ready) {
        await window.BSQ.ready;
    }

    if (window.BSQSocialAuth?.init) {
        await window.BSQSocialAuth.init({ root: '#socialAuthLogin' });
    }

    const loginForm = document.getElementById('loginForm');
    const loginUsernameInput = document.getElementById('loginUsername');
    const chkSaveId = document.getElementById('chkSaveId');

    const savedId = localStorage.getItem('savedBsquareId');
    if (savedId && loginUsernameInput && chkSaveId) {
        loginUsernameInput.value = savedId;
        chkSaveId.checked = true;
    }

    if (!loginForm) return;

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = loginUsernameInput.value.trim();
        const password = document.getElementById('loginPassword').value;
        const submitBtn = loginForm.querySelector('button[type="submit"]');

        submitBtn.disabled = true;
        submitBtn.textContent = '확인 중...';

        try {
            if (chkSaveId.checked) {
                localStorage.setItem('savedBsquareId', username);
            } else {
                localStorage.removeItem('savedBsquareId');
            }

            const result = await window.BSQ.login(username, password);

            if (!result.success) {
                throw new Error(result.error || '로그인에 실패했습니다.');
            }

            window.location.replace('../index.html');
        } catch (error) {
            alert(error.message);
            console.error('Login Error:', error);
            submitBtn.disabled = false;
            submitBtn.textContent = '로그인';
        }
    });
});
