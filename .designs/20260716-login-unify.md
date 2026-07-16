# ログイン画面統一 (iOS + Web) — ボタン統一 / 本物の Google ロゴ / Web への Apple 追加

## 目的

3ボタン (Apple / Google / メール) が iOS・Web でバラバラに見える状態を解消する。iOS は Google ロゴがグレーの四角 (プレースホルダのまま)、Web はロゴ画像ですらなくリテラル文字列 `"G　Google でサインイン"` で Apple も無い。**両プラットフォームで同一ジオメトリ・同一配色・同一 IA の 3 ボタンに揃え、Google/Apple の公式アートワークを載せ、Web に Apple ログインを追加する。**

## スコープ境界 (触るファイル)

**iOS (`apps/ios`)**
- `Atender/Features/Auth/AuthView.swift` — 3ボタンを新コンポーネントへ、Apple 純正ボタン廃止
- `Atender/Core/DesignSystem/Components/AuthProviderButton.swift` — 全面書き換え (Kind ベース API)
- `Atender/Assets.xcassets/google-g.imageset/` — プレースホルダ PNG を公式アートワークに差し替え
- `Atender/Assets.xcassets/apple-logo.imageset/` — 新規
- `Atender/Resources/Fonts/GoogleSans-Medium-Latin.ttf` — 新規
- `Atender/Info.plist` — `UIAppFonts` 新規追加 (Google Sans 登録用)
- `AtenderTests/AuthViewModelTests.swift` — 既存維持 (VM の API は不変)

**Web (`apps/web`)**
- `src/routes/SignIn.tsx` — 全面書き換え (IA を iOS に合わせる + Apple 追加)
- `src/components/ui/AuthProviderButton.tsx` — 新規
- `src/components/ui/index.ts` — export 追加
- `index.html` — Google Fonts link に `Google+Sans:wght@500` 追加
- `public/google-g.png` / `public/apple-logo-black.svg` — 新規 (公式アートワーク)
- `tests/routes/SignIn.test.tsx` / `tests/routes/Guard.test.tsx` — 移行 (後述「既存テストへの影響」)

**API (`apps/api`)**: **変更ゼロ**。better-auth 1.6.11 の apple provider は Web (Service ID) 経路を既に完全サポート済 (Leader 実測 + `@better-auth/core` コード確認済)。

**触らない**: `Features/Auth/AuthViewModel.swift` (VM の public API は不変)、`Core/Auth/*`、他タブ/画面、`.designs/20260716-ios-phase-e-settings-setup-gcal.md` (別 Architect が並行執筆中の設定タブ/Setup/GCal 一式)。

---

## 前提: 一次ソースで確定した規約

前回設計doc (`20260714-ios-login-auth-revamp.md`) の「Apple 純正ボタンはフォント変更不可 / 自前ボタンは審査リスク」は**誤り**。本 doc で是正済 (同 doc 側も置換済)。

### Apple HIG (`sign-in-with-apple`, 最終改訂 2022-09-14)

Architect が HIG JSON エンドポイントで原文取得・確認 (`knowledge/library/apple-developer-docs-json-endpoint.md`)。

| 項目 | 原文 | 帰結 |
|---|---|---|
| カスタムボタン | *"you can create a custom Sign in with Apple button... you may want to **align logos across multiple sign-in buttons**, or **adjust the button's font**, bezel, or background"* | 自前ボタン + フォント変更 = **明示的に許可** |
| 審査 | *"App Review evaluates all custom Sign in with Apple buttons."* | 審査対象になるのは事実 |
| タイトル (変更不可) | *"Titles. Use only Sign in with Apple, Sign up with Apple, or Continue with Apple."* | 3択のみ |
| **タイトル (日本語)** | ja-JP 版 HIG 原文: 「タイトル。「**Appleでサインイン**」、「**Appleでサインアップ**」、または「**Appleで続ける**」のみを使用すること。」 | **Apple 自身が日本語表記を規定**。「Appleで続ける」= 正式表記 (助詞前後にスペース無し) |
| 色 (変更不可) | *"Logo and title colors. Within a button, both items must be either black or white; don't use custom colors."* | ロゴ+タイトルは純黒か純白のみ |
| 形状 (変更不可) | *"Buttons that combine the logo with text are always rectangular"* | 矩形 |
| フォント (変更可) | *"Title font. You can also adjust the font's weight and size."* / *"**Prefer the system font** for the title"* | 変更可。ただし system font が推奨 |
| **bezel (変更可)** | *"Button bezel and shadow. For example, you can use a stroke to emphasize the button bezel"* | **stroke の色は非規制** (規制対象は logo と title の色のみ) |
| 角丸 (変更可) | *"Button corner radius. You can use a corner radius value that matches the other buttons in your UI."* | 任意 |
| **比率 (必須)** | *"Regardless of the font you choose, the title and button height... need to use the same proportions that the system uses... the title's font size would be **43% of the button's height**"* | 高さ44→**19pt** / 高さ56→**24pt** (HIG の実例画像 alt に明記。実測確認済) |
| ロゴ配置 | *"Match the height of the logo file to the height of the button." / "Don't crop the logo file." / "Don't add vertical padding."* | ロゴファイルは**ボタン全高**で配置 (padding はファイルに内包) |
| **ロゴ inset (許可)** | *"Inset the logo if necessary. If you need to **horizontally align the Apple logo with other authentication logos**, you can adjust the space between the logo and the button's leading edge."* | 他社ロゴとの左端揃えを**明示的に許可** |
| 右マージン | *"Ensure the margin measures at least 8% of the button's width."* | |
| 最小 | 140x30pt / 周囲マージン ≥ 高さの 1/10 | |
| 見た目3択 | white / white with an outline / black。*"The white outlined style... Use this style on white or light-color backgrounds"* / *"The white style... Use this style on dark backgrounds"* | |
| 並置 | *"Make a Sign in with Apple button no smaller than other sign-in buttons"* | 高さ同一なら充足 |

### Google Identity ブランド規約 (Last updated 2026-07-07)

| 項目 | 原文 / 実測 | 帰結 |
|---|---|---|
| G ロゴ | *"It must be the standard color version (the standard color gradient super G logo) and appear on a white background."* / *"Don't: Create your own icon... or use an outdated Google 'G'"* | 自前描画・旧フラット G は禁止 |
| テーマ | Light `#FFFFFF` / stroke `#747775` 1px inside / font `#1F1F1F` ・ Dark `#131314` / `#8E918F` / `#E3E3E3` ・ Neutral `#F2F2F2` / なし / `#1F1F1F` | この3択以外の色地に color G は禁止 |
| **文言 (ローカライズ)** | *"Localization of this text to match the language of your app or website is **permitted and encouraged**"* | 「Google で続ける」OK |
| フォント | *"The button font is Google Sans Medium."* / Color 表: `Google Sans Medium | 14/20` | 14px/line-height 20 |
| サイズ | *"You can scale the button as needed... but you must **preserve the aspect ratio so that the Google logo is not stretched**"* | 制約は**ロゴのアスペクト**。full-width 化は可 |
| padding (iOS, 実測) | 高さ44 / leading 16 / gap 12 / trailing 16 / ロゴ 20 | 下記 SVG 実測と完全一致 |
| 並置 | *"should be displayed at least as prominently as other third party sign-in options... approximately the same size and have similar visual weight"* | |
| 規約外利用 | *"Use of Google brands in ways not expressly covered by this document is not allowed without prior written consent"* | |

