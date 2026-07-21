# 公開時間割の検索・表示・追加 (方式 B: 学校→学科ピッカー)

## 目的

公開時間割 (`TimetableTemplate`) を **「学校名 → 学科名 → 時間割名」** で辿って探し、各時間割に **学校名/学科名/時間割名** を表示し、既存 copy で自分の時間割に取り込む。現状の iOS `TemplatesView` は「学校 ID/学科 ID を生入力」の dev グレードで、実ユーザーが使えない。これを **学校→学科の 2 段ピッカー + 時間割一覧** の実用 UI に作り替える。

検索方式は **B (学校→学科ピッカー) で Touri 確定済**。方式 A (単一フリーテキスト) は §不採用案に理由付きで残す。

---

## スコープ / 非スコープ / ファイル境界

### スコープ (2 面)

| 面 | 変更 | 種別 |
|---|---|---|
| **backend** (`apps/api` + `packages/shared`) | `TemplateDto` に `schoolName` / `departmentName` を **additive** 追加 (`templateInclude` に `school`/`department` を include + DTO 拡張) | **additive のみ。スキーマ migration 無し** |
| **iOS** (`apps/ios`) | `TemplatesView` を 2 段ピッカー UI に全面書き換え + `TemplatesViewModel` 新設 + iOS `TemplateDto` に name フィールド追加 | UI 刷新 |

### 非スコープ

- **Web UI (`apps/web`) は今回いじらない** (「Web いったん放置」方針)。ただし backend DTO 拡張は additive なので Web を壊さない (§Web 非破壊の根拠)。
- **検索クエリ自体の変更なし**。既存 `GET /api/timetable-templates?schoolId=&departmentId=&q=` の ID フィルタをそのまま使う (方式 B は表示用 DTO 拡張だけが必要)。
- **copy (取り込み) は既存流用**。`POST /api/timetable-templates/:id/copy` の実装・iOS 配線とも無変更。
- **認証・課金・データ削除・破壊的 migration には触れない** (§migration 要否)。

### 触るファイル (確定リスト)

**backend**
- `apps/api/src/routes/templates.ts` — `templateInclude` に `school`/`department` を追加 (1 箇所、全 `templateDto` 呼出しに波及)
- `apps/api/src/lib/dto.ts` — `TemplateWithParts` 型 + `templateDto()` に 2 フィールド追加
- `packages/shared/src/schemas/template.ts` — zod `TemplateDto` に `schoolName`/`departmentName` 追加

**iOS**
- `apps/ios/Atender/Features/Rooms/TemplatesView.swift` — 全面書き換え + `TemplatesViewModel` 追加 (同ファイル末尾、`SetupViewModel` と同じ配置流儀)
- `apps/ios/Atender/Core/Models/DTOs.swift` — `struct TemplateDto` に `let schoolName: String` / `let departmentName: String` 追加

**触らない (配線は既存で足りる)**
- `apps/ios/Atender/Core/Data/SchoolRepository.swift` — `schools(_:)` / `departments(schoolId:q:)` は既存で流用
- `apps/ios/Atender/Core/Data/RoomRepositories.swift` — `TemplateRepository.templates(_:)` / `copyTemplate(id:_:)` は既存で流用
- `apps/ios/Atender/Core/Networking/APIEndpoint.swift` — `schools` / `departments` / `templates` / `copyTemplate` endpoint は既存
- `apps/api/src/routes/schools.ts` — `GET /api/schools?q=` / `GET /api/schools/:schoolId/departments?q=` は既存で流用

---

## データモデル

### 既存スキーマ (変更なし・要点のみ)

`prisma/schema.prisma`:
- `School(id, name, nameKana, prefecture, kind)` `@@index([name])`
- `Department(id, schoolId, name, nameKana)` `@@unique([schoolId, name])`
- `TimetableTemplate(id, authorUserId, schoolId, departmentId, title, description, year, term, isPublic, copyCount, ...)` — **`schoolId`/`departmentId` は非 null (String)、`school`/`department` relation は必須**。`@@index([schoolId, departmentId, updatedAt desc])`

→ `school`/`department` の relation は**既にスキーマに存在**。DTO 拡張は既存 relation を `include` で読むだけ = **カラム追加も migration も不要**。

### DTO 拡張の型 (additive)

