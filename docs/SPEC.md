# SPEC

## 概念

建立一個 [[GitHub Actions]]
workflow，自動升級指定 Node 套件，並記錄每個升級是否解決對應 CVE 問題。

## 輸入

- 接受 `module_list` input（comma separated），例如：`lodash,axios,express`
- 若未提供，則執行 `yarn npm audit --recursive` 或 `npm audit --recursive`
  取得有漏洞的套件清單，自動解析 module 名稱

## 升級流程（循序處理每個 module）

對每個 module 依序執行：

```bash
yarn add $module && yarn dedupe $module && git checkout packages.json
```

> [!important] 判斷邏輯
>
> - 若 `yarn.lock` **有異動** → 表示該 module 確實被升級，記錄為「已升級」
> - 若 `yarn.lock` **無異動** → 表示版本未變，記錄為「無需升級」

若 yarn.lock 有異動, 加入 stage

```bash
git add yarn.lock
```

> [!note] `git checkout packages.json`
> 是為了還原 package.json 的直接相依版本字串，只保留 yarn.lock 的鎖定升級結果。

## Commit 與紀錄

- 一次 `git commit` 包含所有升級的 `yarn.lock` 變更
- Commit message 格式：

```text
chore: bump node modules for CVE fixes

Upgraded:
- lodash: 4.17.20 → 4.17.21 (may resolve CVE-2021-23337)
- axios: 0.21.1 → 0.21.4 (may resolve CVE-2021-3749)

Not upgraded (no change in yarn.lock):
- express
```

## 待確認細節

- [ ] 如何從 `yarn npm audit --json` 解析 CVE 對應的 module
- [ ] 是否需要對 audit report 做 CVE ↔ module 的 mapping
- [ ] 是否允許 major version bump？預設只升 patch/minor
- [ ] 失敗時（install error）要怎麼處理，continue 還是 abort？
- [ ] 最後要不要開 PR 而不是直接 push？

## 相關

- [[GitHub Actions]]
- [[Yarn]]
- [[npm audit]]
