import os
import sys

path = r'c:\Users\po356\Desktop\B-Square\사이트\개발\B-Square_n\create_class\create_class.js'

# Try to read with multiple encodings
encoding_used = 'utf-8'
content = None
for enc in ['utf-8', 'cp949']:
    try:
        with open(path, 'r', encoding=enc) as f:
            content = f.read()
            encoding_used = enc
            print(f"Read success with {enc}")
            break
    except UnicodeDecodeError:
        continue

if not content:
    print("Could not read file with any encoding.")
    sys.exit(1)

# Target block to replace (updateSteps function)
# We want to make the mobile update logic more robust and ensure it's called.

old_mobile_logic = """        // 모바일 단계 업데이트
        mobileStepDots.forEach(dot => {
            const stepNum = parseInt(dot.getAttribute('data-step'));
            dot.classList.toggle('active', stepNum === currentStep);
            dot.classList.toggle('completed', stepNum < currentStep);
        });

        if (mobileProgressFill) {
            const progress = (currentStep / totalSteps) * 100;
            mobileProgressFill.style.width = `${progress}%`;
        }

        if (mobileStepLabel) {
            const activeStepText = Array.from(stepItems).find(item => parseInt(item.getAttribute('data-step')) === currentStep)?.querySelector('.step-text')?.textContent;
            mobileStepLabel.textContent = activeStepText || '';
        }"""

new_mobile_logic = """        // 모바일 단계 업데이트 (연동성 강화)
        mobileStepDots.forEach(dot => {
            const stepNum = parseInt(dot.getAttribute('data-step'));
            if (stepNum === currentStep) {
                dot.classList.add('active');
                dot.classList.remove('completed');
            } else if (stepNum < currentStep) {
                dot.classList.remove('active');
                dot.classList.add('completed');
            } else {
                dot.classList.remove('active');
                dot.classList.remove('completed');
            }
        });

        if (mobileProgressFill) {
            // 현재 단계가 1이면 0%, 7이면 100%로 보이고 싶다면 ((currentStep-1)/(totalSteps-1))*100
            // 하지만 보통 현재 단계를 포함하는 진행바라면 (currentStep / totalSteps) * 100이 맞음
            const progress = (currentStep / totalSteps) * 100;
            mobileProgressFill.style.width = `${progress}%`;
        }

        if (mobileStepLabel) {
            // 사이드바의 step-item에서 텍스트를 가져옴
            const activeSidebarItem = Array.from(stepItems).find(item => parseInt(item.getAttribute('data-step')) === currentStep);
            if (activeSidebarItem) {
                const text = activeSidebarItem.querySelector('.step-text').textContent;
                mobileStepLabel.textContent = text;
            }
        }"""

if old_mobile_logic in content:
    new_content = content.replace(old_mobile_logic, new_mobile_logic)
    with open(path, 'w', encoding=encoding_used) as f:
        f.write(new_content)
    print("Successfully updated mobile progress logic in create_class.js.")
else:
    print("Could not find exact mobile logic block. It might have been modified.")
    # Fallback: try a simpler search or just report failure
    fallback_search = "mobileStepDots.forEach(dot => {"
    if fallback_search in content:
        print("Found partial match, attempting broader replacement...")
        # Since I know the structure from view_file, I'll try to find the start and end of that section
        import re
        pattern = r'// 모바일 단계 업데이트.*?\n\s+if \(mobileStepLabel\) \{.*?\n\s+\}'
        match = re.search(pattern, content, re.DOTALL)
        if match:
            new_content = content[:match.start()] + new_mobile_logic + content[match.end():]
            with open(path, 'w', encoding=encoding_used) as f:
                f.write(new_content)
            print("Successfully updated mobile progress logic using regex.")
        else:
            print("Regex match failed.")