**shared zod** (`packages/shared/src/schemas/template.ts` の `TemplateDto`) — 末尾に 2 行追加:

```ts
export const TemplateDto = z.object({
  // ... 既存フィールド全て不変 ...
  createdAt: z.string(),
  updatedAt: z.string(),
  schoolName: z.string(),       // ★ 追加 (非 null。school relation は必須)
  departmentName: z.string(),   // ★ 追加 (非 null。department relation は必須)
});
```

- `z.object` は **非 strict** (`.strict()` を使っていない) ので、この schema で response を parse する Web/テストは、追加前の payload なら新フィールド欠落で fail する。**必ず backend と同時にリリースする** (同一 PR)。追加後は Web も新フィールドを無視するだけで壊れない。
- 型 `TemplateDto = z.infer<typeof TemplateDto>` は自動で 2 フィールドを得る。

**backend helper 型** (`apps/api/src/lib/dto.ts` の `TemplateWithParts`) — relation 2 つを追加:

```ts
export type TemplateWithParts = TimetableTemplate & {
  daySlots: Array<{ ... }>;   // 既存不変
  courses: Array<{ ... }>;    // 既存不変
  meetings: Array<{ ... }>;   // 既存不変
  school: { name: string };        // ★ 追加
  department: { name: string };    // ★ 追加
};
```

**iOS** (`DTOs.swift` の `struct TemplateDto`) — 末尾に 2 プロパティ追加 (非 Optional):

```swift
struct TemplateDto: Codable, Equatable, Identifiable {
    // ... 既存フィールド全て不変 ...
    let createdAt: String
    let updatedAt: String
    let schoolName: String        // ★ 追加
    let departmentName: String    // ★ 追加
}
```

- `Codable` の合成 init が自動更新。`.useDefaultKeys` (APIClient) なので JSON キー名 `schoolName`/`departmentName` と 1:1。
- 非 Optional で正しい (backend が常に出力)。**iOS を backend より先に配布すると旧 API から欠落フィールドで decode 失敗する** → backend を先にデプロイしてから iOS を配布する (§リリース順序)。

---

## API / 関数シグネチャ

### 使う既存 endpoint (無変更)

| endpoint | 用途 | ステップ |
|---|---|---|
| `GET /api/schools?q=<name>&limit=20` | 学校名/かな部分一致検索 | 1 |
| `GET /api/schools/:schoolId/departments?q=<name>&limit=50` | 学科名部分一致検索 (schoolId で絞込済) | 2 |
| `GET /api/timetable-templates?schoolId=&departmentId=&q=<title>&limit=20` | 公開時間割一覧 (ID フィルタ + title 部分一致) | 3 |
| `POST /api/timetable-templates/:id/copy` `{semesterId, title?}` | 取り込み | 5 |

- SQLite `contains` は大文字小文字区別 (Prisma `mode:'insensitive'` 非対応)。日本語主体なので現行踏襲。**新規の検索挙動は増やさない。**

### backend の DTO 変更点 (唯一の backend 実装)

`apps/api/src/routes/templates.ts`:

```ts
const templateInclude = {
  daySlots: { orderBy: { periodIndex: "asc" as const } },
  courses: { orderBy: { id: "asc" as const } },
  meetings: { orderBy: [{ dayOfWeek: "asc" as const }, { startPeriodIndex: "asc" as const }] },
  school: { select: { name: true } },        // ★ 追加
  department: { select: { name: true } },    // ★ 追加
};
```

- `templateInclude` は list (`GET /api/timetable-templates`) / detail (`GET /:id`) / create (POST 201) / patch (PATCH) の **4 経路すべてで共有**されている。ここ 1 箇所の変更で 4 経路すべてが `schoolName`/`departmentName` を返す (一貫)。

`apps/api/src/lib/dto.ts` の `templateDto()`:

```ts
export function templateDto(template: TemplateWithParts) {
  return {
    // ... 既存フィールド全て不変 ...
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    schoolName: template.school.name,          // ★ 追加
    departmentName: template.department.name,  // ★ 追加
  };
}
```

### iOS ViewModel シグネチャ (新設)

`TemplatesView.swift` 末尾に `SetupViewModel` と同じ流儀で定義:

