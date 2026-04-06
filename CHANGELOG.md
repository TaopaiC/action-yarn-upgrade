# Changelog

## [1.0.1](https://github.com/TaopaiC/action-yarn-upgrade/compare/v1.0.0...v1.0.1) (2026-04-06)


### Bug Fixes

* align git commit title with PR title ([#92](https://github.com/TaopaiC/action-yarn-upgrade/issues/92)) ([2b2a53d](https://github.com/TaopaiC/action-yarn-upgrade/commit/2b2a53d01515c3251cf8d32aec14caea02cf0b39))

## 1.0.0 (2026-04-06)


### Features

* add pr_prefix and labels inputs to action ([14b5232](https://github.com/TaopaiC/action-yarn-upgrade/commit/14b5232c3a5ad8df5f3e4bf777f9f53707a6b250)), closes [#29](https://github.com/TaopaiC/action-yarn-upgrade/issues/29)
* add workdir input ([1ec7fa1](https://github.com/TaopaiC/action-yarn-upgrade/commit/1ec7fa153afd735f1b3dba4c1e0e57e86fd83384)), closes [#9](https://github.com/TaopaiC/action-yarn-upgrade/issues/9)
* implement yarn CVE auto-upgrade action ([4fc41cb](https://github.com/TaopaiC/action-yarn-upgrade/commit/4fc41cb887e958770b2678ad79e1b3f7ed75b398))
* run dedupe/restore/install per range; getCurrentVersions returns all versions ([7075307](https://github.com/TaopaiC/action-yarn-upgrade/commit/7075307828f3361f5d62363e3640ddef5426d387))
* upgrade each installed major version independently ([710ec7f](https://github.com/TaopaiC/action-yarn-upgrade/commit/710ec7f6e9b27306000074806be3dabf19887f5c))


### Bug Fixes

* parse yarn audit NDJSON and fix CI action trigger issues ([8d606ef](https://github.com/TaopaiC/action-yarn-upgrade/commit/8d606efe581eddebb59a9e5bdddae95d805bdc76))
* stage yarn.lock after each module upgrade ([9d3335f](https://github.com/TaopaiC/action-yarn-upgrade/commit/9d3335f09073bae583710605c81286bb05a225bb))
