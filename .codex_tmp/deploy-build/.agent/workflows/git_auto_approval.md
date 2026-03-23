---
description: git 명령어를 자동으로 승인하도록 설정하는 워크플로우
---

// turbo-all
1. 이 워크플로우가 존재하면 모든 git 명령어 관련 `run_command` 호출 시 `SafeToAutoRun: true`를 설정합니다.
2. `git status`를 실행하여 설정이 정상적으로 작동하는지 확인합니다.
   ```powershell
   git status
   ```