```swift
@MainActor
@Observable
final class TemplatesViewModel {
    enum Step { case school, department, list }

    @ObservationIgnored private let env: AppEnvironment
    init(env: AppEnvironment)

    // 画面状態
    private(set) var step: Step = .school
    var schoolQuery: String = ""            // 学校検索欄 (bind)
    var departmentQuery: String = ""        // 学科検索欄 (bind)
    var titleQuery: String = ""             // 時間割名 絞り込み欄 (bind)
    private(set) var schools: [SchoolDto] = []
    private(set) var departments: [DepartmentDto] = []
    private(set) var templates: [TemplateDto] = []
    private(set) var selectedSchool: SchoolDto?
    private(set) var selectedDepartment: DepartmentDto?

    // copy 先
    private(set) var semesters: [SemesterDto] = []
    var semesterId: String = ""             // copy 対象学期 (bind、空 = defaultSemesterId)
    private(set) var defaultSemesterId: String?

    // 進捗/エラー
    private(set) var isSearchingSchools = false
    private(set) var isSearchingDepartments = false
    private(set) var isSearchingTemplates = false
    private(set) var copyingTemplateId: String?   // copy 中の template.id (nil = なし)
    var errorText: String?

    // 初期化 (semesters/defaultSemesterId をロード)
    func bootstrap() async

    // 同期の状態遷移 (network を伴わない = 単体テスト対象)
    func selectSchool(_ school: SchoolDto)      // selectedSchool=school, step=.department, 学科/時間割/selectedDepartment/departmentQuery/titleQuery をクリア
    func selectDepartment(_ dep: DepartmentDto) // selectedDepartment=dep, step=.list, titleQuery クリア
    func backToSchool()                          // step=.school, selectedSchool/selectedDepartment/departments/templates をクリア
    func backToDepartment()                      // step=.department, selectedDepartment/templates をクリア

    // 非同期 fetch (debounce は View 側 .task(id:) で 300ms)
    func searchSchools() async       // schools = schoolRepository.schools(SchoolSearchQuery(q: schoolQuery空ならnil, limit:20))
    func loadDepartments() async     // guard selectedSchool; departments = schoolRepository.departments(schoolId:selectedSchool.id, q: departmentQuery空ならnil)
    func searchTemplates() async     // guard selectedSchool & selectedDepartment; templates = templateRepository.templates(TemplateSearchQuery(schoolId:selectedSchool.id, departmentId:selectedDepartment.id, q: titleQuery空ならnil, limit:20), force:true)

    // 取り込み
    func copy(_ template: TemplateDto) async     // §挙動 C 群
}
```

- **`selectSchool`/`selectDepartment`/`backToSchool`/`backToDepartment` は同期・純粋** (network を呼ばない)。View 側が選択後に `Task { await vm.loadDepartments() }` / `searchTemplates()` を蹴る (SetupFlowView と同じ流儀)。→ これらの状態遷移は `AppEnvironment()` を注入した VM に対し **network 無しで単体テスト可能** (§テスト基盤)。

---

## UI/UX (DESIGN.md 準拠)

### 配置と提示

- 提示は既存どおり **Rooms タブの `NavigationStack` に push** (`RoomsRoute.templates` → `TemplatesView()`、`MainTabView.swift:58`。無変更)。
- これは**詳細画面** (プロミネントな content header を持たない) なので DESIGN.md §3.7.2 に従い **inline nav タイトル 1 つ**: `.navigationBarTitleDisplayMode(.inline)` + `.navigationTitle("みんなの時間割")`。本文に大タイトルを重複させない (現状の本文「みんなの時間割」大見出しは廃止)。
- 全体は `ScrollView` + `VStack(spacing: Space.sectionGapMobile)` (= 16pt、§3.2)、`.padding(Space.pagePxMobile)` (= 16pt 左右)、`.background(Color.bgBase)`。

### 画面遷移 (2 段ピッカー + 一覧、1 画面内 step 切替)

SetupFlowView と同じ **1 画面内 step マシン** (別 push はしない)。`vm.step` で本文を切替:

