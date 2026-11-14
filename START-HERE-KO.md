# VOXEL AIRRUN 8.0.1 — 실행과 GitHub 업로드

이 프로젝트는 사용자가 Google Drive로 제공한 `VOXEL-AIRRUN-5.0.1-GitHub-Max.zip`의 소스를 바탕으로 개선한 8.0.1 버전입니다. 원본 사이트는 HTTP 401 응답으로 소스를 확인할 수 없어 제공된 ZIP을 기준으로 작업했습니다. 기준 5.0.1 / 배포 버전 14의 소스 커밋은 `16058542f76d0d1f9b9af277e14db6e5a71ef5a6`입니다. 기존 사이트 연결용 프로젝트 ID는 제거했습니다.

8.0.1의 변경과 검증 범위는 [docs/RELEASE-8.0.1.md](docs/RELEASE-8.0.1.md)에 있습니다. Edition12의 403종 모델, 텍스처·동작·충돌 자료, 사운드와 의존성 잠금 파일을 포함합니다. 파일 제공, GitHub 업로드, 웹 호스팅 게시는 각각 별도 단계이며 이 작업에서 외부 사이트를 게시하지 않았습니다.

F는 플로우 추가 보너스 확정입니다. 확정하면 현재 체인·배율이 다시 시작되고, 피격·8초 단절 때는 미정산 추가 보너스만 잃습니다. 기본 점수·정밀·작전 보상은 유지됩니다. Shift/Space는 설정에 따라 누르는 동안 가감속하거나 5단 기어를 조절합니다.

## 로컬에서 게임 실행

Node.js 22.13 이상과 Git을 설치합니다. 압축을 풀었다면 `package.json`이 있는 프로젝트 폴더에서 터미널을 열고 실행합니다.

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm run dev
```

터미널에 표시되는 주소를 브라우저에서 엽니다. Linux/WSL에서는 프로젝트 전용 설치 스크립트인 `npm run install:ci`도 사용할 수 있습니다.

격납고에서 **3분 출격**, **무한 항로**, **오늘의 항로**를 선택합니다. 3분 출격에서는 정밀 통과·가속 거리·근접 회피 중 목표를 정하고, 완주 후 같은 항로에서 자신의 고스트 기록에 도전할 수 있습니다. 고스트는 E 없이 완주한 동일 기체·강화·난이도·목표의 기록에만 표시됩니다. 난이도는 **여유 / 표준 / 숙련**에서 선택하며 다음 출격에 적용됩니다. 오늘의 항로는 표준 난이도로 고정됩니다. 비행 중 목표·플로우 HUD, 종료 후 비행 평가와 보너스 내역을 확인할 수 있습니다. 오늘의 항로 기록은 뉴욕 날짜 기준이며 일반 비행과 E 사용 비행을 구분해 해당 기기에 저장합니다.

검사와 배포용 빌드는 프로젝트 폴더에서 실행합니다.

```sh
npm run typecheck
npm run lint:game
npm run test:game
npm run build
```

자동 검사와 소프트웨어 GPU 브라우저 검증은 실제 기기의 FPS나 발열, 장시간 플레이를 보장하지 않습니다.

## Windows에서 GitHub에 올리기

다음은 ZIP을 풀어 **새 빈 저장소에 처음 올리는 경우**의 명령입니다. 이미 Git으로 받은 저장소에서는 다시 초기화하지 않고 기존 원격 저장소와 변경 사항을 확인합니다.

1. ZIP의 압축을 풀고 `package.json`이 있는 폴더를 엽니다.
2. GitHub에서 빈 저장소를 만든 뒤 저장소 주소를 복사합니다.
3. 해당 폴더에서 PowerShell 또는 Git Bash를 열고 아래 명령을 실행합니다. `YOUR-ACCOUNT`와 `YOUR-REPO`를 실제 주소에 맞게 바꿉니다.

```sh
git init -b main
git add -A
git commit -m "Import VOXEL AIRRUN 8.0.1"
git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPO.git
git push -u origin main
```

GitHub에는 압축을 푼 개별 파일을 올립니다. 브라우저 업로드는 파일당 25 MiB 한도가 있으므로 전체 프로젝트는 Git 명령으로 올립니다. Git이 작성자 정보를 요청하면 이름과 이메일을 설정한 뒤 커밋을 다시 실행합니다. 웹에서 게임을 실행하려면 GitHub 업로드 이후 호스팅 서비스의 빌드·게시 설정이 필요합니다.

공식 GitHub 안내:

- [기존 소스를 GitHub에 올리기](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
- [GitHub 파일 크기 한도](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)

기록은 브라우저와 사이트 주소별로 저장됩니다. 다른 주소로 옮길 때는 기존 게임 설정에서 백업을 내보내고 새 주소에서 가져오세요. 코드 덮어쓰기는 브라우저 저장을 지우지 않습니다.
