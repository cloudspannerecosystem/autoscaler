# scaler

## Description
Config for Scaler component of Spanner Autoscaler

## Usage

### Fetch the package
`kpt pkg get REPO_URI[.git]/PKG_PATH[@VERSION] scaler`
Details: https://kpt.dev/reference/cli/pkg/get/

### View package content
`kpt pkg tree scaler`
Details: https://kpt.dev/reference/cli/pkg/tree/

### Apply the package
```
kpt live init scaler
kpt live apply scaler --reconcile-timeout=2m --output=table
```
Details: https://kpt.dev/reference/cli/live/
