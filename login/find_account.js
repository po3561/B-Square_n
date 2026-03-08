document.addEventListener('DOMContentLoaded', async () => {
    // 1. Supabase 초기화 (bsq_server.js가 이미 포함되어 있을 가능성이 높지만 방어적 코드 작성)
    const supabaseUrl = 'https://tqyckxgtavviatkfsymb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw';
    let supabase = window.supabaseClient;
    if (!supabase && window.supabase) {
        supabase = window.supabase.createClient(supabaseUrl, supabaseKey);
    }

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
                // 이메일로 비밀번호 재설정 링크 발송 (리다이렉트 URL 지정)
                const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: window.location.origin + '/login/update_password.html',
                });

                if (error) {
                    throw new Error(error.message);
                }

                alert('입력하신 이메일로 비밀번호 재설정 링크가 발송되었습니다. 이메일함을 확인해주세요.');
                window.location.href = 'login.html';
            } catch (error) {
                console.error('Password Reset Error:', error);
                
                // 에러 메시지 한글화 처리
                let errorMsg = '비밀번호 재설정 요청에 실패했습니다. 다시 시도해주세요.';
                if (error.message.includes('User not found')) errorMsg = '가입되지 않은 이메일입니다.';
                else if (error.message.includes('rate limit')) errorMsg = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
                
                alert(errorMsg);
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
