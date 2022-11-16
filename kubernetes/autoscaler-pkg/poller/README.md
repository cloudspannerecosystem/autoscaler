# poller

## Description
Config for Poller component of Spanner autoscaler

## Usage

### Fetch the package
`kpt pkg get REPO_URI[.git]/PKG_PATH[@VERSION] poller`
Details: https://kpt.dev/reference/cli/pkg/get/

### View package content
`kpt pkg tree poller`
Details: https://kpt.dev/reference/cli/pkg/tree/

### Apply the package
```
kpt live init poller
kpt live apply poller --reconcile-timeout=2m --output=table
```
Details: https://kpt.dev/reference/cli/live/
