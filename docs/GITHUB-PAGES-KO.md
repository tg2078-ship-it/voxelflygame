# GitHub 업로드와 사이트 배포

이 프로젝트는 `tg2078-ship-it/voxelflygame`용으로 준비했습니다. 소스 업로드와 웹사이트 게시 상태는 별개입니다. 저장소의 비공개 설정은 자동으로 바꾸지 않습니다.

## GitHub Pages

1. 저장소의 **Settings → Pages → Build and deployment → Source**에서 **GitHub Actions**를 선택합니다.
2. `.github/workflows/pages.yml`이 없다면 이 프로젝트의 `docs/github-pages.yml` 내용을 해당 경로로 추가합니다. 연결 앱에 workflow 쓰기 권한이 없을 때는 GitHub 웹 화면에서 추가할 수 있습니다.
3. **Actions → Deploy VOXEL AIRRUN → Run workflow**로 실행합니다.
4. 성공한 `deploy` 작업이 출력한 주소를 엽니다. 예상 프로젝트 주소는 `https://tg2078-ship-it.github.io/voxelflygame/`이며 배포 성공 전에는 작동한다고 볼 수 없습니다.

비공개 저장소의 Pages 사용 가능 여부는 GitHub 계정 플랜에 따릅니다. Pages 설정을 사용할 수 없을 때 저장소를 임의로 공개 전환하지 말고 GitHub의 안내를 확인하세요. 사용자 정의 도메인을 연결한다면 빌드의 `AIRRUN_BASE_PATH`를 `/`로 바꿉니다.

## 서버 없이 빌드하기

```sh
npx --yes pnpm@11.25.0 install --frozen-lockfile
npm run build
npm run build:static
```

`dist-static`에 `index.html`, JavaScript, 워커, 스타일, 원본 모델 전달본과 음원이 생깁니다. Node 서버나 Sites 로그인 서버가 필요하지 않습니다. 반드시 HTTP(S) 서버로 열며 `index.html` 파일을 직접 더블클릭해서 실행하는 방식은 지원하지 않습니다.

GitHub 프로젝트 Pages용 빌드:

```sh
AIRRUN_BASE_PATH=/voxelflygame/ npm run build:static
```

이는 macOS/Linux 셸 문법입니다. PowerShell에서는 `$env:AIRRUN_BASE_PATH='/voxelflygame/'; npm run build:static`을 사용합니다. 모델·텍스처·음원·워커 요청이 프로젝트 하위 경로를 사용하며, 일반 루트 호스팅에서는 `/`를 사용합니다.

Cloudflare Pages의 직접 업로드는 파일 수 때문에 Wrangler CLI를 사용합니다. 공식 제한은 CLI 20,000개/파일당 25MiB이며, 대시보드 드래그 업로드는 1,000개입니다. 빌드 스크립트는 CLI 제한을 검사합니다. 출처: https://developers.cloudflare.com/pages/get-started/direct-upload/

원본 공개 자산과 기존 8.0.1 게임 기능을 보존합니다. 새 주소에서는 브라우저 저장 공간이 달라지므로 기존 게임 설정에서 기록을 내보내고 새 주소에서 가져오면 됩니다.
