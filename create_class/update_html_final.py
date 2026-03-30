import os
import sys

path = r'c:\Users\po356\Desktop\B-Square\사이트\개발\B-Square_n\create_class\create_class.html'

# Try to read with multiple encodings
content = None
for enc in ['cp949', 'utf-8', 'utf-16']:
    try:
        with open(path, 'r', encoding=enc) as f:
            content = f.read()
            print(f"Read success with {enc}")
            break
    except UnicodeDecodeError:
        continue

if not content:
    print("Could not read file with any encoding.")
    sys.exit(1)

nav_html = """
            <!-- 모바일 전용 단계 네비게이션 -->
            <div class="mobile-step-nav">
                <h3 class="mobile-nav-title">클래스 개설</h3>
                <div class="mobile-nav-dots">
                    <div class="nav-dot active" data-step="1">1</div>
                    <div class="nav-dot" data-step="2">2</div>
                    <div class="nav-dot" data-step="3">3</div>
                    <div class="nav-dot" data-step="4">4</div>
                    <div class="nav-dot" data-step="5">5</div>
                    <div class="nav-dot" data-step="6">6</div>
                    <div class="nav-dot" data-step="7">7</div>
                </div>
                <div class="mobile-nav-progress">
                    <div class="progress-fill" id="mobileProgressFill"></div>
                </div>
                <div class="mobile-nav-current" id="mobileStepLabel">기본 정보</div>
            </div>
"""

# HTML insertion point
target = '<main class="create-content">'
if target in content:
    new_content = content.replace(target, target + nav_html)
    # Save back with the SAME encoding as read
    with open(path, 'w', encoding=enc) as f:
        f.write(new_content)
    print(f"Successfully updated create_class.html using {enc} encoding.")
else:
    print(f"Error: Target '{target}' not found in file content.")
    # Show snippet of where it might be failing
    idx = content.find('create-content')
    if idx != -1:
        print(f"Found 'create-content' at index {idx}, surrounding: ...{content[idx-20:idx+40]}...")
    else:
        print("Could not even find 'create-content' substring.")
