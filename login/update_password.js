document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('resetPasswordForm');
    const newPasswordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const token = new URLSearchParams(window.location.search).get('token') || '';

    if (!token) {
        alert('유효하지 않은 재설정 링크입니다.');
        window.location.href = 'find_account.html#reset';
        return;
    }

    form?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const password = newPasswordInput.value.trim();
        const confirmPassword = confirmPasswordInput.value.trim();

        if (password.length < 8) {
            alert('비밀번호는 8자 이상이어야 합니다.');
            return;
        }

        if (password !== confirmPassword) {
            alert('비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        const submitButton = form.querySelector('.btn-submit');
        submitButton.disabled = true;
        submitButton.textContent = '변경 중...';

        try {
            const result = await window.BSQ.api('/api/auth/reset-password-confirm', {
                method: 'POST',
                body: JSON.stringify({ token, password })
            });

            if (!result.success) {
                throw new Error(result.error || '비밀번호 변경에 실패했습니다.');
            }

            alert('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');
            window.location.href = 'login.html';
        } catch (error) {
            alert(error.message || '비밀번호 변경 중 오류가 발생했습니다.');
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = '비밀번호 변경';
        }
    });
});
