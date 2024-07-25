#!/bin/bash
#
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
#
#
set -e

SCRIPTDIR=$(dirname "$0")
cd "$SCRIPTDIR"

npm install --quiet
mkdir -p build
cp -r ../node_modules/js-yaml ../node_modules/vanilla-jsoneditor ../autoscaler-config.schema.json  build/

[[ "$1" == "--quiet" ]] ||  cat <<EOF

--------------------
Config editor built.
--------------------

Open the following link in a browser to use the config editor
   file://$(pwd)/index.html
or run:
   cd $(pwd)
   npx -y http-server -p 8080 -a 127.0.0.1
and then open http://127.0.0.1:8080

EOF
