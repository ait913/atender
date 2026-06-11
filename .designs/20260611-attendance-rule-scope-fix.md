# AttendanceRule scope 解決バグ修正 (手動時間割ユーザーで出欠ルールが無視される)

## 目的 (1-3行)

手動で時間割を作ったユーザー (テンプレ未使用 = `sourceTemplateId === null`) で、学校/学科デフォルトおよび個人 override の出欠ルールが一切効かず、出席率が `systemDefaultRule` 固定で誤計算される本番バグを修正する。MVP 設計 (`mvp.md:110` / `:1662`) が定める「学校 + 学科 + user の 3 段 merge、user override > school+dept default > system default」を実コードで成立させる。

## 背景: 根本原因の連鎖 (確定済み)

1. `attendanceStats.ts:64` が rule の school/dept scope を `inferUserSchoolDepartment(userId)` で解決。
2. `inferUserSchoolDepartment` (`activeTimetable.ts:15-27`) は `userTimetable.sourceTemplate.{schoolId, departmentId}` からのみ scope を取る。
3. 手動作成 timetable は `sourceTemplateId = null` → `sourceTemplate` が null → `scope.schoolId === null`。
4. `attendanceStats.ts:65-67` の三項条件 (`scope.schoolId && scope.departmentId`) が false → `getEffectiveRule` を呼ばず `systemDefaultRule` 固定。
5. 結果、school+dept default も user override も完全に無視される。

**設計上の正**: `User` モデルは `schoolId` / `departmentId` を直接保持する (`schema.prisma:24-27`、`@@index([schoolId, departmentId])` も存在)。scope の一次ソースは User であるべき。`sourceTemplate` 経由は手動 timetable で破綻する誤った経路。

**確認した事実**:
- `inferUserSchoolDepartment` の呼び出し元は `attendanceStats.ts:64` の **1 箇所のみ** (`apps/api/dist/*.d.ts` はビルド成果物で無視、`src/` 内に他用途なし)。よって関数本体を書き換えても他機能への波及はない。
- `getEffectiveRule` のシグネチャは `{ schoolId: string; departmentId: string; userId: string }` を要求し、内部で 3 段 merge (user override > school+dept default > system default) を実装済み (`rules.ts:20-44`)。scope の解決経路だけが誤っている。
- weight ロジック (`strategyWeight` / `statusWeight`、`attendanceStats.ts:8-30`) は正しい。今回は **触らない**。
- 出席率計算は `computeCourseStatsWithProjection` (`attendanceStats.ts:42`) に一本化されており、`computeCourseStats` (`:32-40`) はその薄い wrapper。scope 解決は `computeCourseStatsWithProjection:64` の 1 箇所のみ。ここを直せば両 API に効く。
- テスト helper `setupCompleteUser` (`tests/helpers/auth.ts:142-161`) は `createTestUser` で User に `schoolId` / `departmentId` をセットし、`createUserTimetable` は `sourceTemplateId: null` (= 手動 timetable 相当) で timetable を作る。つまり**既存の破損テストはまさに「User に school/dept はあるが timetable は手動」状態を再現しており、User 直参照に直せば期待値どおり GREEN に戻る**。

## UI/UX

変更なし (API 内部のロジック修正のみ)。web 側・shared schema は触らない。

## データモデル

スキーマ変更なし。既存の参照先のみ:

```prisma
model User {
  id           String  @id
  schoolId     String? // ← scope 一次ソース (本修正で使う)
  departmentId String? // ← scope 一次ソース (本修正で使う)
  // ...
  @@index([schoolId, departmentId])
}
```

`EffectiveRule` / `systemDefaultRule` (`rules.ts:4-18`) も変更なし。

## API / 関数シグネチャ

### 1. 新ヘルパー: User を一次ソースとする scope 解決

`activeTimetable.ts` に新関数を追加する (`inferUserSchoolDepartment` は**削除**)。

```typescript
// apps/api/src/services/activeTimetable.ts
export async function resolveUserRuleScope(userId: string): Promise<{
  schoolId: string | null;
  departmentId: string | null;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { schoolId: true, departmentId: true },
  });
  return {
    schoolId: user?.schoolId ?? null,
    departmentId: user?.departmentId ?? null,
  };
}
```

- 入力: `userId: string`
- 出力: `{ schoolId: string | null; departmentId: string | null }` — `User.schoolId` / `User.departmentId` をそのまま返す。User が存在しない、または school/dept 未設定なら `null`。
- 関数名は scope 解決の意図を表すため `resolveUserRuleScope` とする (`inferUserSchoolDepartment` は「timetable から推論」という今や誤った含意を持つので名前ごと廃止)。

