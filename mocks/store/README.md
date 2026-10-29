正典は [.designs/20261029-store-screenshots.md](../../.designs/20261029-store-screenshots.md) §6。

## 6. パイプライン (コマンド列)

atender ルート (`projects/atender/`) で。Touri の手元のターミナルで実行する (AI の背景プロセスの API はターン終了で kill される — CLAUDE.md)。

```sh
# 0. 一度だけ: 撮影専用シミュレータ (共有の端末を汚さない)
xcrun simctl create "Atender Store 6.9" com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max com.apple.CoreSimulator.SimRuntime.iOS-26-5
#    → 出力の UDID を以下 $SIM に入れる

# 1. API + seed (平日に実行)
cd apps/api
pnpm exec prisma generate
pnpm exec tsx watch --env-file=.env src/index.ts            # 別ターミナルで起動したまま
pnpm exec tsx --env-file=.env scripts/seed-store-demo.ts    # → JSON (bearerToken: store-demo-bearer-token-0001)

# 2. シミュレータの外観とステータスバー
xcrun simctl boot $SIM
xcrun simctl ui $SIM appearance light
xcrun simctl status_bar $SIM override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3

# 3. ディスプレイスリープ対策 (headless 撮影の全滅を防ぐ — knowledge/gotcha/macos-display-sleep-blocks-headless-screenshot.md)
nohup caffeinate -d -u -t 1800 > /dev/null 2>&1 &

# 4. 素材 5 枚を撮る (main の最新で。build 22 のホーム行高変更を含めた見た目で撮る)
cd ../ios
/opt/homebrew/bin/xcodegen generate
xcodebuild test -project Atender.xcodeproj -scheme AtenderUITests \
  -destination "platform=iOS Simulator,id=$SIM" \
  -only-testing:AtenderUITests/StoreShotsFlow/testCaptureStoreShots \
  -resultBundlePath build/store-shots.xcresult > build/store-shots.log 2>&1
#    出力は tail/grep にパイプしない (CLAUDE.md)。結果は build/store-shots.log の末尾で見る

# 5. attachment を書き出し
xcrun xcresulttool export attachments --path build/store-shots.xcresult --output-path build/store-shots

# 6. 名前を復元して mocks/store/shots/ へ (manifest.json の suggestedHumanReadableName → exportedFileName)
python3 -I - <<'PY'
import json, shutil, pathlib
src = pathlib.Path('build/store-shots'); dst = pathlib.Path('../../mocks/store/shots'); dst.mkdir(parents=True, exist_ok=True)
for test in json.loads((src / 'manifest.json').read_text()):
    for a in test.get('attachments', []):
        name = a['suggestedHumanReadableName'].split('_')[0]   # "s1-semester_0_<uuid>.png" 等 → "s1-semester"
        if name in {'s1-semester', 's2-home', 's3-courses', 's4-templates', 's5-room'}:
            shutil.copyfile(src / a['exportedFileName'], dst / f'{name}.png')
PY
sips -g pixelWidth -g pixelHeight ../../mocks/store/shots/*.png   # 全て 1320×2868 であること
xcrun simctl status_bar $SIM clear

# 7. 合成 (比較用に 4 通り。承認ゲートで Touri が見る)
cd ../../mocks/store
bash render.sh light a ; bash render.sh light b ; bash render.sh dark a ; bash render.sh dark b

# 8. Touri が選んだ組 (推奨 a-light) を提出用に置く
mkdir -p ../../assets/store/1.0.1
cp out/a-light/slide-{1,2,3,4,5}.png ../../assets/store/1.0.1/
```

- manifest の `suggestedHumanReadableName` の形式は xcresulttool の版で変わり得る。手順 6 で 5 枚が揃わなかったら manifest.json を開いて区切りを合わせる (名前の先頭が attachment 名であることは変わらない)
- `mocks/store/shots/` と `out/` は git に入れない (`.gitignore`)。コミットするのは `assets/store/1.0.1/slide-*.png` と `mocks/store/` のソース一式だけ
- ステータスバーの override は手順 4 の撮影 (XCUIScreen) にも効く。手順 6 の後で `s*.png` の左上が 9:41 になっていなければ止めて Leader に報告する (撮り方を変える判断が要る)

