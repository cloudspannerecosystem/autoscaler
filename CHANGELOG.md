# Changelog

## [4.0.0](https://github.com/cloudspannerecosystem/autoscaler/compare/v3.0.1...v4.0.0) (2024-12-23)


### ⚠ BREAKING CHANGES

* While v18 remains in maintenance until April 2025, several dependencies no longer support node 18.

### Features

* remove support for node v18 ([#415](https://github.com/cloudspannerecosystem/autoscaler/issues/415)) ([b967e47](https://github.com/cloudspannerecosystem/autoscaler/commit/b967e4707f18e1fb9fccecd4fb3f733602512f1d))


### Bug Fixes

* **deps:** add missing golang sums ([#425](https://github.com/cloudspannerecosystem/autoscaler/issues/425)) ([3591d6a](https://github.com/cloudspannerecosystem/autoscaler/commit/3591d6a7475f12e730fc8a554afbd0ed8c922faa))
* **deps:** update dependency express-jwt to ^8.5.1 ([#419](https://github.com/cloudspannerecosystem/autoscaler/issues/419)) ([11199d8](https://github.com/cloudspannerecosystem/autoscaler/commit/11199d86daa576e09c3c06cde61202172edbae02))
* **deps:** update golang-modules ([#423](https://github.com/cloudspannerecosystem/autoscaler/issues/423)) ([709caab](https://github.com/cloudspannerecosystem/autoscaler/commit/709caab402c5079eeeff94ffb157e6ec51cc0dcd))
* **deps:** update module github.com/sethvargo/go-envconfig to v1 ([#424](https://github.com/cloudspannerecosystem/autoscaler/issues/424)) ([8031f1f](https://github.com/cloudspannerecosystem/autoscaler/commit/8031f1f75ae819d9d5e21b5d7f3a3e83158ef503))
* **deps:** update module golang.org/x/crypto to v0.31.0 [security] ([b4d4cb6](https://github.com/cloudspannerecosystem/autoscaler/commit/b4d4cb6d5d47fc4fd61c81d24a09ccacec0698a3))
* **deps:** update module golang.org/x/net to v0.33.0 [security] ([#429](https://github.com/cloudspannerecosystem/autoscaler/issues/429)) ([ec4a8c7](https://github.com/cloudspannerecosystem/autoscaler/commit/ec4a8c73ab701a4763f653c25b8d8e41708c6397))
* **deps:** update npm-packages ([#416](https://github.com/cloudspannerecosystem/autoscaler/issues/416)) ([0b428e7](https://github.com/cloudspannerecosystem/autoscaler/commit/0b428e7709dea84a4f9a5bbe7e9c3408cd913567))
* **deps:** update npm-packages ([#417](https://github.com/cloudspannerecosystem/autoscaler/issues/417)) ([a9f8f35](https://github.com/cloudspannerecosystem/autoscaler/commit/a9f8f357126748b37f3e5f11ca13d2302a8a2963))
* **deps:** update npm-packages ([#427](https://github.com/cloudspannerecosystem/autoscaler/issues/427)) ([e7da5d4](https://github.com/cloudspannerecosystem/autoscaler/commit/e7da5d4a02677a08cf163d717b160331e9b1433c))
* **deps:** update npm-packages ([#428](https://github.com/cloudspannerecosystem/autoscaler/issues/428)) ([e9dc57a](https://github.com/cloudspannerecosystem/autoscaler/commit/e9dc57a1759913383569339ea1eae2a555c30486))
* **deps:** update terraform ([#414](https://github.com/cloudspannerecosystem/autoscaler/issues/414)) ([a9cd938](https://github.com/cloudspannerecosystem/autoscaler/commit/a9cd938949ce6383cab0bc26278a696f1fbd22d6))
* **deps:** update terraform google to v6.10.0 ([#412](https://github.com/cloudspannerecosystem/autoscaler/issues/412)) ([64621c2](https://github.com/cloudspannerecosystem/autoscaler/commit/64621c27f175478efe9d86ac2f295d7c196b88db))
* **deps:** update terraform module versions ([#406](https://github.com/cloudspannerecosystem/autoscaler/issues/406)) ([4490f61](https://github.com/cloudspannerecosystem/autoscaler/commit/4490f61ad314d7c91f22a809cf260b18256fa511))

## [3.0.1](https://github.com/cloudspannerecosystem/autoscaler/compare/v3.0.0...v3.0.1) (2024-10-31)


### Bug Fixes

* **deps:** update npm-packages ([#390](https://github.com/cloudspannerecosystem/autoscaler/issues/390)) ([e4e529f](https://github.com/cloudspannerecosystem/autoscaler/commit/e4e529f1dc50a8c71ae79f4990128b3ed2060fd7))
* **tf:** allow build SA to read AR ([#405](https://github.com/cloudspannerecosystem/autoscaler/issues/405)) ([988c6f5](https://github.com/cloudspannerecosystem/autoscaler/commit/988c6f59fb0b508293165d16c0d2ff960c75d574))
* **tf:** lock versions of terraform-google-modules kubernetes-engine ([#402](https://github.com/cloudspannerecosystem/autoscaler/issues/402)) ([0aac9d1](https://github.com/cloudspannerecosystem/autoscaler/commit/0aac9d157683d9763560aeb4b8388b2e1ab0cb3b))

## [3.0.0](https://github.com/cloudspannerecosystem/autoscaler/compare/v2.1.1...v3.0.0) (2024-10-27)


### ⚠ BREAKING CHANGES

* Use of Cloud Run Functions will require additional APIs to be enabled before redeploying - see the documentation for cloud functions deployment for the command to run.
* previous configs may fail due to stricter configuration validation, such as those that still use min/maxNodes, or that have specified a parameter incorrectly.
* Update metrics domain for CF to workload.googleapis.com

### Features

* Add JSON editor for schema-validated editing of configs ([#340](https://github.com/cloudspannerecosystem/autoscaler/issues/340)) ([6a167a3](https://github.com/cloudspannerecosystem/autoscaler/commit/6a167a31fe7e122afc49d1401d41efcbf275ae71))
* Add scaling duration dashboard ([#347](https://github.com/cloudspannerecosystem/autoscaler/issues/347)) ([874593f](https://github.com/cloudspannerecosystem/autoscaler/commit/874593fb49c5f48e83cc91c828ae6955efd3693d))
* Add validation of Autoscaler config against JSON schema ([#338](https://github.com/cloudspannerecosystem/autoscaler/issues/338)) ([66c48a6](https://github.com/cloudspannerecosystem/autoscaler/commit/66c48a63885bfb0a0e2e0ce026bdad6f54087128))
* update to use Cloud Run Functions ([#196](https://github.com/cloudspannerecosystem/autoscaler/issues/196)) ([f9480b0](https://github.com/cloudspannerecosystem/autoscaler/commit/f9480b0b94f10283880685b98d17bf5069c3b7bc))


### Bug Fixes

* add resource requests/limits to otel collector ([#398](https://github.com/cloudspannerecosystem/autoscaler/issues/398)) ([4a54fe2](https://github.com/cloudspannerecosystem/autoscaler/commit/4a54fe208f308d88ded4b57b733b9b094ec564ac))
* always specify Terraform project ([#384](https://github.com/cloudspannerecosystem/autoscaler/issues/384)) ([de5adb0](https://github.com/cloudspannerecosystem/autoscaler/commit/de5adb0cd81964d73307d98a3e8e1f7e7b76d63e))
* **deploy:** ensure build_sa iams are set before it can be used ([#394](https://github.com/cloudspannerecosystem/autoscaler/issues/394)) ([aa48048](https://github.com/cloudspannerecosystem/autoscaler/commit/aa48048c8a7efd0d699319eb0bdedda75cbd050e))
* **deps:** update dependency axios to v1.7.4 [security] ([#377](https://github.com/cloudspannerecosystem/autoscaler/issues/377)) ([f7ca3f0](https://github.com/cloudspannerecosystem/autoscaler/commit/f7ca3f07f42400b3e77f7c7ec54f8de243623179))
* **deps:** update dependency googleapis to v143 ([#379](https://github.com/cloudspannerecosystem/autoscaler/issues/379)) ([07b9ca4](https://github.com/cloudspannerecosystem/autoscaler/commit/07b9ca44046f91e402518bd4b8f9f17b2ebe4126))
* **deps:** update dependency googleapis to v144 ([#383](https://github.com/cloudspannerecosystem/autoscaler/issues/383)) ([c780a99](https://github.com/cloudspannerecosystem/autoscaler/commit/c780a9935a806348a16088a1a68458d4bdc41d25))
* **deps:** update sinon and nyc to resolve npm audit ([#386](https://github.com/cloudspannerecosystem/autoscaler/issues/386)) ([062992a](https://github.com/cloudspannerecosystem/autoscaler/commit/062992aa45822847834827ea34d1e3e930389d55))
* macos compatible xargs (-0 == --null) ([#392](https://github.com/cloudspannerecosystem/autoscaler/issues/392)) ([247a648](https://github.com/cloudspannerecosystem/autoscaler/commit/247a648057bcf30ddede810f9d675912a37bea04))
* use a custom service account for Cloud Build ([#387](https://github.com/cloudspannerecosystem/autoscaler/issues/387)) ([076a44f](https://github.com/cloudspannerecosystem/autoscaler/commit/076a44fcdb1398582fd28b61c3ced94ea3572e24))
* Use lightweight Spanner call to address memory leak ([#380](https://github.com/cloudspannerecosystem/autoscaler/issues/380)) ([5e85ecb](https://github.com/cloudspannerecosystem/autoscaler/commit/5e85ecb0b742fbffe570293db572cf00e35de16a))
* Version bump for security vuln ([#396](https://github.com/cloudspannerecosystem/autoscaler/issues/396)) ([0551694](https://github.com/cloudspannerecosystem/autoscaler/commit/05516944fd4646a1a97327fb59678078c5522265))

## [2.1.1](https://github.com/cloudspannerecosystem/autoscaler/compare/v2.1.0...v2.1.1) (2024-07-23)


### Bug Fixes

* Add workaround for Cloud Build SA updates ([#341](https://github.com/cloudspannerecosystem/autoscaler/issues/341)) ([4248b1a](https://github.com/cloudspannerecosystem/autoscaler/commit/4248b1a1400baa06cd99b0d8ca25a37dc52e706f))
* **deps:** update dependency @google-cloud/functions-framework to ^3.4.2 ([6bf77f7](https://github.com/cloudspannerecosystem/autoscaler/commit/6bf77f74821983b48ff62fc70ecb49ba946973d2))
* **deps:** update dependency @google-cloud/opentelemetry-cloud-monitoring-exporter to ^0.19.0 ([6bf77f7](https://github.com/cloudspannerecosystem/autoscaler/commit/6bf77f74821983b48ff62fc70ecb49ba946973d2))
* **deps:** update dependency @google-cloud/spanner to ^7.10.0 ([6bf77f7](https://github.com/cloudspannerecosystem/autoscaler/commit/6bf77f74821983b48ff62fc70ecb49ba946973d2))
* **deps:** update dependency mocha to 10.6.0 ([6bf77f7](https://github.com/cloudspannerecosystem/autoscaler/commit/6bf77f74821983b48ff62fc70ecb49ba946973d2))
* **deps:** update dependency pino to ^9.3.1 ([6bf77f7](https://github.com/cloudspannerecosystem/autoscaler/commit/6bf77f74821983b48ff62fc70ecb49ba946973d2))
* **deps:** update dependency typescript to 5.5.4 ([6bf77f7](https://github.com/cloudspannerecosystem/autoscaler/commit/6bf77f74821983b48ff62fc70ecb49ba946973d2))
* **deps:** update package versions ([#364](https://github.com/cloudspannerecosystem/autoscaler/issues/364)) ([6bf77f7](https://github.com/cloudspannerecosystem/autoscaler/commit/6bf77f74821983b48ff62fc70ecb49ba946973d2))
* Populate OpenTelemetry compression parameter ([#349](https://github.com/cloudspannerecosystem/autoscaler/issues/349)) ([d91fe50](https://github.com/cloudspannerecosystem/autoscaler/commit/d91fe506ddd5cf0b047ee45b34d081c63c1520fd))
* Retain defaulted scaling method name ([#363](https://github.com/cloudspannerecosystem/autoscaler/issues/363)) ([9cc106e](https://github.com/cloudspannerecosystem/autoscaler/commit/9cc106e93f0308f5805caba01598110f26d93137))
* Use ERROR loglevel for potentially non-fatal code path ([#351](https://github.com/cloudspannerecosystem/autoscaler/issues/351)) ([5f51453](https://github.com/cloudspannerecosystem/autoscaler/commit/5f5145383cae716276b2a26b8caecc6bbe9d5bea))

## [2.1.0](https://github.com/cloudspannerecosystem/autoscaler/compare/v2.0.1...v2.1.0) (2024-06-27)


### Features

* Add markdown link checker ([#316](https://github.com/cloudspannerecosystem/autoscaler/issues/316)) ([79a5da7](https://github.com/cloudspannerecosystem/autoscaler/commit/79a5da7b2c4599e56c17b1d8ae2678009000c386))
* Add metric for scaling duration ([#284](https://github.com/cloudspannerecosystem/autoscaler/issues/284)) ([3b49e4c](https://github.com/cloudspannerecosystem/autoscaler/commit/3b49e4c51fcbc2a21f09c19065436dc8f39d9158))
* Add npm run command for end-to-end tests, sort list ([#279](https://github.com/cloudspannerecosystem/autoscaler/issues/279)) ([85f37ac](https://github.com/cloudspannerecosystem/autoscaler/commit/85f37acd5730e19323d295a10d7c56ec229715d3))
* Take into account expectedFulfillmentPeriod ([#282](https://github.com/cloudspannerecosystem/autoscaler/issues/282)) ([9187ef9](https://github.com/cloudspannerecosystem/autoscaler/commit/9187ef9a17221be95c5b93868fd0b1620fae5569))
* Take into account number of databases in an instance ([#287](https://github.com/cloudspannerecosystem/autoscaler/issues/287)) ([56a3a28](https://github.com/cloudspannerecosystem/autoscaler/commit/56a3a280d12dc9f734afecbaa8d01f93c4453a06)), closes [#286](https://github.com/cloudspannerecosystem/autoscaler/issues/286)


### Bug Fixes

* **deps:** Bulk dependency update ([#304](https://github.com/cloudspannerecosystem/autoscaler/issues/304)) ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency @google-cloud/firestore to ^7.9.0 ([b9b3347](https://github.com/cloudspannerecosystem/autoscaler/commit/b9b3347f1f2dff81c8bf3c16642eacde57ebd604))
* **deps:** update dependency @google-cloud/firestore to v7.8.0 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency @google-cloud/firestore to v7.9.0 ([dc6f683](https://github.com/cloudspannerecosystem/autoscaler/commit/dc6f6836ec4a17001d4a73e0f2668e241408a1dc))
* **deps:** update dependency @google-cloud/functions-framework to v3.4.0 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency @google-cloud/logging-bunyan to v5.1.0 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency @google-cloud/monitoring to v4.1.0 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency @google-cloud/opentelemetry-cloud-monitoring-exporter to ^0.18.0 ([cdc8b39](https://github.com/cloudspannerecosystem/autoscaler/commit/cdc8b39145ae77fbb4d83359550222e4a454927e))
* **deps:** update dependency @google-cloud/pubsub to ^4.5.0 ([b9b3347](https://github.com/cloudspannerecosystem/autoscaler/commit/b9b3347f1f2dff81c8bf3c16642eacde57ebd604))
* **deps:** update dependency @google-cloud/pubsub to v4.4.1 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency @google-cloud/pubsub to v4.5.0 ([dc6f683](https://github.com/cloudspannerecosystem/autoscaler/commit/dc6f6836ec4a17001d4a73e0f2668e241408a1dc))
* **deps:** update dependency @google-cloud/spanner to ^7.9.1 ([b9b3347](https://github.com/cloudspannerecosystem/autoscaler/commit/b9b3347f1f2dff81c8bf3c16642eacde57ebd604))
* **deps:** update dependency @google-cloud/spanner to v7.8.0 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency @google-cloud/spanner to v7.9.1 ([dc6f683](https://github.com/cloudspannerecosystem/autoscaler/commit/dc6f6836ec4a17001d4a73e0f2668e241408a1dc))
* **deps:** update dependency axios to v1.7.2 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency googleapis to ^140.0.1 ([b9b3347](https://github.com/cloudspannerecosystem/autoscaler/commit/b9b3347f1f2dff81c8bf3c16642eacde57ebd604))
* **deps:** update dependency googleapis to v140 ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update dependency googleapis to v140.0.1 ([dc6f683](https://github.com/cloudspannerecosystem/autoscaler/commit/dc6f6836ec4a17001d4a73e0f2668e241408a1dc))
* **deps:** update dependency pino to ^9.2.0 ([b9b3347](https://github.com/cloudspannerecosystem/autoscaler/commit/b9b3347f1f2dff81c8bf3c16642eacde57ebd604))
* **deps:** update opentelemetry-js monorepo ([dc6f683](https://github.com/cloudspannerecosystem/autoscaler/commit/dc6f6836ec4a17001d4a73e0f2668e241408a1dc))
* **deps:** update opentelemetry-js monorepo (@opentelemetry/api, @opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/semantic-conventions) ([ea97fb0](https://github.com/cloudspannerecosystem/autoscaler/commit/ea97fb0ec999e160866f870e760351d49e93a4d7))
* **deps:** update opentelemetry-js monorepo (@opentelemetry/exporter-metrics-otlp-grpc, @opentelemetry/sdk-metrics, @opentelemetry/sdk-node, @opentelemetry/semantic-conventions) ([b9b3347](https://github.com/cloudspannerecosystem/autoscaler/commit/b9b3347f1f2dff81c8bf3c16642eacde57ebd604))
* **deps:** update opentelemetry-js monorepo to ^1.25.1 ([#328](https://github.com/cloudspannerecosystem/autoscaler/issues/328)) ([7d924b3](https://github.com/cloudspannerecosystem/autoscaler/commit/7d924b39c0b9df2bb3e080ff93cf6ed794c0187a))
* **deps:** Update package versions ([#326](https://github.com/cloudspannerecosystem/autoscaler/issues/326)) ([dc6f683](https://github.com/cloudspannerecosystem/autoscaler/commit/dc6f6836ec4a17001d4a73e0f2668e241408a1dc))
* Remove logline to console ([#275](https://github.com/cloudspannerecosystem/autoscaler/issues/275)) ([4972785](https://github.com/cloudspannerecosystem/autoscaler/commit/49727854e3591b451f5d53b9838c171f3322acdd))
* Remove zone parameter ([#276](https://github.com/cloudspannerecosystem/autoscaler/issues/276)) ([f51046a](https://github.com/cloudspannerecosystem/autoscaler/commit/f51046ac9e9a392082019c6608cb4c3720014949))
* replace Bunyan logger with Pino ([#288](https://github.com/cloudspannerecosystem/autoscaler/issues/288)) ([803fe1b](https://github.com/cloudspannerecosystem/autoscaler/commit/803fe1b2fc4bd3e7cd2f5ea81f89e196de893648))
* Resolve scaler memory leak when using Firestore ([#273](https://github.com/cloudspannerecosystem/autoscaler/issues/273)) ([e9d484a](https://github.com/cloudspannerecosystem/autoscaler/commit/e9d484a2d2add87921e9832a3c4f53ead9c712f7))
* Update OTEL GCM exporter and remove FAAS workaround ([#308](https://github.com/cloudspannerecosystem/autoscaler/issues/308)) ([cdc8b39](https://github.com/cloudspannerecosystem/autoscaler/commit/cdc8b39145ae77fbb4d83359550222e4a454927e))

## [2.0.1](https://github.com/cloudspannerecosystem/autoscaler/compare/v2.0.0...v2.0.1) (2024-04-04)


### Bug Fixes

* Correctly log Exceptions ([#267](https://github.com/cloudspannerecosystem/autoscaler/issues/267)) ([3e58052](https://github.com/cloudspannerecosystem/autoscaler/commit/3e5805225d906f60209c03afb5a68c98bfb4d2bc))

## [2.0.0](https://github.com/cloudspannerecosystem/autoscaler/compare/v1.21.1...v2.0.0) (2024-03-26)


### ⚠ BREAKING CHANGES

* Autoscaler v2.x is not backward compatible with v1.x. The older version will continue to be maintained in the version_1 branch
* Move to a single package.json at the top level ([#255](https://github.com/cloudspannerecosystem/autoscaler/issues/255))
* Spanner State Store requires DB schema update.
* Node v16 has been end-of-life since 2023-09-11, so testing is removed for this version of Node.

### Features

* Add metrics support for poller and scaler events ([#143](https://github.com/cloudspannerecosystem/autoscaler/issues/143)) ([4f68414](https://github.com/cloudspannerecosystem/autoscaler/commit/4f684148c7056d842120285f57316c3f9af29e42))
* Add monitoring of Scaling Long Running Operations ([#223](https://github.com/cloudspannerecosystem/autoscaler/issues/223)) ([41ac5e7](https://github.com/cloudspannerecosystem/autoscaler/commit/41ac5e7b8a1e8fac8fa8365ea419360761753b11))
* Add prettier auto-formatter ([9db2814](https://github.com/cloudspannerecosystem/autoscaler/commit/9db2814ffdc014f00607aa82aed56b979a4f47d2))
* Add Release Please ([#232](https://github.com/cloudspannerecosystem/autoscaler/issues/232)) ([c6e66b3](https://github.com/cloudspannerecosystem/autoscaler/commit/c6e66b3700092abb4d58e893d8b62e3f2634ee5f))
* Get version number from package.json for counters and user-agents ([e63dad4](https://github.com/cloudspannerecosystem/autoscaler/commit/e63dad49643808e0d8101a77fb2ca18a585fbf7a))
* Remove support for node v16 ([#242](https://github.com/cloudspannerecosystem/autoscaler/issues/242)) ([a5dc70c](https://github.com/cloudspannerecosystem/autoscaler/commit/a5dc70c07a53c20b96dc9b422b83b7b0ecc88fcf))


### Bug Fixes

* 108 - Fix for Firestore database create cmd. ([#113](https://github.com/cloudspannerecosystem/autoscaler/issues/113)) ([a49b35f](https://github.com/cloudspannerecosystem/autoscaler/commit/a49b35f63f296bbffcaccd8423047c56ae805024))
* Apply prettier reformatting ([a7915ef](https://github.com/cloudspannerecosystem/autoscaler/commit/a7915ef2746542e79faf13b1d346fda6fbba3b4c))
* **deps:** Bump @google-cloud/firestore to 7.3.1 ([2bb1d0e](https://github.com/cloudspannerecosystem/autoscaler/commit/2bb1d0e623109fe93c5b585c021094eb47ee36dd))
* **deps:** Bump @google-cloud/pubsub to 4.3.3 ([2bb1d0e](https://github.com/cloudspannerecosystem/autoscaler/commit/2bb1d0e623109fe93c5b585c021094eb47ee36dd))
* **deps:** Bump @google-cloud/spanner to 7.5.0 ([2bb1d0e](https://github.com/cloudspannerecosystem/autoscaler/commit/2bb1d0e623109fe93c5b585c021094eb47ee36dd))
* **deps:** Bump @sinonjs/referee to 11.0.1 ([2bb1d0e](https://github.com/cloudspannerecosystem/autoscaler/commit/2bb1d0e623109fe93c5b585c021094eb47ee36dd))
* **deps:** Bump express to 4.18.3 ([2bb1d0e](https://github.com/cloudspannerecosystem/autoscaler/commit/2bb1d0e623109fe93c5b585c021094eb47ee36dd))
* **deps:** Bump google.golang.org/protobuf ([#243](https://github.com/cloudspannerecosystem/autoscaler/issues/243)) ([e87d017](https://github.com/cloudspannerecosystem/autoscaler/commit/e87d017843b9eea68d5748155e2b2867581213bd))
* **deps:** Bump hashicorp/google to 5.20.0 ([8a656d8](https://github.com/cloudspannerecosystem/autoscaler/commit/8a656d83e1e1b4c7227496be87c120a125384f78))
* **deps:** Bump terraform-google-modules to 30.2.0 ([8a656d8](https://github.com/cloudspannerecosystem/autoscaler/commit/8a656d83e1e1b4c7227496be87c120a125384f78))
* **deps:** Update express to 4.19.2 ([#264](https://github.com/cloudspannerecosystem/autoscaler/issues/264)) ([9d05f34](https://github.com/cloudspannerecosystem/autoscaler/commit/9d05f34a06473f4cbf5651c9327e07c73959cf42))
* **deps:** Update package versions ([edcc219](https://github.com/cloudspannerecosystem/autoscaler/commit/edcc219d06c662bfee8d8ac481f9eb9aaea0febe))
* **deps:** Update package versions to latest ([2bb1d0e](https://github.com/cloudspannerecosystem/autoscaler/commit/2bb1d0e623109fe93c5b585c021094eb47ee36dd))
* **deps:** Update Terraform module versions ([#245](https://github.com/cloudspannerecosystem/autoscaler/issues/245)) ([8a656d8](https://github.com/cloudspannerecosystem/autoscaler/commit/8a656d83e1e1b4c7227496be87c120a125384f78))
* Migrate to using new docPath for Firestore including projectID ([#215](https://github.com/cloudspannerecosystem/autoscaler/issues/215)) ([3d9771d](https://github.com/cloudspannerecosystem/autoscaler/commit/3d9771d2afa3184ed7049e6ccf2aeec6fb387894)), closes [#213](https://github.com/cloudspannerecosystem/autoscaler/issues/213)
* Move to a single package.json at the top level ([#255](https://github.com/cloudspannerecosystem/autoscaler/issues/255)) ([e63dad4](https://github.com/cloudspannerecosystem/autoscaler/commit/e63dad49643808e0d8101a77fb2ca18a585fbf7a))
* Prevent metrics from being sent too frequently to OTEL collector ([#252](https://github.com/cloudspannerecosystem/autoscaler/issues/252)) ([bfe27c6](https://github.com/cloudspannerecosystem/autoscaler/commit/bfe27c63deb9e27bb21fb92174054b82b47bc143))
* Switch off newly defaulted deletion protection ([#256](https://github.com/cloudspannerecosystem/autoscaler/issues/256)) ([d0d6c81](https://github.com/cloudspannerecosystem/autoscaler/commit/d0d6c81423c09cce135dea01d04057629d0dfc26))
* Unified scaler GKE service yaml incorrect ([cd88492](https://github.com/cloudspannerecosystem/autoscaler/commit/cd88492993267ae3c266de3d509f5674fe4f34f0))
* Use Node 20 in Cloud Functions deployment ([96d6089](https://github.com/cloudspannerecosystem/autoscaler/commit/96d6089c3090272dfb3534752a70778c9256cc1d))
* Use Node 20 in GKE dockerfiles ([a481fb6](https://github.com/cloudspannerecosystem/autoscaler/commit/a481fb669f08639b306bc76ee497b6722a2cba10))


### Miscellaneous Chores

* Create version_1 branch and add release-please handling ([296c28a](https://github.com/cloudspannerecosystem/autoscaler/commit/296c28a393178a1052f30cebb2fb30a9f4873ecb))

## [1.21.2](https://github.com/cloudspannerecosystem/autoscaler/compare/v1.21.1...v1.21.2) (2024-03-26)


### Bug Fixes

* bump express from 4.18.3 to 4.19.1 in /src/forwarder ([#260](https://github.com/cloudspannerecosystem/autoscaler/issues/260)) ([75ab4e9](https://github.com/cloudspannerecosystem/autoscaler/commit/75ab4e9e2eed511cfee98491aeb5e3dbebfe2965))
* bump express from 4.18.3 to 4.19.1 in /src/poller/poller-core ([#259](https://github.com/cloudspannerecosystem/autoscaler/issues/259)) ([0e08295](https://github.com/cloudspannerecosystem/autoscaler/commit/0e082953bc6a1bc05d25e2acddcf6d52956ad2c9))
* bump express from 4.18.3 to 4.19.1 in /src/scaler/scaler-core ([#258](https://github.com/cloudspannerecosystem/autoscaler/issues/258)) ([310a676](https://github.com/cloudspannerecosystem/autoscaler/commit/310a676050696ff305fe957efb995019bebd435f))
* bump typescript from 5.4.2 to 5.4.3 ([#257](https://github.com/cloudspannerecosystem/autoscaler/issues/257)) ([c1ceaf3](https://github.com/cloudspannerecosystem/autoscaler/commit/c1ceaf31fd4eb4633b27c9cb1ebf147af8ac929b))
* **deps:** Update express to 4.19.2 ([#263](https://github.com/cloudspannerecosystem/autoscaler/issues/263)) ([095b1d6](https://github.com/cloudspannerecosystem/autoscaler/commit/095b1d6296587f4986e9e3ad9778caed125fb630))

## [1.21.1](https://github.com/cloudspannerecosystem/autoscaler/compare/cloudspannerecosystem/autoscaler-v1.21.0...cloudspannerecosystem/autoscaler-v1.21.1) (2024-03-20)


### Bug Fixes

* Prevent metrics from being sent too frequently to OTEL collector ([#251](https://github.com/cloudspannerecosystem/autoscaler/issues/251)) ([960b393](https://github.com/cloudspannerecosystem/autoscaler/commit/960b393698cf29bdda82971a94d1c1225a1e1ba9))

## [1.21.0](https://github.com/cloudspannerecosystem/autoscaler/compare/cloudspannerecosystem/autoscaler-v1.20.0...cloudspannerecosystem/autoscaler-v1.21.0) (2024-03-18)


### Features

* Add metrics support for poller and scaler events ([#143](https://github.com/cloudspannerecosystem/autoscaler/issues/143)) ([4f68414](https://github.com/cloudspannerecosystem/autoscaler/commit/4f684148c7056d842120285f57316c3f9af29e42))
* Add Release Please ([#232](https://github.com/cloudspannerecosystem/autoscaler/issues/232)) ([c6e66b3](https://github.com/cloudspannerecosystem/autoscaler/commit/c6e66b3700092abb4d58e893d8b62e3f2634ee5f))


### Bug Fixes

* bump axios from 1.6.7 to 1.6.8 in /src/poller/poller-core ([#249](https://github.com/cloudspannerecosystem/autoscaler/issues/249)) ([8f44d7d](https://github.com/cloudspannerecosystem/autoscaler/commit/8f44d7d61d680fb82fee8b4b0ee89ae4bacf72f3))
* bump follow-redirects from 1.15.5 to 1.15.6 in /src ([#248](https://github.com/cloudspannerecosystem/autoscaler/issues/248)) ([2c5f3f6](https://github.com/cloudspannerecosystem/autoscaler/commit/2c5f3f660d4dab45b19334031f90652c56a0fa84))
* bump follow-redirects from 1.15.5 to 1.15.6 in /src/poller ([#246](https://github.com/cloudspannerecosystem/autoscaler/issues/246)) ([d195916](https://github.com/cloudspannerecosystem/autoscaler/commit/d195916646cffbecc6f906af45955fdc3c03dffa))
* bump follow-redirects in /src/poller/poller-core ([#247](https://github.com/cloudspannerecosystem/autoscaler/issues/247)) ([e38f548](https://github.com/cloudspannerecosystem/autoscaler/commit/e38f54810c6a5936343989259492e775bf424e19))
* **deps:** Bump google.golang.org/protobuf ([#243](https://github.com/cloudspannerecosystem/autoscaler/issues/243)) ([9224e65](https://github.com/cloudspannerecosystem/autoscaler/commit/9224e655b8761c55be3551f1e8702a326d799014))
* Migrate to using new docPath for Firestore including projectID ([#215](https://github.com/cloudspannerecosystem/autoscaler/issues/215)) ([3d9771d](https://github.com/cloudspannerecosystem/autoscaler/commit/3d9771d2afa3184ed7049e6ccf2aeec6fb387894)), closes [#213](https://github.com/cloudspannerecosystem/autoscaler/issues/213)
