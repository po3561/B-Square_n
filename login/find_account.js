document.addEventListener('DOMContentLoaded', async () => {
    const emailInput = document.getElementById('findEmail');
    const submitBtn = document.querySelector('.btn-submit');
    const stepIndicators = document.querySelectorAll('.step-item');
    
    // 이메일 파라미터가 있다면 자동 채우기
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('email')) {
        emailInput.value = urlParams.get('email');
    }

    // 아이디/비밀번호 찾기 탭 스타일(해시에 따라 변경)
    if (window.location.hash === '#reset') {
        stepIndicators[0]?.classList.remove('active');
        stepIndicators[1]?.classList.add('active');
        document.querySelector('.auth-subtitle').textContent = "비밀번호를 재설정할 이메일을 입력해주세요";
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const email = emailInput.value.trim();

            if (!email || !email.includes('@')) {
                alert("유효한 이메일 주소를 입력해주세요.");
                emailInput.focus();
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = '메일 발송 중...';

            try {
                const result = await window.BSQ.api('/api/auth/reset-password-request', {
                    method: 'POST',
                    body: JSON.stringify({ email })
                });

                if (!result.success) {
                    throw new Error(result.error || '비밀번호 재설정 요청에 실패했습니다.');
                }

                let message = result.message || '입력하신 이메일로 비밀번호 재설정 링크가 발송되었습니다.';
                if (result.debug_reset_url) {
                    message += `\n\n[개발용 링크]\n${result.debug_reset_url}`;
                }
                alert(message);
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Password Reset Error:', error);
                alert(error.message || '비밀번호 재설정 요청에 실패했습니다. 다시 시도해주세요.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = '확인';
            }
        });
    }

    // 엔터키 입력 지원
    if (emailInput) {
        emailInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                submitBtn.click();
            }
        });
    }
});
