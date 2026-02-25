document.addEventListener('DOMContentLoaded', () => {
    // 1. 수파베이스 설정
    const supabaseUrl = 'https://tqyckxgtavviatkfsymb.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxeWNreGd0YXZ2aWF0a2ZzeW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NTQ1MjYsImV4cCI6MjA4NzEzMDUyNn0.Lc6Q9Q8qavIPI13bFdQEf0Mhmv4XOS41WtEr7CVXCCw';
    const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

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

                // [조회] 이메일 형식 체크 후 아이디면 이메일 찾기
                let loginEmail = username;
                if (!username.includes('@')) {
                    const { data: userData, error: userError } = await supabase
                        .from('users')
                        .select('email')
                        .eq('username', username)
                        .maybeSingle();

                    if (userError || !userData) {
                        throw new Error('존재하지 않는 사용자 정보입니다.');
                    }
                    loginEmail = userData.email;
                }

                // [인증]
                const { data, error: loginError } = await supabase.auth.signInWithPassword({
                    email: loginEmail,
                    password: password,
                });

                if (loginError) {
                    throw new Error('아이디 또는 비밀번호를 다시 확인해주세요.');
                }

                // [성공]
                window.location.href = '/bsnnnnnnnnnnnnnnnnnn/index.html';

            } catch (error) {
                alert(error.message);
                console.error('Login Error:', error);
                submitBtn.disabled = false;
                submitBtn.textContent = '로그인';
            }
        });
    }
});