### 2. 呼び出し側の差し替え

`attendanceStats.ts:64-67` を以下に置換:

```typescript
// import 差し替え: inferUserSchoolDepartment → resolveUserRuleScope
import { resolveUserRuleScope } from "./activeTimetable";

// computeCourseStatsWithProjection 内 (現 64-67 行)
const scope = await resolveUserRuleScope(args.userId);
const effective = scope.schoolId && scope.departmentId
  ? (await getEffectiveRule({ schoolId: scope.schoolId, departmentId: scope.departmentId, userId: args.userId })).effective
  : systemDefaultRule;
```

- `getEffectiveRule` の呼び出し形は**現状のまま**。`schoolId` / `departmentId` の出所だけが `inferUserSchoolDepartment` (sourceTemplate 経由) から `resolveUserRuleScope` (User 直) に変わる。
- 三項のフォールバック条件 `scope.schoolId && scope.departmentId` も維持。User に school/dept が両方揃っていなければ `systemDefaultRule` を使う (既存挙動の維持、下記「異常系」参照)。

### 3. `findActiveUserTimetable` は不変

`activeTimetable.ts:3-13` の `findActiveUserTimetable` は scope と無関係。**変更しない**。

## 挙動仕様

scope 解決と effective rule の決定 (`__` 部分が本修正で変わる挙動):

| ケース | timetable | User.school/dept | AttendanceRule 行 | 解決される effective rule |
|---|---|---|---|---|
| A. 手動 + user override | 手動 (`sourceTemplateId=null`) | 両方セット | user override 行あり | **user override** (修正前: systemDefault で無視されていた) |
| B. 手動 + school+dept default のみ | 手動 | 両方セット | default 行のみ | **school+dept default** (修正前: systemDefault) |
| C. 手動 + ルール行なし | 手動 | 両方セット | なし | systemDefault (変化なし、ただし経路は User 直に) |
| D. テンプレ由来 + ルール行あり | テンプレ (`sourceTemplateId` あり) | 両方セット | default/override | user override > default (変化なし。User と template の school/dept が一致する正常運用が前提) |
| E. school/dept 片方 or 両方未設定 | 任意 | どちらか null | 任意 | **systemDefault** (フォールバック、確定仕様) |

### 正常系 (effective rule が引けたとき)

EXCUSED / TARDY / EARLY_LEAVE の各 status は effective rule の対応 strategy を参照し、`strategyWeight` に従って num/den/separateCounts へ寄与する (このマッピングは既存・正しい):

| strategy | num | den | separateCounts |
|---|---|---|---|
| COUNT_AS_PRESENT | +1 | +1 | — |
| COUNT_AS_ABSENT | +0 | +1 | — |
| HALF_PRESENT | +0.5 | +1 | — |
| REDUCE_DENOMINATOR | +0 | +0 (分母 -1) | — |
| SEPARATE_COUNT | +0 | +0 (分母 -1) | `separateCounts[status] += 1` |

PRESENT=COUNT_AS_PRESENT / ABSENT=COUNT_AS_ABSENT / CANCELLED=REDUCE_DENOMINATOR は status 固定 (effective rule 非参照)。

具体的期待値 (`setupCompleteUser` = User に school/dept あり + 手動 timetable、`totalSessions=15` 前提):

- **#57** EXCUSED 1 件 + (school+dept default) `excusedStrategy=COUNT_AS_PRESENT` → `effectiveNumerator=1`, `effectiveDenominator=15`。
  - 修正前: numerator=0 (systemDefault の REDUCE_DENOMINATOR で無視) → **修正後 1**。
- **#60** EXCUSED 1 件 + school+dept default `COUNT_AS_ABSENT` + user override `COUNT_AS_PRESENT` → user override 採用 → `effectiveNumerator=1`。
- **#61** EXCUSED 1 件 + school+dept default `COUNT_AS_PRESENT` (user override なし) → default 採用 → `effectiveNumerator=1`。
- **#64** EXCUSED 1 件 + user override `excusedStrategy=SEPARATE_COUNT` → `effectiveNumerator=0`, `effectiveDenominator=14`, `separateCounts.EXCUSED=1`。
- **(L486 `toDate` + projection ケース)** user override `SEPARATE_COUNT` + EXCUSED 1 件 → `toDate.{effectiveNumerator:0, effectiveDenominator:0, attendanceRate:null}`, `separateCounts.EXCUSED=1`, `allowedAbsences=null`。

### 異常系 (フォールバック)