**公式 SVG 実測 (Architect 検証)**: `iOS/SVG/Light/Theme=Light, Show text=Yes, Shape=Square, Platform=iOS.svg` は `width="188" height="44"`、`fill="white"`、`stroke="#747775"`、G の mask が `x="16" y="12" width="20" height="20"` → **Google の iOS 仕様 (高さ44 / leading16 / ロゴ20 / 縦中央) が公式アートワーク自身で裏付けられる**。

### ★ Architect が新たに確定させた 2 点 (researcher の「不明」を解消)

**(1) Google Sans のライセンス = SIL OFL 1.1 (確定)**

researcher は「`google/fonts` repo に無く不明」としたが、**参照先 repo が違う**。3 つの独立した一次ソースで OFL を確認:

1. 公式 download manifest (`https://fonts.google.com/download/list?family=Google%20Sans`) に **`OFL.txt` が同梱** — *"This Font Software is licensed under the SIL Open Font License, Version 1.1."*
2. `https://fonts.google.com/metadata/fonts/Google+Sans` → `"license": "ofl", "isOpenSource": true`
3. **フォントバイナリ自身の name table ID 13** が同じ OFL 文言を保持 (`GoogleSans-Medium.ttf` を実 DL して fontTools で確認)

- copyright (name ID 0) = `Copyright 2025 The Google Sans Project Authors (github.com/googlefonts/googlesans)` — この upstream repo は現状 **404 (非公開)**。researcher が `google/fonts` に見つけられなかったのは正しい観測だが、**OFL の付与を否定しない**。
- **Reserved Font Name の宣言は無い** (copyright 行に `with Reserved Font Name` が無い) → **サブセット化して同名のまま再配布可**。
- ⇒ **Google Sans は合法的に同梱・埋め込み可能。「ライセンス不明だから使えない」という前提は消滅した。**

**(2) 公式ボタン画像は英語専用 = 日本語 UI では使用不可 (確定)**

規約は *"The SVG format also makes it possible for you to edit the Sign in with Google text to the language of your app or website"* と書くが、**現行バンドルの SVG のテキストはアウトライン化されたパスであり編集不可** (Architect 実測: `<text>` 要素 0 個 / `font-family` 属性 0 個 / テキストは `fill="#1F1F1F"` の単一 path `d` 長 13,128 文字)。PNG も同様にテキスト焼き込み済 (英語)。

⇒ **日本語ボタンを作る手段は「カスタムボタン」しか存在しない。** 設計ブリーフの選択肢 (a)「公式ボタン画像をそのまま使う」は、日本語アプリでは Apple/メールが日本語・Google だけ英語という**より深刻な不統一**を生むため成立しない。これが後述「不採用案」の根拠。

---

## UI/UX

### 統一の原理 — 何が揃えられ、何が原理的に揃わないか

**揃えられる (本設計で全て揃える)**: 高さ / 角丸 / 幅 / ロゴ枠サイズ / ロゴ左端 x / ラベル左端 x / 塗り (白系2) / stroke 色 / 縦の等間隔 / 日本語グリフのフォント。

**原理的に揃わない = ラベルのフォントサイズ** (証明):

- Apple: title = 高さ × **43%** (必須。高さ44→19pt)
- Google: 高さ44 のとき title = **14pt** (= 高さの 31.8%)
- 両者は**比率**で固定されるため、ボタン高さを何にしても **Apple の title は Google の約 1.36 倍**になる。
- 逃げ道の検証: Apple を14pt にすると高さ 14÷0.43 ≈ 33pt (最小30はクリア) だが、Google の44より小さくなり *"no smaller than other sign-in buttons"* に違反。Google を19pt にするには高さ ≈ 60pt が必要で、するとApple は 25.8pt になり循環。
- ⇒ **両社規約を守る限り、3ボタンのフォントサイズ統一は不可能。** 「統一」はフォントサイズ以外の全軸で達成する。

本設計は **ベンダー準拠 (19/14/17)** を既定とする。フォントサイズまで揃える案 (17/17/17) は Apple 比率からの逸脱を伴うため、**Leader へのエスカレーション事項 #1** として提示する (後述)。

### 共通ジオメトリ (iOS / Web 共通、light/dark 共通)

```
  ├─16─┤ ├──────20──────┤ ├─12─┤
  ┌────────────────────────────────────────────────┐
  │      [ logo 20 box ]      ラベル               │  高さ 44 / 角丸 10 / full-width
  └────────────────────────────────────────────────┘
  ↑ 左端                     ↑ x=48 (16+20+12)          trailing ≥ 16
```

- **高さ 44**: Apple HIG の実例値 (44/19) かつ Google の iOS リファレンス高 (44) かつ iOS 最小タップ領域 (44) の**三者が一致する唯一の値**。スケーリング・端数処理が一切不要になる。
- **角丸 10** (`Radius.sm` / `--radius-sm`): Apple は *"corner radius value that matches the other buttons in your UI"* を明示許可。Google のカスタムボタン節に角丸の規定は無い (公式画像の Square=4 / Pill は**提供画像の形状**であってカスタムボタンへの制約ではない)。
- **left-aligned** (ロゴもラベルも左揃え、中央寄せしない): 3ボタンのラベル幅が異なるため、中央寄せするとロゴ x 位置が3つバラバラになる。左揃えが「揃って見える」ための必須条件。Apple の HIG 実例画像は `left-aligned-correct-proportions-*.png` と命名されており左揃えを明示。Google の spec も本質的に左揃え。
- ボタン間 gap **12** (`Space.s3` / `--space-3`)。

### 3ボタン仕様 (数値は Developer 用の確定値)