```
┌─ step .school ─────────────┐   selectSchool   ┌─ step .department ─────────┐   selectDepartment
│ [検索: 学校名で検索      ] │ ───────────────▶ │ ○○大学  [変更]            │ ─────────────────▶
│ ○ △△大学                  │                  │ [検索: 学科名で検索      ] │
│ ○ □□専門学校              │ ◀─ backToSchool ─│ ○ 情報処理科               │ ◀─ backToDepartment ─┐
│ ○ ...                      │                  │ ○ ネットワーク科           │                       │
└────────────────────────────┘                  └────────────────────────────┘                       │
                                                                                                       ▼
                                              ┌─ step .list ──────────────────────────────────────────┐
                                              │ ○○大学 › 情報処理科   [変更]                          │
                                              │ 取り込み先: [学期 Picker ▼]                            │
                                              │ [検索: 時間割名で絞り込み            ]                 │
                                              │ ┌── card ──────────────────────────┐                  │
                                              │ │ 2026 前期 情報処理科 2年 (title) │                  │
                                              │ │ ○○大学 · 情報処理科  (school·dept)│                  │
                                              │ │ by @handle · copy ×12 · 更新 6/21 │                  │
                                              │ │                      [ 追加 ]     │                  │
                                              │ └───────────────────────────────────┘                  │
                                              │ ... (更新降順)                                          │
                                              └────────────────────────────────────────────────────────┘
```

### コンポーネント構成 (DESIGN.md トークン)

- **検索欄**: 既存 `LabeledInput(label:"", text:$vm.schoolQuery, placeholder:"学校名で検索")` (SetupFlowView と同一)。
- **候補行** (学校/学科): SetupFlowView の `resultButton` と同一体裁を `TemplatesView` 内に再現 — `Button` + `Text(school.name)` 左寄せ + `.padding(Space.s3)` + `RoundedRectangle(cornerRadius: Radius.sm)` の枠 (`Color.borderSubtle`、選択時 `Color.accent500`/`Color.accent50`)。学科行のみ選択状態を持つ (`selectedDepartment?.id == dep.id`)。タップ域 44pt 以上。
- **breadcrumb ヘッダー** (step .department / .list): `HStack` に `Text(selectedSchool.name)` (`.atenderLg`/headline) + `.list` では `Text("›") + Text(selectedDepartment.name)`、右端に `AtenderButton(title:"変更", variant:.ghost)` → `backToSchool()` (.department からは学校変更) / `.list` では学校名タップで `backToSchool()`・学科部分で `backToDepartment()`。**簡潔化**: 「変更」1 つで `backToSchool()` (最上流へ戻す)。
- **学期 Picker** (step .list): `Picker("取り込み先", selection: $vm.semesterId)` `.pickerStyle(.menu)`。先頭 `Text("既定").tag("")`、以降 `vm.semesters`。DESIGN.md §3.7.3 の subhead 級コントロール扱い (`.footnote`)。
- **時間割カード**: 既存 `Panel { }` (= card、`Radius.md` + `.atenderShadow(.card)`、§3.1/§3.3) を再利用。内部 `VStack(alignment:.leading, spacing: Space.s2)`:
  - `Text(template.title)` — `.atenderLg` (headline 17 semibold)、`Color.textPrimary`
  - `Text("\(template.schoolName) · \(template.departmentName)")` — `.atenderSm` (footnote 13)、`Color.textSecondary` ★ 新フィールド表示
  - `Text("by @\(TemplateLogic.authorHandle(template)) · copy ×\(template.copyCount) · 更新 \(template.updatedAt.prefix(10))")` — `.atenderXs`、`Color.textTertiary` (既存 `TemplateLogic.authorHandle` 流用)
  - `AtenderButton(title:"追加", variant:.primary, isLoading: vm.copyingTemplateId == template.id, isEnabled: vm.copyingTemplateId == nil)` → `Task { await vm.copy(template) }`
  - `.accessibilityIdentifier("template-card-\(template.id)")` (既存 ID 踏襲、UITest 継続)
- カード群コンテナに `.accessibilityIdentifier("templates-list")` (既存踏襲)。

### 状態管理 (どこに何の state が乗るか)

- **VM (`TemplatesViewModel`, `@Observable`)** が全 state を所有 (step / 各 query / schools / departments / templates / 選択 / semesters / 進捗フラグ)。View は `@State private var model: TemplatesViewModel?` で保持 (SetupFlowView と同一)。
- **debounce** は View の `.task(id:)` で 300ms sleep 後に fetch (SetupFlowView と同一):
  - step .school: `.task(id: vm.schoolQuery)` → `searchSchools()`
  - step .department: `.task(id: "\(selectedSchool?.id ?? "")|\(vm.departmentQuery)")` → `loadDepartments()`
  - step .list: `.task(id: "\(selectedDepartment?.id ?? "")|\(vm.titleQuery)")` → `searchTemplates()`