- **ケース E**: `User.schoolId` または `User.departmentId` が null → `getEffectiveRule` を呼ばず `systemDefaultRule` を採用。EXCUSED=REDUCE_DENOMINATOR, TARDY=HALF_PRESENT, EARLY_LEAVE=HALF_PRESENT。これは初期 setup 未完ユーザーで rule を引きようがないための既存挙動の維持。設計上の確定仕様 (Researcher 提起の未定義点を本 doc で確定)。
- **User が存在しない**: `resolveUserRuleScope` が `{null, null}` を返し、上記と同じく systemDefault。実運用では認証済みリクエストなので発生しないが、防御的に null 安全。
- **#62** (既存 GREEN を維持): AttendanceRule 行が一切なく User に school/dept あり → `getEffectiveRule` は内部で `source = null` → 各 strategy が `systemDefaultRule` の値にフォールバック。EXCUSED+TARDY+EARLY_LEAVE 各 1 件で `effectiveNumerator=1` (REDUCE_DENOMINATOR=0 + HALF_PRESENT 0.5×2=1), `effectiveDenominator=14`。修正後も `scope.schoolId && scope.departmentId` が true になり `getEffectiveRule` 経由に変わるが、行がないため結果は同一。

### 回帰しないこと

- weight ロジック (strategy→num/den) は不変。
- timetable suspension / course suspension による分母削減 (`attendanceStats.ts:90-99`) は不変。
- 未記録=過去なら欠席扱い (floatingPast)、未来なら projection (floatingFuture) のロジック (`:101-108`) は不変。
- `GET /api/stats` の semester scoping (#65) は不変。

## テスト基盤

- フレームワーク: **vitest** (in-memory SQLite)、`apps/api/tests/`。
- 対象テストファイル: `apps/api/tests/stats.test.ts`。
- helper: `tests/helpers/auth.ts` の `setupCompleteUser` (User に school/dept セット + 手動 timetable)。**helper は変更不要**。
- 受け入れ条件 (Reviewer 検証):
  1. 既存の破損 5 件が無修正で GREEN に戻る:
     - `[§8 #57]` EXCUSED COUNT_AS_PRESENT → `effectiveNumerator=1`
     - `[§8 #60]` user override が school+dept default に勝つ → `effectiveNumerator=1`
     - `[§8 #61]` school+dept default 採用 → `effectiveNumerator=1`
     - `[§8 #64]` SEPARATE_COUNT → `effectiveNumerator=0`, `effectiveDenominator=14`, `separateCounts.EXCUSED=1`
     - L486 `toDate` + projection で SEPARATE_COUNT → `separateCounts.EXCUSED=1` 等
  2. 既存 GREEN テストが回帰しない: 特に `[§8 #62]` (ルール行なし→systemDefault) と `[§8 #58]/[§8 #59]/[§8 #63]/[§8 #65]`。
  3. 追加で書くべきケース (Reviewer 推奨):
     - **テンプレ由来 timetable** (`sourceTemplateId` をセット) でも user override / school+dept default が効くこと (ケース D。修正前も sourceTemplate 経由で偶然動いていたパスが、User 直参照に変えても壊れないことの保証)。
     - **User.schoolId=null** のユーザーで systemDefault にフォールバックすること (ケース E)。
- 全 stats 系テストが GREEN なら受け入れ。コマンド: `pnpm --filter @atender/api test` (または該当ファイル指定実行)。

## 不採用案

- **案A: `inferUserSchoolDepartment` を全面書き換え (sourceTemplate → User 直) し、関数名は据え置き**
  - 却下理由: 関数名が「timetable から infer する」という今や誤った含意を持つ。挙動を User 直参照に変えたのに名前が timetable 推論のままだと、将来読む人が誤解する。呼び出し元が 1 箇所しかない以上、名前ごと `resolveUserRuleScope` に置換するコストはほぼゼロで、意図が明確になる方を採る。
- **案B: `attendanceStats` 内にローカルで User 直参照を埋め込み、`activeTimetable.ts` を一切触らない**
  - 却下理由: scope 解決は再利用可能な関心事 (将来 rule を使う別 API が出る可能性)。stats サービスに DB クエリを直書きすると責務が混ざる。`activeTimetable.ts` に切り出された関数群と同列に置くのが構造上一貫。また `inferUserSchoolDepartment` を残すと「誰も使わない誤った scope 解決関数」が残骸として残り、次の実装者が誤用するリスクがある。削除して置換する。
- **案C: scope フォールバックを「User が null なら sourceTemplate を見る」二段構えにする**
  - 却下理由: 手動 timetable では sourceTemplate が null なので二段目も効かない。複雑性だけ増えて手動ケースを救えない。User が一次かつ唯一のソースで十分 (MVP 設計の意図とも一致)。User 未設定時は systemDefault が確定仕様。
