# Build trigger for hourly cleanup

## Update Cloud Build config

gcloud beta builds triggers update github autoscaler-hourly-cleanup --inline-config=cloudbuild.yaml

## Export entire trigger config

gcloud beta builds triggers export autoscaler-hourly-cleanup --destination=trigger-exported.yaml

## Import entire trigger config

gcloud beta builds triggers import trigger-exported.yaml
