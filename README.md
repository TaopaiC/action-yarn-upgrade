# Yarn CVE Auto-Upgrade Action

[![CI](https://github.com/TaopaiC/action-yarn-upgrade/actions/workflows/ci.yml/badge.svg)](https://github.com/TaopaiC/action-yarn-upgrade/actions/workflows/ci.yml)
[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

A GitHub Action that automatically upgrades yarn packages to resolve CVE
vulnerabilities, commits the resulting `yarn.lock` changes to a new branch, and
opens a pull request with a structured upgrade report.

## How It Works

1. If `module_list` is provided, those modules are upgraded immediately.
   Otherwise, the action runs `yarn npm audit --recursive --json` to discover
   vulnerable packages.
2. Each module is upgraded in sequence. All major versions present in
   `yarn.lock` are detected first (e.g. both `^8` and `^9`), and each major
   range is upgraded independently:
   - `yarn add <module>@^<major>` — upgrades within the same major version
   - `yarn dedupe <module>` — collapses duplicate resolutions
   - `git checkout package.json` — restores `package.json` so only `yarn.lock`
     changes are committed
   - `yarn` — re-syncs `node_modules` with the restored `package.json`
3. If `yarn.lock` changed for a module, it is staged and the change baseline
   is reset so the next module's check starts fresh.
4. All staged `yarn.lock` changes are committed in a single commit on a new
   timestamped branch (`chore/cve-upgrades-YYYYMMDD-HHmmss`), and a pull request
   is opened back to the original branch.

## Inputs

| Input          | Required | Default  | Description                                                                                                                                                      |
| -------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `module_list`  | No       | `''`     | Comma-separated list of npm module names to upgrade (e.g. `"lodash,axios"`). If omitted, `yarn npm audit` is used to discover vulnerable packages automatically. |
| `github_token` | **Yes**  |          | GitHub token used to create the pull request. Typically `secrets.GITHUB_TOKEN`.                                                                                  |
| `workdir`      | No       | `''`     | Working directory in which to run yarn and git commands. Defaults to the repository root.                                                                        |
| `base_branch`  | No       | `''`     | Target branch for the pull request. Defaults to the branch the action is running on.                                                                             |
| `pr_prefix`    | No       | `CHORE`  | Prefix used in the pull request title (e.g. `CHORE`, `fix`, `deps`).                                                                                            |
| `labels`       | No       | `''`     | Comma-separated list of labels to apply to the pull request (e.g. `"dependencies,security"`).                                                                    |

## Outputs

| Output   | Description                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------ |
| `report` | Human-readable upgrade summary listing which modules were upgraded, left unchanged, or failed.   |
| `pr_url` | URL of the pull request created with the `yarn.lock` changes. Empty if no modules were upgraded. |

## Usage

```yaml
name: CVE Auto-Upgrade

on:
  schedule:
    - cron: '0 9 * * 1' # Every Monday at 09:00 UTC
  workflow_dispatch:

jobs:
  upgrade:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version-file: .node-version

      - name: Install dependencies
        run: yarn install --immutable

      - name: Run CVE Auto-Upgrade
        id: upgrade
        uses: TaopaiC/action-yarn-upgrade@main
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}

      - name: Print report
        run: echo "${{ steps.upgrade.outputs.report }}"
```

### Upgrade specific modules only

```yaml
- name: Upgrade specific modules
  uses: TaopaiC/action-yarn-upgrade@main
  with:
    module_list: 'lodash,axios'
    github_token: ${{ secrets.GITHUB_TOKEN }}
```

## Commit & PR format

When one or more modules are upgraded, the action creates a single commit and
pull request:

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

> **Note:** When vulnerabilities are detected via `yarn npm audit` (Yarn Berry
> NDJSON format), advisory identifiers are GHSA IDs extracted from the advisory
> URL rather than traditional CVE numbers.

## Development

### Setup

```bash
npm install
```

### Run tests

```bash
npm run test
```

### Bundle

After modifying any file in `src/`, regenerate the `dist/` bundle:

```bash
npm run bundle
```
