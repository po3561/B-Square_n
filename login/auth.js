// auth.js - B-Square signup page controller
(function () {
    let isIdChecked = false;

    const TERMS_CONTENT = {
        chkTerm1: { title: '이용약관 동의', content: '이용약관 상세 내용입니다...' },
        chkTerm2: { title: '개별 서비스 약관', content: '개별 서비스 약관 상세 내용입니다...' },
        chkTerm3: { title: '개인정보 수집 및 이용 동의', content: '개인정보 정책 상세 내용입니다...' },
        chkTermMark: { title: '마케팅 활용 및 정보 수신 동의', content: '마케팅 정책 상세 내용입니다...' },
    };

    document.addEventListener('DOMContentLoaded', async () => {
        if (window.BSQ?.ready) {
            await window.BSQ.ready;
        }

        if (window.BSQSocialAuth?.init) {
            await window.BSQSocialAuth.init({ root: '#socialAuthSignup' });
        }

        initSignup();
    });

    function initSignup() {
        const chkAll = document.getElementById('chkAllAgree');
        const chkTerms = document.querySelectorAll('.chk-term');
        const btnNext1 = document.getElementById('btnNext1');
        const termsBox = document.querySelector('.terms-box');
        const infoForm = document.getElementById('infoForm');

        if (chkAll) {
            chkAll.onclick = () => {
                const nextState = chkAll.checked;
                chkTerms.forEach((checkbox) => {
                    checkbox.checked = nextState;
                    checkbox.closest('.term-item')?.classList.remove('error-highlight');
                });
                if (nextState) termsBox?.classList.remove('error-highlight');
            };
        }

        chkTerms.forEach((checkbox) => {
            checkbox.onchange = () => {
                const allChecked = Array.from(chkTerms).every((item) => item.checked);
                if (chkAll) chkAll.checked = allChecked;
                if (checkbox.checked) {
                    checkbox.closest('.term-item')?.classList.remove('error-highlight');
                }
            };
        });

        if (btnNext1) {
            btnNext1.onclick = () => {
                const requiredTerms = document.querySelectorAll('.chk-term.required');
                let missing = false;

                requiredTerms.forEach((checkbox) => {
                    if (checkbox.checked) return;
                    missing = true;
                    checkbox.closest('.term-item')?.classList.add('error-highlight');
                });

                if (missing) {
                    termsBox?.classList.add('error-highlight');
                    alert('필수 약관에 모두 동의해주셔야 진행 가능합니다.');
                    return;
                }

                showStep(2);
            };
        }

        if (infoForm) {
            infoForm.onsubmit = async (event) => {
                event.preventDefault();
                await handleFinalSubmit();
            };
        }

        initUIExtras();
    }

    async function handleFinalSubmit() {
        if (!isIdChecked) {
            alert('아이디 중복확인이 필요합니다.');
            return;
        }

        const pw = document.getElementById('signupPassword').value;
        const pwConfirm = document.getElementById('signupPasswordConfirm').value;
        if (pw.length < 8) return alert('비밀번호는 8자 이상이어야 합니다.');
        if (pw !== pwConfirm) return alert('비밀번호가 일치하지 않습니다.');

        const name = document.getElementById('signupName').value.trim();
        const phone = document.getElementById('signupPhone').value.trim();
        if (!name || !phone) return alert('이름과 연락처를 입력해주세요.');

        const submitBtn = document.getElementById('btnSubmit');
        submitBtn.disabled = true;
        submitBtn.textContent = '처리 중...';

        try {
            const emailUser = document.getElementById('emailUser').value.trim();
            const emailDomain = document.getElementById('emailDomain').value.trim();
            const email = `${emailUser}@${emailDomain}`;

            const genderVal = document.querySelector('#genderChoice .active')?.dataset.value;
            const gender = genderVal === 'M' ? '남자' : (genderVal === 'F' ? '여자' : 'N');
            const nationality = document.querySelector('#nationalityChoice .active')?.dataset.value || 'local';

            const result = await window.BSQ.api('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email,
                    password: pw,
                    name,
                    phone,
                    username: document.getElementById('signupId').value.trim(),
                    birth_year: document.getElementById('birthYear').value.trim(),
                    birth_month: document.getElementById('birthMonth').value.trim(),
                    birth_day: document.getElementById('birthDay').value.trim(),
                    gender,
                    nationality,
                    signup_path: document.getElementById('joinRoute').value,
                    referrer_code: document.getElementById('referrerCode')?.value || null,
                }),
            });

            if (!result.success) {
                throw new Error(result.error || '회원가입에 실패했습니다.');
            }

            showStep(3);
        } catch (error) {
            console.error('Final Signup Error:', error);
            alert(`가입 실패: ${error.message || '알 수 없는 오류가 발생했습니다.'}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '회원가입 완료';
        }
    }

    function showStep(stepNumber) {
        document.querySelectorAll('.auth-step').forEach((step) => step.classList.remove('active'));
        document.querySelectorAll('.step-item').forEach((item) => item.classList.remove('active'));

        document.getElementById(`step${stepNumber}`)?.classList.add('active');

        const indicators = document.querySelectorAll('.step-item');
        for (let index = 0; index < stepNumber; index += 1) {
            indicators[index]?.classList.add('active');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function initUIExtras() {
        const modal = document.getElementById('termsDetailModal');
        const detailBtns = document.querySelectorAll('.btn-view-detail');

        detailBtns.forEach((button) => {
            button.onclick = () => {
                const id = button.closest('.term-item').querySelector('input').id;
                const data = TERMS_CONTENT[id];
                if (!data) return;

                document.getElementById('modalTitle').textContent = data.title;
                document.getElementById('modalBody').innerHTML = data.content.split('\n').join('<br>');
                modal.style.display = 'flex';
            };
        });

        const closeBtn = document.getElementById('btnCloseTerms');
        if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
        if (modal) {
            modal.onclick = (event) => {
                if (event.target === modal) modal.style.display = 'none';
            };
        }

        const checkIdBtn = document.getElementById('btnCheckId');
        const signupIdInput = document.getElementById('signupId');
        const idStatusMsg = document.getElementById('idStatusMsg');

        if (checkIdBtn) {
            checkIdBtn.onclick = async () => {
                const username = signupIdInput.value.trim();
                if (!username) return alert('아이디를 입력해주세요.');

                const result = await window.BSQ.api(`/api/auth/check-username?username=${encodeURIComponent(username)}`);

                if (result.success && result.data.available) {
                    isIdChecked = true;
                    idStatusMsg.textContent = '사용 가능한 아이디입니다.';
                    idStatusMsg.className = 'status-msg success';
                    return;
                }

                isIdChecked = false;
                idStatusMsg.textContent = result.data?.message || '이미 사용 중인 아이디입니다.';
                idStatusMsg.className = 'status-msg error';
            };
        }

        if (signupIdInput) {
            signupIdInput.oninput = () => {
                isIdChecked = false;
                idStatusMsg.textContent = '';
                idStatusMsg.className = 'status-msg';
            };
        }

        document.querySelectorAll('.choice-group').forEach((group) => {
            const buttons = group.querySelectorAll('.btn-choice');
            buttons.forEach((button) => {
                button.onclick = () => {
                    buttons.forEach((item) => item.classList.remove('active'));
                    button.classList.add('active');
                };
            });
        });

        const emailSel = document.getElementById('emailSelect');
        if (emailSel) {
            emailSel.onchange = (event) => {
                document.getElementById('emailDomain').value = event.target.value;
            };
        }
    }

    window.showStep = showStep;
})();
