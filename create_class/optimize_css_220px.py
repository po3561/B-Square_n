import os
import sys

path = r'c:\Users\po356\Desktop\B-Square\사이트\개발\B-Square_n\create_class\create_class.css'

# Try to read with multiple encodings
content = None
for enc in ['utf-8', 'cp949']:
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

# Optimization CSS for ultra-small screens
ultra_small_css = """
/* 220px~350px 초소형 화면 최적화 */
@media (max-width: 350px) {
    .create-layout {
        padding: 0 0.5rem !important;
        gap: 1rem !important;
    }

    .mobile-step-nav {
        padding: 1rem 0.5rem !important;
        border-radius: 16px !important;
        margin-bottom: 1.5rem !important;
    }

    .mobile-nav-title {
        font-size: 1rem !important;
        margin-bottom: 1rem !important;
    }

    .mobile-nav-dots {
        padding: 0 5px !important;
        gap: 2px !important;
    }

    .nav-dot {
        width: 20px !important;
        height: 20px !important;
        font-size: 0.65rem !important;
        min-width: 20px !important;
    }

    .mobile-nav-progress {
        margin: 0 5px 1rem !important;
        height: 4px !important;
    }

    .mobile-nav-current {
        font-size: 0.85rem !important;
    }

    .create-content {
        padding: 1rem 0.5rem !important;
    }

    .step-header h2 {
        font-size: 1.2rem !important;
    }

    .field-group {
        padding: 0.7rem !important;
        border-radius: 12px !important;
    }

    .premium-input, 
    .premium-textarea {
        padding: 0.7rem !important;
        font-size: 0.85rem !important;
        border-radius: 12px !important;
    }

    .create-actions {
        flex-direction: column !important;
        gap: 8px !important;
    }

    .create-actions button {
        width: 100% !important;
        padding: 0.8rem !important;
        font-size: 0.9rem !important;
        min-height: 40px !important;
    }
}
"""

# Append or insert before existing media queries
if "/* 220px~350px" not in content:
    new_content = content + "\n" + ultra_small_css
    with open(path, 'w', encoding=enc) as f:
        f.write(new_content)
    print("Successfully appended ultra-small screen optimization CSS.")
else:
    print("Optimization CSS already exists.")