- **copy 先学期**は VM の `semesterId` (空なら `defaultSemesterId`)。`bootstrap()` で `meRepository.me()` / `semesterRepository.semesters()` から解決。

### 状態網羅 (DESIGN.md §5)

| 状況 | 表示 |
|---|---|
| step .school で `schoolQuery` 空 | `ContentUnavailableView("学校を検索", systemImage:"magnifyingglass", description: Text("学校名を入力してください"))` |
| step .school で検索 0 件 | `ContentUnavailableView.search(text: vm.schoolQuery)` (「"○○" の結果はありません」) |
| step .department で学科 0 件 | `ContentUnavailableView` label に **マスコット** `Image("mascot-hello")`、「この学校の学科はまだありません」(DESIGN.md §5、資産を custom icon に渡す) |
| step .list で時間割 0 件 | `ContentUnavailableView` label に `Image("mascot-hello")`、「この学科の公開時間割はまだありません」 |
| loading (各 fetch 中) | 該当リスト位置に `ProgressView().tint(.accent500)` (SetupFlowView 踏襲)。`isSearching*` が true の間 |
| error (fetch 失敗) | `vm.errorText` を `ErrorBanner(text:)` で本文先頭に表示 (SetupFlowView 踏襲) |

### 「自分の時間割を公開」機能の扱い (★ 現状機能の保全)

現状 `TemplatesView` は検索とは別に **`publishTimetable`** (自分の現在時間割を public template として公開) ボタンを持つ。今回の作り替えで**黙って消さない**。

- **決定**: publish を **nav bar toolbar trailing の "公開" ボタン**に移す。`vm.defaultSemesterId` の学期に紐づくユーザー時間割を `templateRepository.publishTimetable(id:title:)` で公開 (既存配線・無変更)。対象時間割が無ければ disabled。成功で `toastCenter.show("公開しました")`。
- これは検索フローの純度を保ちつつ機能を落とさないための配置。**Touri 判断点**として §末尾に上げる (この機能をここに残すか、別画面/別 PR に出すか)。

---

## 挙動仕様 (Reviewer はここからテスト生成)

### A. backend DTO 拡張 (contract、`apps/api/tests/timetable-templates.test.ts`)

