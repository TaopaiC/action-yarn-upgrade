# SPEC

## 概念

建立一個 [[GitHub Actions]]
workflow，自動升級指定 Node 套件，並記錄每個升級是否解決對應 CVE 問題。

## 輸入

| Input          | 必填 | 預設   | 說明                                                               |
| -------------- | ---- | ------ | ------------------------------------------------------------------ |
| `module_list`  | 否   | `''`   | Comma-separated 的 npm module 名稱，例如 `lodash,axios`。省略時執行 audit 自動偵測。 |
| `github_token` | 是   |        | 建立 PR 的 GitHub token，通常為 `secrets.GITHUB_TOKEN`。          |
| `workdir`      | 否   | `''`   | 執行 yarn / git 指令的工作目錄，預設為 repo root。                 |
| `base_branch`  | 否   | `''`   | PR 的目標 branch，預設自動偵測目前 branch。                        |
| `pr_prefix`    | 否   | `CHORE`| PR 標題前綴（例如 `CHORE`、`fix`、`deps`）。                       |
| `labels`       | 否   | `''`   | 逗號分隔的 PR label（例如 `dependencies,security`）。              |

## 升級流程（循序處理每個 module）

執行前先建立一個時間戳記 branch（`chore/cve-upgrades-YYYYMMDD-HHmmss`）。

對每個 module，先讀取 `yarn.lock` 找出所有已安裝的 major versions（例如同時存在 `^8` 和 `^9`），再對每個 major 依序執行：

```bash
yarn add $module@^$major
yarn dedupe $module
git checkout package.json
yarn   # re-sync node_modules with restored package.json
```

> [!important] 判斷邏輯
>
> - 若 `yarn.lock` **有異動** → 表示該 module 確實被升級，記錄為「已升級」
> - 若 `yarn.lock` **無異動** → 表示版本未變，記錄為「無需升級」
> - 若執行過程發生錯誤 → 記錄為「失敗」，繼續處理下一個 module

若 yarn.lock 有異動，加入 stage 並在每次偵測後重設判斷基準：

```bash
git add yarn.lock
```

> [!note] `git checkout package.json`
> 是為了還原 package.json 的直接相依版本字串，只保留 yarn.lock 的鎖定升級結果。

> [!note] major version 邊界
> 僅在同一 major 範圍內升級（patch / minor），不允許 major bump。
> 若 yarn.lock 中同時有 `^8` 與 `^9`，兩個範圍分別獨立升級。

## Commit、PR 與紀錄

- 一次 `git commit` 包含所有升級的 `yarn.lock` 變更
- Commit 後 push branch，並自動開 PR 回 base branch
- PR 標題格式：`${pr_prefix}: bump N module(s) (module1, module2) for CVE fixes`
- Commit message（同時作為 PR body）格式：

```text
chore: bump node modules for CVE fixes

Upgraded:
- lodash: 4.17.20 → 4.17.21 (may resolve CVE-2021-23337)
- axios: 0.21.1 → 0.21.4 (may resolve GHSA-xxxx-xxxx-xxxx)

Not upgraded (no change in yarn.lock):
- express

Failed (skipped):
- some-module: error message
```

> [!note] CVE vs GHSA
> 若使用 `yarn npm audit --json`（Yarn Berry NDJSON 格式），CVE 欄位會顯示 GHSA ID（從 advisory URL 擷取）而非傳統 CVE 編號。

## 已決定的細節

- [x] Audit 解析：支援 classic npm audit JSON（`advisories` 物件）與 Yarn Berry NDJSON 兩種格式
- [x] CVE ↔ module mapping：由 `auditMap` 維護，並注入至 commit message
- [x] 不允許 major version bump；每個 major range 獨立處理
- [x] 失敗時（install error）記錄錯誤後 continue，不中斷整體流程
- [x] 開 PR 而非直接 push；PR 標題、labels、base branch 均可設定

## 相關

- [[GitHub Actions]]
- [[Yarn]]
- [[npm audit]]