| | Apple | Google | メール |
|---|---|---|---|
| ラベル | **「Appleで続ける」** | **「Google で続ける」** | 「メールで続ける」 |
| ラベル典拠 | ja-JP HIG の3択の1つ | 規約がローカライズを明示許可 | 自前 |
| 塗り (light/dark 共通) | `#FFFFFF` | `#FFFFFF` | accent gradient |
| stroke | `#747775` 1px inside | `#747775` 1px inside | なし |
| ラベル色 | `#000000` (純黒必須) | `#1F1F1F` | `textOnAccent` (#FFFFFF) |
| ラベル font size | **19** | **14** (line-height 20) | **17** |
| ラベル font family | アプリ既定 (iOS: `.atender(19,.semibold)` / Web: `var(--font-sans)`) | **Google Sans Medium** → JP は fallback | アプリ既定 |
| ラベル weight | semibold | Medium (500) | semibold |
| ロゴ | Apple 公式 black ロゴファイル | 公式 gradient super G | iOS: SF Symbol `envelope.fill` / Web: lucide `Mail` |
| ロゴ寸法 | ファイル高 = **44** (ボタン全高)。マーク実描画高 **20±1**、左端 x = **16±0.5** | 高さ20 / 幅 auto (実アスペクト 200:204 ≈ 0.98 → 約19.6) | 20x20 |

**塗りが light/dark で不変な理由 (重要)**: `#FFFFFF`/`#747775` は**ブランド固定値であってテーマトークンではない**。現行 iOS 実装は Google ボタンに `Color.bgElevated` (dynamic: light `#FFFFFF` / dark `#1A1F2A`) を使っており、**dark モードで color G が `#1A1F2A` の上に載る = Google 規約違反** (許容は Light/Dark/Neutral の3択のみ、かつ *"must appear on a white background"*)。本設計では Apple/Google ボタンに **テーマトークンを使わない**。

**Apple の stroke に `#747775` を使う根拠**: HIG が色を規制するのは *"Logo and title colors"* のみで、bezel は *"you can use a stroke to emphasize the button bezel"* と変更可。よって Google の Light テーマと**同一の stroke 色**を採れる。これにより Apple と Google のボタン外装が**ピクセル単位で同一**になる (Touri 決定「白系2 + accent1」の最大化)。

**Apple マークのサイズ選定**: 公式ロゴファイルは small/medium/large の3サイズがある (*"Logos are available in small, medium, and large sizes, so you can match logo sizes in all the sign-up buttons you display."*)。**マーク実描画高が 20±1pt になるものを Developer が選ぶ**。ファイル自体は高さ44で配置し (`Match the height of the logo file to the height of the button` / `Don't add vertical padding` / `Don't crop`)、ファイル内蔵の水平 padding 分を差し引いて**マーク左端が x=16 に来るよう leading offset を調整**する (HIG が *"Inset the logo if necessary"* で明示許可)。

### light / dark (テンション #2 の解)

| | light (`#F7F8FA` 背景) | dark (`#0B0E14` 背景) |
|---|---|---|
| Apple | 白 + `#747775` outline | **同一** (白 + outline) |
| Google | Light テーマ (白 + `#747775`) | **同一** (Light テーマのまま) |
| メール | accent gradient (light トークン) | accent gradient (dark トークン) |

- **Apple/Google のボタンは dark でも変えない。** 根拠: HIG の white-with-outline は *"Use this style on white or light-color backgrounds"*、white は *"Use this style on dark backgrounds"* — **どちらも塗りは白**で、差は outline の有無のみ。outline を dark でも残すことは HIG 上の禁止事項に当たらない (bezel は変更可)。Google の Light テーマ (白ボタン) は**ページ背景色に関する規定ではない**ため dark ページ上でも合法かつ *"G must appear on a white background"* を満たす。
- ⇒ **light/dark 両方で「白系2 + accent1」が保たれる** (Touri 決定1を dark でも維持)。Google の Dark テーマ (`#131314`) を dark モードで使うと「白1 + 黒1 + accent1」の3色になり決定1が崩れるため採らない。
- 逸脱記録: `ui-ux-design-perspectives.md` §4「prominent は1-2」からの逸脱 = 3ボタンが対等。理由 = 両社の並置規定 (*"at least as prominently"* / *"no smaller than"*) が事実上「対等」を要求するため。

### 画面レイアウト (iOS / Web 共通)

```
┌──────────────────────────────────┐
│                                  │
│          [logo-mark 56]          │
│          [wordmark 22]           │
│                                  │
│  下記のアカウントを使用してログイン  │   textSecondary / --text-base
│                                  │
│  ┌────────────────────────────┐  │
│  │ [] Appleで続ける           │  │  白+outline / h44 / r10
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ [G] Google で続ける         │  │  白+outline / h44 / r10
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │ [✉] メールで続ける          │  │  accent / h44 / r10
│  └────────────────────────────┘  │
│                                  │
│  ── メール展開時のみ ↓ ──         │
│  ┌────────────────────────────┐  │
│  │ email TextField (h44)       │  │
│  └────────────────────────────┘  │
│  ┌────────────────────────────┐  │
│  │  ログインリンクを送る        │  │  AtenderButton(primary) / Web: Button variant=primary
│  └────────────────────────────┘  │
│  メールを送信しました…(sent 時)    │
└──────────────────────────────────┘
```

- 縦中央寄せ。水平 padding `Space.s6`(24) / Web は `max-w-md mx-auto` + `px-6`。
- セクション間 `Space.s6`(24)、ボタン間 `Space.s3`(12)。
- 背景 `Color.bgBase` / `bg-bg-base`。
- Web の `PageTitle "Atender" / "Attendance for students"`・`Panel`・`または` divider・`based in tokyo/chiba` は**削除** (iOS 側の承認済 IA に合わせる)。

### iOS ⇄ Web 1:1 対応表

| # | 要素 | iOS | Web | 一致 |
|---|---|---|---|---|
| 1 | ロゴ mark 56 + wordmark 22 | `Image("logo-mark")` / `Image("wordmark")` | `/logo-mark.png` / `.wordmark-light`・`.wordmark-dark` | ✓ |
| 2 | 誘導文「下記のアカウントを使用してログイン」 | `Text` | `<p>` | ✓ |
| 3 | ボタン順 Apple → Google → メール | ✓ | ✓ | ✓ |
| 4 | 「Appleで続ける」 | ✓ | ✓ | ✓ |
| 5 | 「Google で続ける」 | ✓ | ✓ | ✓ |
| 6 | 「メールで続ける」 | ✓ | ✓ | ✓ |
| 7 | メール progressive disclosure (1段) | ✓ | ✓ (**新規**) | ✓ |
| 8 | 送信ボタン「ログインリンクを送る」/「再送する」 | ✓ | ✓ | ✓ |
| 9 | sent 文言「メールを送信しました。15 分以内にリンクを開いてください」 | ✓ | ✓ | ✓ |
| 10 | cooldown 60 秒 | ✓ | ✓ | ✓ |
| 11 | ジオメトリ h44/r10/leading16/gap12 | ✓ | ✓ | ✓ |
| 12 | エラー表示 | alert | inline `<p>` | **意図的差** (プラットフォーム慣習) |
| 13 | Apple 認証経路 | native `ASAuthorizationController` → idToken | Service ID → `/sign-in/social` リダイレクト | **意図的差** (後述) |
| 14 | Google 認証経路 | `ASWebAuthenticationSession` → native/callback | `/sign-in/social` リダイレクト | **意図的差** (既存) |

**注意 (Leader エスカレーション #2)**: `CLAUDE.md` は「iOS は Web の忠実移植。Web を正典とする」と定めるが、本設計は**ログイン画面に限り逆方向 (iOS → Web)** に揃える。理由は (1) 要望が「ログイン画面統一」であること、(2) iOS 側のミニマル IA は 2026-07-14 に Touri 承認済であること、(3) Web の現行 IA (email 常時開き + divider + Google のみ) に Apple を足すと iOS と別 IA のまま残ること。**規約の一時的反転にあたるため Leader の承認が要る。**

### 状態管理

- **iOS**: `AuthViewModel` (既存)。**public API は一切変更しない** (`emailPhase`/`isAppleLoading`/`isGoogleLoading`/`isSendingLink`/`cooldownActive`/`errorMessage`/`canSendLink`/`openEmail()`/`tapApple()`/`tapGoogle()`/`sendLink()`/`dismissError()`)。よって `AuthViewModelTests.swift` は**無改修で GREEN のまま**。View 側の Apple 経路だけ、`SignInWithAppleButton` から `ASAuthorizationController` の明示起動に変わる。
- **Web**: `SignIn.tsx` のローカル state。

```ts
// SignIn.tsx が持つ state (iOS AuthViewModel と 1:1)
type EmailPhase = "collapsed" | "editing" | "sent";
const [emailPhase, setEmailPhase] = useState<EmailPhase>("collapsed");
const [email, setEmail] = useState("");
const [sending, setSending] = useState(false);
const [cooldown, setCooldown] = useState(false);
const [loadingProvider, setLoadingProvider] = useState<"apple" | "google" | null>(null);
const [error, setError] = useState<string | null>(null);
const canSendLink = email !== "" && !sending && !cooldown;
```

### §7 UI/UX チェック観点

1. **視覚階層**: L0 ロゴ / L1 3ボタン (対等) / L2 誘導文 / L3 sent・error。
2. **タスク頻度**: 1タスク。provider 2種を上、メールは 1タップ展開 (§6 progressive disclosure 1段)。
3. **token 参照**: メールボタンと余白は既存トークン。**Apple/Google の塗り・stroke・ラベル色・font size のみブランド固定値** (トークン化しない — テーマで動くと規約違反になるため)。この逸脱理由を `AuthProviderButton` にコメントで残す。
4. **状態網羅**: 下記「挙動仕様」。
5. **アクセシビリティ**: 高さ44 = 最小タップ領域。`#1F1F1F` on `#FFFFFF` = 15.3:1、`#000000` on `#FFFFFF` = 21:1、いずれも AA 超。email 入力は `keyboardType(.emailAddress)`/`textContentType(.emailAddress)`/`autocapitalization(.never)` / Web は `type="email" autoComplete="email"`。
6. **dark 対応**: 上表のとおり (Apple/Google は不変、メールのみトークン追従)。
7. **ナビ構造**: 1画面。タブ増設なし。
8. **数値逸脱**: 高さ 44 (初期値どおり) / 3ボタン対等 (§4 逸脱、理由は上記)。

---

## アセット入手手順と配置

すべて認証不要・Architect が実 DL して検証済。

### 1. Google G ロゴ

```sh
curl -sL "https://developers.google.com/identity/images/g-logo.png" -o g-logo.png
# 200 / 33,661 bytes / 200x204 / 透過 / gradient super G
```

**検証済**: このファイルは `signin-assets.zip` の公式ボタン内の G と**同一世代**。Architect が両者の同一角度サンプルを比較し全周で一致を確認 (例 180°: (17,188,95) vs (14,188,95)、270°: (255,208,16) vs (255,209,15)、いずれも連続グラデーション = gradient super G)。**旧フラット4色 G ではない**。

- 配置: iOS `Atender/Assets.xcassets/google-g.imageset/google-g.png` (**既存のグレー四角 3枚を削除して差し替え**) / Web `apps/web/public/google-g.png`
- **iOS imageset は Single-Scale (universal, scale キー無し) にする**。200x204 は正方でないため 20x20 に丸めると 2% 歪む (規約 *"must preserve the aspect ratio"* 違反)。Single-Scale + `.resizable().scaledToFit().frame(width:20,height:20)` なら 200px ソースから各解像度へアスペクト維持で縮小され、歪みゼロ。

```json
// google-g.imageset/Contents.json
{ "images": [ { "filename": "google-g.png", "idiom": "universal" } ],
  "info": { "author": "xcode", "version": 1 } }
```

- Web: `<img src="/google-g.png" alt="" className="h-5 w-auto" />` (高さ20px・幅 auto でアスペクト維持)

### 2. Apple ロゴ

```sh
curl -sL "https://devimages-cdn.apple.com/design/resources/download/Logo-Sign-in-with-Apple.dmg" -o siwa.dmg
hdiutil attach siwa.dmg -nobrowse -readonly -mountpoint ./siwamnt
```

- 中身は PNG (@1x/@2x/@3x) + PDF + SVG、**black / white 各 small/medium/large**。PNG は高さ44 用 (= 本設計のボタン高と一致するのでそのまま使える)。
- 使うのは **black のみ** (light/dark とも白ボタン + 黒ロゴのため)。
- 配置: iOS `Assets.xcassets/apple-logo.imageset/` (@1x/@2x/@3x の black PNG) / Web `public/apple-logo-black.svg` (SVG を使えば任意高さ可)
- **選定基準**: マーク実描画高が **20±1pt** になる size (small/medium/large のいずれか) を選ぶ。ファイルは高さ44 で配置し、マーク左端が **x=16±0.5pt** に来るよう leading offset を調整する。
- ※ Architect は本環境で dmg を mount できなかった (`hdiutil: attach canceled`) ため、**各ファイルの正確な寸法は未検証**。Developer が mount して実測し、上記の受け入れ基準 (マーク高20±1 / 左端16±0.5) を満たす size を選ぶこと。

### 3. Google Sans Medium (Latin サブセット)

```sh
# 静的 Medium を取得 (1,976,412 bytes / 7,424 glyphs / PostScript名 GoogleSans-Medium)
curl -sL "https://fonts.gstatic.com/s/googlesans/v69/4Ua_rENHsxJlGDuGo1OIlJfC6l_24rlCK1Yo_Iqcsih3SAyH6cAwhX9RFD48TE63OOYKtrw2IKlirSjiEjo5.ttf" -o GoogleSans-Medium.ttf

# Latin サブセット化 (Architect 実行検証済 → 49,204 bytes / 389 glyphs / PostScript名と OFL 表記を保持)
python3 -m fontTools.subset GoogleSans-Medium.ttf \
  --unicodes="U+0020-007E" \
  --output-file=GoogleSans-Medium-Latin.ttf \
  --name-IDs="*" --name-legacy --layout-features="*"
```

- 全部入りは 1.98MB (devanagari 等 25 サブセット込み) で iOS に載せるには過大。ラベルで使う Latin は「Google」のみなので **U+0020–007E で 48KB に縮む**。
- `--name-IDs="*"` は必須 — **name ID 13 (OFL 表記) を保持**するため (OFL がライセンス表記の同梱を要求)。PostScript 名 `GoogleSans-Medium` も維持される。
- **Reserved Font Name の宣言が無い**ため、サブセット後も同名で再配布可。
- 配置: `apps/ios/Atender/Resources/Fonts/GoogleSans-Medium-Latin.ttf` + **`OFL.txt` を同ディレクトリに併置** (OFL 準拠)。
- **Web はフォントファイルを repo に置かない**。既存の Google Fonts link に足すだけ (`index.html`):

```html
<!-- 既存 -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />
<!-- 変更後: Google+Sans:wght@500 を追加 -->
<link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@500&family=Inter:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

CSS2 API は unicode-range でサブセット分割配信するので、**ブラウザは latin サブセットのみ (数十KB) を取得**する。

### 4. ★ Google Sans に日本語グリフは無い (設計上の重要事実)

`https://fonts.google.com/metadata/fonts/Google+Sans` の `coverage` に **`japanese` / CJK サブセットは存在しない** (armenian, bengali, cyrillic, devanagari, greek, latin, thai … のみ)。

⇒ 「Google で続ける」のうち **Google Sans で描かれるのは Latin の "Google" だけ**で、「で続ける」は fallback フォント (Web: Noto Sans JP / iOS: システム日本語書体) で描かれる。**3ボタンとも日本語グリフは同一フォントになる**ため、フォント family の差は実質「Apple/メールの `Apple`・`メール` 部分 vs Google の `Google` 部分」に限定される。これがフォント family 統一という要望を、規約を破らずに実質達成できる理由。

- iOS の font stack: `Font.custom("GoogleSans-Medium", size: 14)` → Latin のみ解決、JP はシステム fallback。
- Web の font stack: `font-family: "Google Sans", var(--font-sans)` → Latin は Google Sans、JP は Noto Sans JP。

### 5. iOS の `UIAppFonts` 登録 (★ 既存バグに注意)

`Atender/Info.plist` に `UIAppFonts` を新規追加する:

```xml
<key>UIAppFonts</key>
<array>
    <string>Resources/Fonts/GoogleSans-Medium-Latin.ttf</string>
</array>
```

**★ Leader エスカレーション #3 (スコープ外の既存バグ)**: 現状 `Info.plist` にも `project.yml` にも **`UIAppFonts` キーが存在せず**、Swift 側にも `CTFontManagerRegisterFontsForURL` 相当の実行時登録が**無い** (Architect が `apps/ios` 全体を grep して確認)。`Atender/Resources/Fonts/` に Inter 5 種 + NotoSansJP がバンドルされ、`Typography.swift` が `Font.custom("Inter-SemiBold", …)` を呼んでいるが、**未登録フォント名は SwiftUI が黙ってシステムフォント (SF Pro) にフォールバックする**。⇒ **iOS アプリは現在アプリ全体で Inter ではなく SF Pro で描画されている可能性が高い。**

- 本設計はこれを**修正しない** (ログイン画面に限らずアプリ全画面の見た目が変わる横断的変更のため、この feature に紛れ込ませてはいけない)。
- 本設計への影響: iOS の Apple/メールボタンのラベルは実際には SF Pro で描かれる。**これは Apple HIG の *"Prefer the system font"* をむしろ満たす**ため、本 feature は現状のままで規約上の問題は無い。
- Developer は **Google Sans の登録だけ**を追加すること (Inter を同時に登録すると全画面の描画が変わり、本 feature の差分に無関係な回帰を持ち込む)。
- Touri が Inter を効かせたい場合は**別 feature** として起票する。

---

## データモデル / 型

DB スキーマ変更なし。API 変更なし。

### Web: 新規コンポーネントの公開 prop 契約

```tsx
// apps/web/src/components/ui/AuthProviderButton.tsx
export type AuthProviderKind = "apple" | "google" | "email";

export type AuthProviderButtonProps = {
  kind: AuthProviderKind;      // アイコン・塗り・stroke・ラベル色・font を決定
  label: string;               // アクセシブル名になる
  onClick: () => void;
  loading?: boolean;           // 既定 false。true で spinner 表示 + disabled
  disabled?: boolean;          // 既定 false
};

export function AuthProviderButton(props: AuthProviderButtonProps): JSX.Element;
```

- `<button type="button">` を描画。アクセシブル名は `label` (アイコンは `alt=""` / `aria-hidden`)。
- `loading` が true のとき `aria-busy="true"` かつ `disabled`。
- `disabled || loading` のとき `disabled` 属性が付く。

### iOS: 新規コンポーネントの公開 API

```swift
// Atender/Core/DesignSystem/Components/AuthProviderButton.swift
struct AuthProviderButton: View {
    enum Kind: Equatable { case apple, google, email }

    let kind: Kind
    let title: String
    var isLoading: Bool = false
    var isEnabled: Bool = true
    let action: () -> Void
}
```

- `kind` がアイコン・塗り・stroke・ラベル色・フォントを決定 (ブランド規約を1箇所に閉じ込める)。
- 高さ `44` 固定、角丸 `Radius.sm`、full-width、left-aligned。
- `isLoading` で `ProgressView`、`isEnabled == false` で `opacity 0.52` + `disabled`。
- **メール展開後の送信ボタンは `AuthProviderButton` を使わず既存 `AtenderButton(title:variant:.primary)` を使う** (provider ボタンではないため)。

---

## API / 関数シグネチャ

### Web: social sign-in (Google / Apple 共通化)

現行 `googleSignIn()` を provider 引数化する。**better-auth client ライブラリは使わず、既存の raw fetch 方式を踏襲**する (現行 `SignIn.tsx` の慣習)。

```ts
// apps/web/src/routes/SignIn.tsx 内
async function socialSignIn(provider: "google" | "apple"): Promise<void> {
  setError(null);
  setLoadingProvider(provider);
  try {
    const res = await fetch(`${API_URL}/api/auth/sign-in/social`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, callbackURL: `${APP_URL}/` }),
    });
    if (!res.ok) throw new Error("social sign-in failed");
    const data = (await res.json()) as { url?: string; redirect?: boolean };
    if (!data.url) throw new Error("no redirect url");
    window.location.href = data.url;
  } catch {
    setLoadingProvider(null);
    setError(provider === "apple" ? "Apple ログインを開始できませんでした" : "Google ログインを開始できませんでした");
  }
}
```

**Web の Apple 経路が iOS と別物である理由 (テンション #3)**:

| | iOS | Web |
|---|---|---|
| 経路 | native `ASAuthorizationController` → **idToken** を取得 → `POST /sign-in/social {provider:"apple", idToken:{token}}` | **Service ID** (`net.appily.atender.signin`) で `POST /sign-in/social {provider:"apple", callbackURL}` → `{url}` → `appleid.apple.com` へ遷移 → `form_post` で `/api/auth/callback/apple` に戻る |
| 検証 audience | `appBundleIdentifier` = `net.appily.atender` | `clientId` = Service ID |
| API 変更 | 不要 (実装済) | **不要** |

better-auth 1.6.11 は `responseMode: "form_post"` + `responseType: "code id_token"` を送出し、`/callback/:id` が `method: ["GET","POST"]` で POST を同 URL の GET へ 302 する。これにより SameSite=Lax の state cookie がクロスサイト POST で落ちる問題を回避済。**フロントにボタンと上記呼び出しを足すだけで通る。**

### iOS: Apple 認証の起動 (純正ボタン廃止に伴う変更)

`SignInWithAppleButton` (SwiftUI) を廃し、`AuthProviderButton(kind: .apple)` のタップで `ASAuthorizationController` を明示起動する。**`AuthStore` / `AuthViewModel` は無変更**。

```swift
// AuthView.swift 内の helper (新規)。既存 AppleSignIn.makeRequest / identityToken(from:) を再利用
@MainActor
final class AppleSignInPresenter: NSObject, ASAuthorizationControllerDelegate,
                                  ASAuthorizationControllerPresentationContextProviding {
    func requestIdentityToken() async throws -> String
    // ASAuthorizationAppleIDProvider().createRequest() に AppleSignIn.makeRequest(_:) を適用し、
    // ASAuthorizationController を performRequests()。delegate コールバックを
    // withCheckedThrowingContinuation でブリッジし、AppleSignIn.identityToken(from:) を返す。
    // presentationAnchor は接続中の UIWindowScene の keyWindow を返す。
}
```

- `AuthViewModel` の `signInApple` クロージャは `{ let token = try await presenter.requestIdentityToken(); try await authStore.signInWithApple(idToken: token) }` になる (現行の `AppleResultBox` 経由は不要になり削除)。
- ユーザーがキャンセルした場合 (`ASAuthorizationError.canceled`) は **`errorMessage` を出さずに握りつぶす** (下記 F 系仕様)。

---

## 挙動仕様 (Reviewer テスト生成の根拠)

### W. Web `SignIn.tsx` (Vitest + Testing Library + msw)

**初期表示**
- **W1** `/signin` 初期表示で、アクセシブル名が「Appleで続ける」「Google で続ける」「メールで続ける」の button が **3つとも存在する**。
- **W2** 初期表示で **DOM 上のボタン順が Apple → Google → メール**。
- **W3** 初期表示で email の textbox は **存在しない** (collapsed)。
- **W4** 初期表示で「ログインリンクを送る」button は **存在しない**。
- **W5** 初期表示で「下記のアカウントを使用してログイン」が表示される。
- **W6** 旧 UI の残骸が**存在しない**: 文字列 `"G　Google でサインイン"`、`"Attendance for students"`、`"based in tokyo/chiba"`、`"または"` のいずれも DOM に無い。

**メール展開**
- **W7** 「メールで続ける」click → email textbox が出現し、「ログインリンクを送る」button が出現する。
- **W8** email 空のとき「ログインリンクを送る」は `disabled`。
- **W9** email 入力後は `enabled`。
- **W10** click → `POST /api/auth/sign-in/magic-link` が body `{email, callbackURL}` で1回呼ばれる (`callbackURL` は `APP_URL` 起点)。
- **W11** 送信成功 → 「メールを送信しました。15 分以内にリンクを開いてください」が表示され、ボタン名が「再送する」になる。
- **W12** 送信成功後 60 秒未満は「再送する」が `disabled`、60,000ms 経過後 `enabled` (fake timers)。
- **W13** 送信失敗 (500) → 「メールを送信できませんでした」が表示され、`emailPhase` は sent にならず (ボタン名は「ログインリンクを送る」のまま)、cooldown も張られない (ボタンは `enabled`)。

**Google**
- **W14** 「Google で続ける」click → `POST /api/auth/sign-in/social` が body `{provider:"google", callbackURL}` で1回呼ばれる。
- **W15** 応答 `{url:"https://accounts.google.com/..."}` → `window.location.href` にその URL が代入される。
- **W16** 応答が 500 → 「Google ログインを開始できませんでした」が表示され、`window.location.href` は変化しない。
- **W17** 応答が 200 だが `url` 欠落 → W16 と同じ。

**Apple (新規)**
- **W18** 「Appleで続ける」click → `POST /api/auth/sign-in/social` が body **`{provider:"apple", callbackURL}`** で1回呼ばれる。
- **W19** 応答 `{url:"https://appleid.apple.com/auth/authorize?..."}` → `window.location.href` にその URL が代入される。
- **W20** 応答が 500 → 「Apple ログインを開始できませんでした」が表示され、`window.location.href` は変化しない。
- **W21** 応答が 200 だが `url` 欠落 → W20 と同じ。
- **W22** Apple の click は magic-link endpoint を**呼ばない** (誤配線検出)。

### C. Web `AuthProviderButton` コンポーネント単体

- **C1** `kind="google"` で render → `<img>` の `src` が `/google-g.png` を含む。
- **C2** `kind="apple"` で render → Apple ロゴ画像が描画される (`src` が `apple-logo` を含む)。
- **C3** `kind` に関わらず、button のアクセシブル名は `label` と等しい (ロゴ画像は名前に混ざらない = `alt=""`)。
- **C4** `loading: true` → `disabled` かつ `aria-busy="true"`。
- **C5** `disabled: true` → `disabled` 属性が付き、click しても `onClick` が呼ばれない。
- **C6** 既定 (`loading`/`disabled` 未指定) → `enabled`、click で `onClick` が1回呼ばれる。

### F. iOS `AuthViewModel` (XCTest、既存テスト維持)

**public API 不変のため `AuthViewModelTests.swift` の既存 F1–F9 はそのまま GREEN であること**が要件 (回帰検出)。追加:

- **F10** `tapApple()` が `ASAuthorizationError.canceled` 相当のエラーで失敗したとき、`errorMessage` は **nil のまま** (ユーザーキャンセルをエラー表示しない)、`isAppleLoading == false`。
- **F11** `tapApple()` がそれ以外のエラーで失敗したとき、`errorMessage != nil`、`isAppleLoading == false`。

※ F10/F11 は `signInApple` クロージャに任意の `Error` を注入して検証する (VM は注入されたクロージャの throw を扱うだけなので `ASAuthorizationError` の実体は不要)。VM 側でキャンセル判定を行うため、**`AuthViewModel` に `isCancellation: (Error) -> Bool` を注入するのではなく、View 側の `signInApple` クロージャがキャンセル時に throw せず正常 return する**方式を採る。この場合 F10 は「`signInApple` が正常 return → `errorMessage == nil` かつ `isAppleLoading == false`」に読み替える (= 既存 F7 の成功系と同一)。**Developer はキャンセル判定を View 側 helper (`AppleSignInPresenter`) に置くこと。**

### V. 視覚仕様 (XCTest/Vitest では検証不能 → Reviewer は目視 or スクショで確認)

- **V1** iOS light/dark とも Apple/Google ボタンが `#FFFFFF` 塗り + `#747775` stroke で、**dark でも白のまま**。
- **V2** 3ボタンのロゴ左端 x が一致 (16pt)、ラベル左端 x が一致 (48pt)。
- **V3** Google の G が**グレー四角ではなく実際の 4 色 gradient G** で描画される (現行バグの直接検証)。
- **V4** Apple マークの実描画高が 20±1pt、Google の G の実描画高が 20pt。
- **V5** Web/iOS でボタン高さ 44・角丸 10・ボタン間 12。

iOS は `AtenderUITests/ScreenshotFlow.swift` (既存ハーネス) にログイン画面を追加して収集可。Web は chrome-devtools MCP でスクショ取得可 (`Muraki/knowledge/tool-quirk/chrome-for-testing.md`)。

### P. 本番でしか検証できない項目 (単体テスト対象外 → 手動チェックリスト)

- **P1** Web 本番 (`https://atender.appily.run`) で「Appleで続ける」→ Apple の認証画面 → 戻って `.signedIn`。
- **P2** Apple の private relay (`Hide My Email`) を選んだユーザーに Magic Link / お知らせメールが**届く** (bounce しない)。
- **P3** iOS 実機で Apple / Google / メールの 3 経路が通る (前回設計 G1–G3 の再確認)。

---

## テスト基盤

- **Web**: Vitest 2 + jsdom + `@testing-library/react` + msw。設定 `apps/web/vitest.config.ts` (`environment: "jsdom"`, `setupFiles: ["./tests/setup.ts"]`, `globals: true`, alias `@` → `src`)。
  - `tests/routes/SignIn.test.tsx` (既存を全面書き換え) — W 系
  - `tests/components/AuthProviderButton.test.tsx` (新規) — C 系
  - msw handler は `tests/msw/handlers.ts` の `API_URL` (`http://localhost:3000`) を使う。`server.use(http.post(...))` で個別上書きする既存パターンを踏襲。
  - `window.location.href` の代入検証は jsdom の `Not implemented: navigation` を避けるため、`tests/setup.ts` の console.error スロー機構に抵触しないよう **`window.location` を `vi.stubGlobal` / `Object.defineProperty` で差し替えて代入値を捕捉**すること (既存 setup が `Not implemented: navigation` を無視リストに入れているが、代入値の assert には差し替えが要る)。
- **iOS**: XCTest (`apps/ios/AtenderTests/`)、`xcodebuild test -scheme Atender`。
  - `AuthViewModelTests.swift` (既存) — F 系。**public API 不変なので無改修で通ること自体が回帰テスト**。
- **API**: **変更なし = 新規テスト不要**。既存 Vitest スイートが GREEN のままであること。

### ★ ベースライン (CLAUDE.md「ベースライン失敗の台帳」)

`.knowledge/known-failures.md` には **API と iOS の節しか無く、Web (apps/web) の節が存在しない**。本 feature は Web を触るため、**Reviewer は着手時に `apps/web` の Vitest 全体を棚卸しし、Web 節を台帳に新設すること**。未分類を残したままのマージは不可。

**Architect が静的読解で特定した既存の失敗 (要 Reviewer 確認)**:

- `tests/routes/SignIn.test.tsx > offers Google sign-in with the API callback URL` (66–77行) は**現行実装に対して必ず失敗する**。現行 Google ボタンは `<button>` (href 属性を持たない) なので `google.closest("a") ?? google` → button、`getAttribute("href")` → `null` → `?? ""` → `expect("").toContain("/api/auth/sign-in/social/google")` が失敗する。**分類: テスト陳腐化** (実装が POST fetch 方式に変わったのにテストが link 方式の想定のまま)。本設計の W14/W15 が置換する。
- ※ Architect の実行環境では `apps/web` の Vitest が起動後ハングして完走しなかった (sandbox 有無いずれも)。**上記は静的読解による判断であり、Reviewer が実行して確認すること。**

### 既存テストへの影響 (移行リスト — grep で機械的に洗い出し済)

`grep -rn "login|ログインリンク|再送|Attendance for students|based in tokyo|メールアドレス|サインイン" apps/web/tests/` の結果:

| ファイル:行 | 現状 | 本設計での扱い |
|---|---|---|
| `tests/routes/SignIn.test.tsx:14,28,41,54,56` | 「ログインリンクを送る」が**初期表示から存在する**前提 | **要変更**。progressive disclosure により初期は collapsed。W7 で「メールで続ける」click 後に出現 |
| `tests/routes/SignIn.test.tsx:70-71` | Google ボタンを `/Google.*サインイン/` で探し href を assert | **要変更** (上記の陳腐化)。W14/W15 に置換 |
| `tests/routes/Guard.test.tsx:19` | 「/login にリダイレクトされた」ことの確認に**「ログインリンクを送る」button の存在**を使用 | **★要変更**。collapsed では存在しない。**「メールで続ける」button の存在に差し替える** (常に表示されるため安定アンカー) |
| `tests/routes/Settings.test.tsx:106` | path のみ assert | 影響なし |
| `tests/routes/Verify.test.tsx:53` | href のみ assert | 影響なし |

`apps/ios/AtenderTests/` は `AuthViewModelTests.swift` が VM の public API のみに依存しており、**本設計では VM を変更しないため影響なし**。

---

## 運用手順 (Touri が portal で作業)

### 1. Apple Service ID の Return URL — **登録済 (作業不要)**

Leader が実測プローブで確認済:
- `https://appleid.apple.com/auth/authorize?client_id=net.appily.atender.signin&redirect_uri=https://atender-api.appily.run/api/auth/callback/apple&response_type=code%20id_token&response_mode=form_post` → **HTTP 200 + 本物の "Sign in to Apple Account" ページ**
- 対照群 `redirect_uri=https://evil.example.com/cb` → **HTTP 403**

⇒ Return URL は Apple ポータルに登録済・ドメイン検証も通過済。HIG の *"you must have an existing app in the App Store that uses Sign in with Apple"* という懸念も、この実測 200 により**実務上解消**している。

### 2. ★ Private Email Relay の email source 登録 (未対応 = 要作業)

**前回設計doc にも既存 knowledge にも記載が無く、放置すると Apple ユーザーへのメールが bounce する。**

Apple ユーザーが `Hide My Email` を選ぶと、アカウントの email は `xxxx@privaterelay.appleid.com` になる。**このアドレス宛のメールは、送信元ドメインを Apple に "email source" として登録し SPF/DKIM を通していないと Apple 側で拒否される。** Atender は Magic Link を Resend で送るため、**iOS/Web 両方で確実に踏む**。

手順:
1. Apple Developer Portal → Certificates, Identifiers & Profiles → **More** → **Configure Sign in with Apple for Email Communication**
2. Email Sources に **本番 `RESEND_FROM` のドメイン** と送信元アドレスを登録
3. SPF を Apple の要求どおり設定し、Apple 側で **Verify** を通す (DKIM も Resend 側で設定済であること)
4. 上限: Individual アカウントは **32 sources** まで

**★ Leader エスカレーション #4**: `apps/api/.env` (dev) の `RESEND_FROM` は **`Atender <onboarding@resend.dev>`** で、`tests/setup.ts` の既定は `Atender <noreply@atender.appily.run>`。**本番 Coolify の `RESEND_FROM` 実値は Architect 未確認**。もし本番が `onboarding@resend.dev` のままなら **`resend.dev` は自社ドメインでないため Apple に email source として登録できず、P2 は原理的に達成不可**。→ 本番 `RESEND_FROM` を**自社ドメイン (`atender.appily.run` 等) の検証済アドレスに切り替える**必要がある。Leader が本番 env を確認すること。

### 3. env / デプロイ

- **API の env 変更・コード変更は無し**。`APPLE_CLIENT_ID` (Service ID) / `APPLE_APP_BUNDLE_ID` / `APPLE_TEAM_ID` / `APPLE_KEY_ID` / `APPLE_PRIVATE_KEY` は投入済 (Leader 確認済)。
- Web のみ再デプロイ (`atender-web` uuid `y1acaktqgsx66sj81qsxn5m3`)。

### 4. ★ localhost で Web Apple を検証できない問題 (テンション #4)

Apple の認可 endpoint は *"redirect_uri: ... must use the HTTPS protocol, include a domain name, **can't be an IP address or localhost**"*。よって `http://localhost:5173` からの Apple ログインは**原理的に不可**。

本設計の対処 (トンネルや追加 Return URL 登録を**使わない**):

1. **ローカルで検証するのは「アプリ側の契約」まで** — W18–W22 が msw で `POST /sign-in/social {provider:"apple"}` の**リクエスト形と リダイレクト実行**を決定的に検証する。ここが本 feature の Web 側実装の全てであり、100% ローカルで再現可能。
2. **Apple との実ラウンドトリップは本番でのみ検証** — P1 として手動チェックリスト化。API 側は無変更 + Leader の実測プローブで Apple 側の受け入れが確認済なので、ローカルで検証できない残余リスクは「ボタンが正しい URL へ飛ばすか」だけであり、それは 1 で潰れている。
3. **dev で Apple ボタンを隠さない** — 隠すと iOS/Web の IA が dev と prod で食い違い、W1/W2 の 1:1 が壊れる。dev でクリックすると Apple 側で `invalid_request` になるが、これは**期待挙動**として本 doc に記録する。

---

## Leader へのエスカレーション事項

1. **★ フォントサイズの統一 (プロダクト判断)** — 上記「統一の原理」で証明したとおり、**両社規約を守る限り 3 ボタンのフォントサイズ統一は不可能**。本設計の既定は**ベンダー準拠 = Apple 19 / Google 14 / メール 17**。Touri が「サイズまで揃わないと『統一』ではない」と判断する場合の代替は **17/17/17** で、その場合 Apple が 17/44 = 38.6% となり HIG の *"need to use the same proportions"* (43%) から逸脱する (App Review はカスタム SIWA ボタンを評価対象にすると明記)。**変更する場合の差分は「Apple のラベル 19→17」「Google のラベル 14→17」の 2 箇所のみ**。どちらを採るか Touri の裁定を仰ぐ。
2. **★ Web の IA を iOS に合わせる (規約の一時的反転)** — `CLAUDE.md`「iOS は Web の忠実移植・Web が正典」に対し、本設計はログイン画面に限り **iOS → Web** に揃える。承認が要る。
3. **★ iOS の `UIAppFonts` 欠落 (スコープ外の既存バグ)** — アプリ全体で Inter が適用されておらず SF Pro で描画されている可能性が高い。本 feature では**直さない**。別 feature として起票するか要判断。
4. **★ 本番 `RESEND_FROM` が `resend.dev` の場合、Private Email Relay 対応が不可能** — 本番 env の確認と、必要なら自社ドメインへの切り替えが要る。
5. **public repo へのアセット同梱** — Touri 決定 #3 は **Google アセット**についての判断。**Apple ロゴ (Apple Design Resources) の public repo 同梱可否は別問題**で、Architect は Apple Design Resources の再配布条項を一次ソースで確認できていない (dmg を mount できず、利用規約本文も未取得) = **不明**。Google Sans は **OFL により再配布が明示的に許可**されているため問題なし (OFL.txt 併置が条件)。`g-logo.png` はブランドアセットで再配布の明文が無い点は Touri 決定 #3 のとおりリスク受容。

---

## 不採用案

- **(a) Google 公式ボタン画像 (テキスト焼き込み済) をそのまま使う**: **日本語アプリでは成立しない。** 公式 PNG/SVG のテキストは英語で、SVG も `<text>` 要素ではなく**アウトライン化パス** (Architect 実測: `<text>` 0個、テキストは単一 path の `d` 13,128 文字) なので日本語に差し替えられない。採用すると Apple/メールが日本語・Google だけ「Sign in with Google」となり、Touri の要望と正面から衝突する。規約自身が *"Localization ... is permitted and encouraged"* と localize を推奨している以上、カスタムボタンが規約の想定する正道。→ **カスタムボタン採用**。
- **(b) カスタムボタン + Inter (Google Sans を使わない)**: ライセンス不明を理由に Google Sans を避ける案だったが、**Google Sans は SIL OFL 1.1 と確定した** (OFL.txt 同梱 / metadata `license: ofl` / フォント name table ID 13 の 3 系統で確認)。避ける理由が消滅し、規約が *"The button font is Google Sans Medium"* と明示する以上、使わない選択は規約外利用 (*"not expressly covered ... is not allowed"*) に当たる。コストも Web は既存 Google Fonts link に 1 語追加、iOS は 48KB のサブセットのみ。→ **Google Sans 採用**。
- **(c) 3ボタンすべてを Google Sans にしてフォント family を完全統一**: Apple はフォント変更を許可しているので規約違反ではないが、**Apple のボタンに Google のブランド書体を載せる**ことになり、HIG の *"Prefer the system font"* に反する。加えて Google Sans に日本語グリフが無いため、統一されるのは「Apple」「Google」という Latin 語のみで、**得られる統一感はほぼゼロ**。→ 不採用。
- **(d) dark モードで Google の Dark テーマ (`#131314`) を使う**: 規約上は合法だが、Apple (白) + Google (黒) + メール (accent) の **3 色**になり、Touri 決定1「白系2 + accent1」が dark で崩れる。Google の Light テーマは**ページ背景ではなくボタン自身の塗り**の規定なので、dark ページ上の白ボタンは合法かつ *"G must appear on a white background"* も満たす。→ **両テーマとも Light 固定**。
- **(e) Apple ボタンに `Color.bgElevated` / `Color.borderDefault` (テーマトークン) を使う**: 現行 iOS 実装がこれで、**dark モードで Google の G が `#1A1F2A` の上に載り規約違反**になる (許容は Light/Dark/Neutral の3択のみ)。ブランド固定値はトークン化してはいけない。→ **リテラル値 + コメントで逸脱理由を明記**。
- **(f) Apple 純正 `SignInWithAppleButton` を維持**: 前回設計の選択だが、純正ボタンは**フォント・ジオメトリ・stroke をアプリ側で制御できない**ため、Google ボタンと外装を揃えられず「バラバラ」が残る。HIG はカスタムボタンを明示的に許可しており (*"align logos across multiple sign-in buttons"* という動機まで例示)、審査対象になること以外のリスクは無い。→ **カスタムボタン採用**。
- **(g) iOS に Google Sans フル ttf (1.98MB) を同梱**: Latin しか使わないのに 25 サブセット分を積むのは無駄。OFL は Reserved Font Name を宣言していないためサブセット化して同名再配布が可能で、48KB に収まる。→ **Latin サブセット採用**。
- **(h) `g-logo.png` を 20x20 に固定リサイズ**: 実寸 200x204 (アスペクト 0.98) を正方に潰すと 2% 歪み、*"you must preserve the aspect ratio so that the Google logo is not stretched"* に違反する。→ **高さ 20 / 幅 auto (Single-Scale imageset + `scaledToFit`)**。
- **(i) Web Apple を検証するために ngrok/cloudflared トンネル + Return URL 追加登録**: Apple の Return URL は Individual アカウントで 10 本上限、かつドメイン検証が要る。トンネルの URL は起動ごとに変わるため運用不能。ボタンの契約は msw でローカル検証でき、実ラウンドトリップは本番で 1 回確認すれば足りる。→ **msw + 本番手動検証**。
- **(j) Web で better-auth client (`better-auth/react` の `signIn.social`) を使う**: `apps/web` は依存に `better-auth` を持つが、現行 `SignIn.tsx` は raw fetch で統一されている。client を混ぜると Google/Apple で流儀が割れ、msw のハンドラも書き分けが要る。→ **raw fetch 踏襲**。
- **(k) 本 feature で `UIAppFonts` に Inter も登録して直す**: アプリ全画面の書体が SF Pro → Inter に変わる横断的変更で、本 feature の差分に無関係な視覚回帰を持ち込む。→ **Google Sans のみ登録、Inter は別 feature**。