- **A1**: 学校 `S`(name="○○大学")・学科 `D`(name="情報処理科") 配下の公開 template を作り `GET /api/timetable-templates?schoolId=S&departmentId=D` を叩くと、各要素の **`schoolName === "○○大学"`** かつ **`departmentName === "情報処理科"`**。
- **A2**: `GET /api/timetable-templates/:id` (public) の `template.schoolName`/`departmentName` が同様に school/department の name と一致。
- **A3**: `POST /api/timetable-templates` の 201 レスポンス `template` に `schoolName`/`departmentName` が入る (作成に使った school/department の name)。
- **A4**: `PATCH /api/timetable-templates/:id` (author) の 200 レスポンス `template` に `schoolName`/`departmentName` が入る。
- **A5** (既存不変): `schoolId`/`departmentId`/`title`/`copyCount`/`daySlots`/`courses`/`meetings`/`createdAt`/`updatedAt` などの既存フィールドは形も値も変わらない (既存 §8 #25〜#34 が緑のまま通る)。
- **A6** (フィルタ不変): `schoolId`/`departmentId`/`q`(title) フィルタと updatedAt desc 並びは従来どおり (既存 #25/#26 が緑)。

### B. iOS 検索フロー (VM 状態遷移)

- **B1**: 初期 `step == .school`、`schools`/`departments`/`templates` は空。
- **B2**: `selectSchool(s)` 後 → `selectedSchool == s`・`step == .department`・`selectedDepartment == nil`・`departments == []`・`templates == []`・`departmentQuery == ""`・`titleQuery == ""`。
- **B3**: `selectDepartment(d)` 後 → `selectedDepartment == d`・`step == .list`・`titleQuery == ""`。
- **B4**: step .list で `backToSchool()` → `step == .school`・`selectedSchool == nil`・`selectedDepartment == nil`・`departments == []`・`templates == []`。
- **B5**: step .list で `backToDepartment()` → `step == .department`・`selectedDepartment == nil`・`templates == []`・`selectedSchool` は保持。
- **B6** (decode contract): `schoolName`/`departmentName` を含む JSON を `TemplateDto` に decode すると両プロパティが埋まる。**この 2 フィールドを欠く JSON は decode 失敗する** (非 Optional の確認)。
- **B7** (query 直列化): `Endpoints.templates(TemplateSearchQuery(schoolId:"S", departmentId:"D", q:"OS", limit:20)).query` に `schoolId=S`・`departmentId=D`・`q=OS`・`limit=20` が含まれ、`q` が nil のときは `q` キーが出ない。

### C. iOS 取り込み (copy)

- **C1** (成功): copy 対象の学期に既存時間割が無い状態で `copy(t)` → `copyTemplate(id:t.id, TemplateCopyInput(semesterId: 実効学期, title:nil))` を呼び、成功で `toastCenter.show("コピーしました")`。`copyingTemplateId` は開始で `t.id`・終了で `nil`。
- **C2** (学期未解決): `semesterId` 空かつ `defaultSemesterId == nil` のとき `copy(t)` は何もしない (guard で return)。カードの追加ボタンはこの状態で `isEnabled == false`。
- **C3** (409 CONFLICT): API が `409 CONFLICT` (対象学期に既に時間割) を返したら、`toastCenter.show("この学期にはすでに時間割があります")` (`APIError.api(status:_, code:"CONFLICT", _)` を判別)。他エラーは `toastCenter.show("保存できませんでした、もう一度試してください")` (既存文言)。
- **C4** (実効学期): `semesterId` が非空ならそれを、空なら `defaultSemesterId` を copy 先に使う。

### D. backend copy (既存・無変更、回帰確認のみ)

- **D1**: `POST /:id/copy` は既存挙動 (copyCount++、deep copy、sourceTemplateId 継承、409 重複、403 他人学期) を維持。既存 §8 #28〜#34 が緑のまま。**今回変更しない。**

### E. 空/エッジ

- **E1**: 学校検索 0 件 → `schools == []`、View は `ContentUnavailableView.search`。
- **E2**: 学科 0 件 → `departments == []`、View はマスコット付き空状態。
- **E3**: 時間割 0 件 → `templates == []`、View はマスコット付き空状態。
- **E4**: 検索欄クリア (query 空) → 各 fetch は `q: nil` で全件 (limit 内) を返す (学校は名前昇順、学科は名前昇順、時間割は updatedAt 降順)。

---

## テスト基盤

### backend

- **フレームワーク**: vitest (`vitest run`)。設定は既存。
- **配置**: `apps/api/tests/timetable-templates.test.ts` に **§A1〜A6 を追加**。helper (`createSchoolDepartment`/`createTestUser`/`createSessionCookie`/`createTemplate`) は既存流用。`createTemplate` は school/department name を検証できるよう `createSchoolDepartment` の返す school/department を使う (既に name を持つ)。
- **パターン**: `app.request()` → `json(res)` → `expect(body.templates[0].schoolName).toBe(school.name)` 等。DTO 拡張の contract テスト + 既存フィールド不変の回帰。

### iOS

- **フレームワーク**: XCTest (`xcodebuild test -scheme Atender`、157 GREEN 基準)。
- **配置**: `apps/ios/AtenderTests/` に新規 `TemplatesViewModelTests.swift`。
- **パターン**:
  - **§B1〜B5 (状態遷移)**: `TemplatesViewModel(env: AppEnvironment())` を構築 (DEBUG init は network を伴わない)。`selectSchool`/`selectDepartment`/`backToSchool`/`backToDepartment` は同期・純粋なので network 不要で assert 可能。`SchoolDto`/`DepartmentDto` はテスト内で直接 struct 生成。
  - **§B6 (decode)**: `TemplateDto` を JSON fixture から `JSONDecoder().decode` し `schoolName`/`departmentName` を assert。欠落 JSON で `XCTAssertThrowsError`。既存 DTO decode テストと同流儀。
  - **§B7 (query)**: `Endpoints.templates(...).query` を直接検証 (純粋)。
  - **§C1/C3 (copy)** は APIClient を介すため、必要なら `AtenderTests/APIClientTests.swift` の `StubURLProtocol` パターンで endpoint 応答をスタブして検証可 (VM の async 経路)。**ただし VM は自前 APIClient を持つ `AppEnvironment` 経由なので、StubURLProtocol が AppEnvironment の URLSession に載るかは Reviewer が実測して判断**する。載らなければ C1/C3 は「repository が正しい endpoint/body を呼ぶ」レベル (APIClientTests 同様の URLSession 注入) に落として検証してよい。**§C の本質は「409 を判別して専用文言を出す」分岐**なので、そこを緑にできる最小手段を Reviewer が選ぶ。
- **既知失敗台帳**: `apps/api/.knowledge/known-failures.md` は本 PJ に未整備 (`.knowledge/` に `known-failures.md` はあるが分類要確認)。マージ前に未分類失敗ゼロを確認 (CLAUDE.md ベースライン規律)。

---

## migration 要否 (★ エスカレーション確認)

- **不要**。`school`/`department` relation は `schema.prisma` の `TimetableTemplate` に**既に定義済** (`schoolId`/`departmentId` FK + relation)。変更は Prisma `include` に relation を足して**既存カラムを読むだけ**で、テーブル・カラム・index の増減はゼロ。`prisma migrate` は走らせない。
- したがって本設計は **認証・課金・データ削除・破壊的 migration のいずれにも触れない** (CLAUDE.md エスカレーション対象外)。もし実装中に「migration が要る」と判明したら Leader に即報告 (想定していない)。

## Web 非破壊の根拠 (additive)

- DTO 変更は **フィールド追加のみ** (既存フィールドの型・名前・有無を変えない)。
- shared zod `TemplateDto` は **非 strict** (`.strict()` 不使用) なので、追加後の payload を旧コードが parse しても新フィールドは無視されるだけ (Web が新フィールドを読まなくても壊れない)。
- **唯一の順序制約**: shared schema と backend は同一 PR で出す (schema が新フィールドを required にするため、schema だけ先行すると旧 payload を弾く)。Web は schema 更新後も新フィールド未使用で動作継続。

## リリース順序 (iOS 非 Optional 由来)

1. backend + shared (DTO additive) を先にデプロイ (`atender-api`)。
2. その後 iOS (新 `TemplateDto` 非 Optional) を配布。逆順だと旧 API の欠落フィールドで iOS の decode が失敗する。

---

## 不採用案

- **方式 A (単一フリーテキストで「学校名+学科名+時間割名」を横断検索)**: 却下 (Touri が方式 B を確定)。理由: (a) backend の `q` は現状 title 部分一致のみで、学校名/学科名を横断検索するには join 検索の新クエリ実装が要り additive でなくなる。(b) 学校・学科は正規化 FK で候補が有限なので、ピッカーで曖昧一致の誤爆を避けられる。(c) 既存 `GET /api/schools?q=` / `departments?q=` がそのまま使え、backend 実装が DTO 拡張だけで済む。
- **backend に「学校名/学科名で time table を横断検索する新 endpoint/クエリ」を足す**: 却下。方式 B は既存 ID フィルタで足りる。新クエリは SQLite の join 部分一致 (insensitive 非対応) を増やし、テスト面も広がる。表示に必要なのは name の**出力**だけ。
- **`TemplateDto` の name を Optional にする**: 却下。`schoolId`/`departmentId` はスキーマで非 null・relation 必須なので name は常に存在する。Optional にすると iOS/Web で不要な nil 分岐が増える。
- **iOS `TemplatesView` を 2 画面 (SchoolPicker → DepartmentPicker) に push 分割**: 却下。SetupFlowView の確立パターン (1 画面内 step マシン + breadcrumb 戻り) に揃える方が、戻り/やり直しが速く、既存の視覚・操作規約と一貫する。
- **publish (自分の時間割公開) を今回削除**: 却下 (プロダクト判断は Architect の裁量外)。toolbar に退避して機能を保全し、去就は Touri 判断に上げる。

---

## Touri 判断が要る点

1. **publish ボタンの去就**: 今回 nav bar toolbar に退避して機能保全する設計。ここに残すか / 別画面・別 PR に切り出すか。既定は「toolbar に残す」。
