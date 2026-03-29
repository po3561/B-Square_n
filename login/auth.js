// auth.js — B-Square 회원가입 (D1 API 기반)
(function () {
    let _isIdChecked = false;

    const TERMS_CONTENT = {
        chkTerm1: { title: "이용약관 동의", content: "이용약관 상세 내용입니다..." },
        chkTerm2: { title: "개별 서비스 약관", content: "개별 서비스 약관 상세 내용입니다..." },
        chkTerm3: { title: "개인정보 수집 및 이용 동의", content: "개인정보 정책 상세 내용입니다..." },
        chkTermMark: { title: "마케팅 활용 및 정보 수신 동의", content: "마케팅 정책 상세 내용입니다..." }
    };

    document.addEventListener('DOMContentLoaded', () => {
        console.log("Auth System Initializing (D1 API)...");
        initSignup();
    });

    function initSignup() {
        const chkAll = document.getElementById('chkAllAgree');
        const chkTerms = document.querySelectorAll('.chk-term');
        const btnNext1 = document.getElementById('btnNext1');
        const termsBox = document.querySelector('.terms-box');

        // [1] 전체 동의 연동
        if (chkAll) {
            chkAll.onclick = () => {
                const state = chkAll.checked;
                chkTerms.forEach(c => {
                    c.checked = state;
                    const item = c.closest('.term-item');
                    if (item) item.classList.remove('error-highlight');
                });
                if (state && termsBox) termsBox.classList.remove('error-highlight');
            };
        }

        chkTerms.forEach(c => {
            c.onchange = () => {
                const allChecked = Array.from(chkTerms).every(t => t.checked);
                if (chkAll) chkAll.checked = allChecked;
                if (c.checked) {
                    const item = c.closest('.term-item');
                    if (item) item.classList.remove('error-highlight');
                }
            };
        });

        // [2] 1단계 다음 버튼
        if (btnNext1) {
            btnNext1.onclick = () => {
                const required = document.querySelectorAll('.chk-term.required');
                let missing = false;
                required.forEach(r => {
                    if (!r.checked) {
                        missing = true;
                        const item = r.closest('.term-item');
                        if (item) item.classList.add('error-highlight');
                    }
                });
                if (missing) {
                    if (termsBox) termsBox.classList.add('error-highlight');
                    alert("필수 약관에 모두 동의해주셔야 진행 가능합니다.");
                    return;
                }
                showStep(2);
            };
        }

        // [3] 정보 입력 폼
        const infoForm = document.getElementById('infoForm');
        if (infoForm) {
            infoForm.onsubmit = async (e) => {
                e.preventDefault();
                await handleFinalSubmit();
            };
        }

        initUIExtras();
    }

    async function handleFinalSubmit() {
        if (!_isIdChecked) return alert("아이디 중복확인이 필요합니다.");

        const pw = document.getElementById('signupPassword').value;
        const pwConfirm = document.getElementById('signupPasswordConfirm').value;
        if (pw.length < 8) return alert("비밀번호는 8자 이상이어야 합니다.");
        if (pw !== pwConfirm) return alert("비밀번호가 일치하지 않습니다.");

        const name = document.getElementById('signupName').value.trim();
        const phone = document.getElementById('signupPhone').value.trim();
        if (!name || !phone) return alert("이름과 연락처를 입력해주세요.");

        const submitBtn = document.getElementById('btnSubmit');
        submitBtn.disabled = true;
        submitBtn.textContent = "처리 중...";

        try {
            const emailUser = document.getElementById('emailUser').value.trim();
            const emailDomain = document.getElementById('emailDomain').value.trim();
            const email = emailUser + '@' + emailDomain;

            const genderVal = document.querySelector('#genderChoice .active')?.dataset.value;
            const gender = genderVal === 'M' ? '남자' : (genderVal === 'F' ? '여자' : 'N');
            const nationality = document.querySelector('#nationalityChoice .active')?.dataset.value || 'local';

            // ★ D1 API 호출로 회원가입
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
                    referrer_code: document.getElementById('referrerCode')?.value || null
                })
            });

            if (!result.success) {
                throw new Error(result.error || '회원가입에 실패했습니다.');
            }

            showStep(3); // 가입 완료 화면
        } catch (err) {
            console.error("Final Signup Error:", err);
            alert("가입 실패: " + (err.message || "알 수 없는 오류가 발생했습니다."));
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "가입 완료";
            }
        }
    }

    function showStep(n) {
        document.querySelectorAll('.auth-step').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.step-item').forEach(i => i.classList.remove('active'));

        const target = document.getElementById('step' + n);
        if (target) target.classList.add('active');

        const indicators = document.querySelectorAll('.step-item');
        for (let i = 0; i < n; i++) {
            if (indicators[i]) indicators[i].classList.add('active');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function initUIExtras() {
        // 모달 제어
        const modal = document.getElementById('termsDetailModal');
        const detailBtns = document.querySelectorAll('.btn-view-detail');
        detailBtns.forEach(btn => {
            btn.onclick = () => {
                const id = btn.closest('.term-item').querySelector('input').id;
                const data = TERMS_CONTENT[id];
                if (data) {
                    document.getElementById('modalTitle').textContent = data.title;
                    document.getElementById('modalBody').innerHTML = data.content.split('\n').join('<br>');
                    modal.style.display = 'flex';
                }
            };
        });
        const closeBtn = document.getElementById('btnCloseTerms');
        if (closeBtn) closeBtn.onclick = () => modal.style.display = 'none';
        if (modal) modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

        // ★ 아이디 중복확인 — D1 API 호출
        const checkIdBtn = document.getElementById('btnCheckId');
        if (checkIdBtn) {
            checkIdBtn.onclick = async () => {
                const id = document.getElementById('signupId').value.trim();
                if (!id) return alert("아이디를 입력해주세요.");
                const msg = document.getElementById('idStatusMsg');

                const result = await window.BSQ.api(`/api/auth/check-username?username=${encodeURIComponent(id)}`);

                if (result.success && result.data.available) {
                    _isIdChecked = true;
                    msg.textContent = "사용 가능한 아이디입니다.";
                    msg.className = "status-msg success";
                } else {
                    _isIdChecked = false;
                    msg.textContent = result.data?.message || "이미 사용 중인 아이디입니다.";
                    msg.className = "status-msg error";
                }
            };
            document.getElementById('signupId').oninput = () => {
                _isIdChecked = false;
                document.getElementById('idStatusMsg').textContent = "";
            };
        }

        // 선택 버튼 (성별 등)
        document.querySelectorAll('.choice-group').forEach(g => {
            const btns = g.querySelectorAll('.btn-choice');
            btns.forEach(b => {
                b.onclick = () => {
                    btns.forEach(x => x.classList.remove('active'));
                    b.classList.add('active');
                };
            });
        });

        // 이메일 도메인
        const emailSel = document.getElementById('emailSelect');
        if (emailSel) {
            emailSel.onchange = (e) => { document.getElementById('emailDomain').value = e.target.value; };
        }
    }

    window.showStep = showStep;
})();
