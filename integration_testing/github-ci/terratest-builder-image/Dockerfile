FROM golang:1.26

ARG tf_version=1.14.7-1

RUN export DEBIAN_FRONTEND=noninteractive \
    && apt-get update -qqy \
    && apt-get install -qqy ca-certificates gnupg curl gettext lsb-release \
    && curl -s https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o/usr/share/keyrings/hashicorp-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" > /etc/apt/sources.list.d/hashicorp.list \
    && curl -s https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update -qqy \
    && apt-get install -qqy \
        google-cloud-cli \
        google-cloud-cli-kpt \
        google-cloud-sdk-gke-gcloud-auth-plugin \
        kubectl \
        terraform=${tf_version}

