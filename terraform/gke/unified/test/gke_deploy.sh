#!/bin/sh

# Copyright 2024 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

set -ex

export PROJECT_ID=$1
export REGION=$2
export TARGET_PU=$3

export REPO_ROOT=$(git rev-parse --show-toplevel)

# Build the image from the root of the repo

cd ${REPO_ROOT}

gcloud config set project ${PROJECT_ID}
gcloud container clusters get-credentials spanner-autoscaler --region=${REGION}
gcloud beta builds submit . --config=cloudbuild-unified.yaml --region=${REGION} \
    --service-account="projects/${PROJECT_ID}/serviceAccounts/build-sa@${PROJECT_ID}.iam.gserviceaccount.com"

SCALER_PATH="${REGION}-docker.pkg.dev/${PROJECT_ID}/spanner-autoscaler/scaler"
SCALER_SHA=$(gcloud artifacts docker images describe ${SCALER_PATH}:latest --format='value(image_summary.digest)')
SCALER_IMAGE="${SCALER_PATH}@${SCALER_SHA}"

# Render the manifests from the templates, note we cannot use kpt/envsubst for some operations

cd kubernetes/unified

for template in $(ls autoscaler-config/*.template) ; do envsubst < ${template} > ${template%.*} ; done
sed -i "s|image: scaler-image|image: ${SCALER_IMAGE}|" autoscaler-pkg/scaler/scaler.yaml
sed -i "s/minSize: 100/minSize: ${TARGET_PU}/" autoscaler-config/autoscaler-config.yaml

# Apply the manifests

kubectl apply -f autoscaler-pkg/otel-collector/otel-collector.yaml
kubectl apply -f autoscaler-pkg/scaler/scaler.yaml
kubectl apply -f autoscaler-config/otel-collector.yaml
kubectl apply -f autoscaler-config/autoscaler-config.yaml
