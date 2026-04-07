# Changelog

## [1.0.4](https://github.com/TaopaiC/action-yarn-upgrade/compare/v1.0.3...v1.0.4) (2026-04-07)


### Bug Fixes

* use major.minor range for zero-major packages ([#126](https://github.com/TaopaiC/action-yarn-upgrade/issues/126)) ([a14fbad](https://github.com/TaopaiC/action-yarn-upgrade/commit/a14fbad2f3758dec8d10d51c00ebee94fc0ba9c5))

## [1.0.3](https://github.com/TaopaiC/action-yarn-upgrade/compare/v1.0.2...v1.0.3) (2026-04-07)


### Features

* add npmMinimalAgeGate input ([#118](https://github.com/TaopaiC/action-yarn-upgrade/issues/118)) ([5ca530e](https://github.com/TaopaiC/action-yarn-upgrade/commit/5ca530eef3b857754ca582f4b1a56f5f5ca72bf9))
* add severity input to filter yarn npm audit ([#123](https://github.com/TaopaiC/action-yarn-upgrade/issues/123)) ([b0c5474](https://github.com/TaopaiC/action-yarn-upgrade/commit/b0c5474517226302f2cc68b1dfdfef329b548899))


### Bug Fixes

* skip yarn berry audit entries flagged as deprecation ([#121](https://github.com/TaopaiC/action-yarn-upgrade/issues/121)) ([e32c12d](https://github.com/TaopaiC/action-yarn-upgrade/commit/e32c12d9e21c6bcc5669d230c5e3dc363f487abc))

## [1.0.2](https://github.com/TaopaiC/action-yarn-upgrade/compare/v1.0.1...v1.0.2) (2026-04-06)


### Bug Fixes

* validate npm package names in module_list input ([#109](https://github.com/TaopaiC/action-yarn-upgrade/issues/109)) ([995d621](https://github.com/TaopaiC/action-yarn-upgrade/commit/995d6213e70f836dc05bc5bbb25a60f2cfd0892c))
* validate workdir against GITHUB_WORKSPACE to prevent path traversal ([#98](https://github.com/TaopaiC/action-yarn-upgrade/issues/98)) ([f1650fb](https://github.com/TaopaiC/action-yarn-upgrade/commit/f1650fb31053b3b60a65fd12fc410b5bdd88c42b))

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
