# Build trigger for E2E test

## Update Cloud Build config

gcloud beta builds triggers update github autoscaler-e2e-test --inline-config=cloudbuild.yaml

## Export entire trigger config

gcloud beta builds triggers export autoscaler-e2e-test --destination=trigger-exported.yaml

## Import entire trigger config

gcloud beta builds triggers import trigger-exported.yaml
