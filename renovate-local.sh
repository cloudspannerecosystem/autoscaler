#!/bin/bash

set -o errexit
set -o pipefail

# Runs renovate locally in dry-run mode, takes the output, and lists all the
# packages with updates available split by project.

# Prerequisites (if Docker is available):
#  'docker' command
# Prerequisites (if Docker is not available):
#  'jq' command line tool for json queries
#  'npx' from node.js/npm
# Optional prerequisite: 'pv' pipe progress viewer.
#

function ValidateBooleanVariable() {
  local -n VARIABLE_TO_VALIDATE
  VARIABLE_TO_VALIDATE="${1}"

  if [[ -z "${VARIABLE_TO_VALIDATE}" ]]; then
    echo "[ERROR] ${!VARIABLE_TO_VALIDATE} failed validation because it's not set or set to an empty value."
  fi

  if [[ "${VARIABLE_TO_VALIDATE}" != "true" ]] && [[ "${VARIABLE_TO_VALIDATE}" != "false" ]]; then
    echo "[ERROR] ${!VARIABLE_TO_VALIDATE} failed validation. Set ${!VARIABLE_TO_VALIDATE} to either true or false. It was set to: ${VARIABLE_TO_VALIDATE}"
    return 1
  else
    echo "${!VARIABLE_TO_VALIDATE} has a valid boolean string value: ${VARIABLE_TO_VALIDATE}"
  fi
}

declare -l DEFAULT_USE_DOCKER
if command -v docker >/dev/null; then
  echo "Docker is available on the system."
  DEFAULT_USE_DOCKER="true"
else
  echo "Docker is not available on the system."
  DEFAULT_USE_DOCKER="false"
fi

ValidateBooleanVariable "${!DEFAULT_USE_DOCKER@}"

declare -l USE_DOCKER
USE_DOCKER="${USE_DOCKER:-"${DEFAULT_USE_DOCKER}"}"
# We can use variable expansion now because we
echo "Checking ${!USE_DOCKER@}. You can set it to false to forcibly disable the usage of Docker. Otherwise, it defaults to true if Docker is available on the system."
ValidateBooleanVariable "${!USE_DOCKER@}"

if [[ "${USE_DOCKER}" == "true" ]] && [[ "${DEFAULT_USE_DOCKER}" == "false" ]]; then
  echo "Cannot force the use of Docker if it's not available on the system."
fi

if [[ "${USE_DOCKER}" == "false" ]]; then
  if ! command -v jq >/dev/null; then
    echo "The jq tool is not available. run: "
    echo "   sudo apt install jq"
    echo ""
    exit 1
  fi
  if ! command -v npx >/dev/null; then
    echo "The npx command is not available. Install npm using:"
    echo "   sudo apt install npm nodejs"
    echo "or use the nvm tool and install a custom version of node and npm in"
    echo "your local environment."
    echo "See https://github.com/nvm-sh/nvm#installing-and-updating"
    echo ""
    exit 1
  fi
fi

# Scripts for jqlang.org to parse the log line containing all the dependencies
# for all the package files,
#
# log line contains roughly the following structure:
# {
#   "config": {
#     // where repo-type is gradle, cloudbuild, docker, npm, pip etc...
#     "repo-type": [
#       // List of packageFiles with all their dependencies
#       {
#         "packageFile": "PACKAGE-FILE-NAME"
#         "deps": [
#           {
#             "depName": "DEPENDENCY_NAME",
#             "currentValue": "CURRENT_VERSION_VALUE",
#             ...
#             "updates": [
#               // Array is empty if no updates.
#               "bucket": "major|non-major",
#               "newValue": "NEW_VERSION_VALUE",
#               ...
#             ]
#           }
#         ]
#       }
#     ]
#   }
#   ...
# }

# Extract just an array of packagefile objects with their dependecies.
RENOVATE_OUTPUT_TO_JSON_DEPS_JQ_SCRIPT='
# Output is a JSON array
[
  # Take the input log line and extract config element.
  .config |
    # . is an object with a key for each repo type.
    #
    .[].[] |
    # . is a list of packagefile objects with their dependencies.

    # Filter out those with no deps.
    if  has("deps") then
        .
    else
        empty
    end
]
'

# From the array of packagefile objects, extract only those deps with updates.
JSON_DEPS_TO_JSON_UPDATES_JQ_SCRIPT='
# Output is a JSON array
[
  .[] |
    # . is an object with { packagefile: "xxx", deps: [] }
    # Output a concise result with just dependencies and update versions.
    {
        packageFile: .packageFile,
        deps: [
            .deps[] |
            if ( .updates | length > 0 ) then . else empty end | {
                depName: .depName,
                currentValue: .currentValue,
                updates: [
                    .updates[] |
                    {
                        bucket: .bucket,
                        newValue: .newValue
                    }
                ]
            }
        ]
    } |

    # Filter out those deps with no updates.
    if .deps | length > 0 then . else empty end
]
'

# From the array of packagefile objects, extract only those deprecated deps.
JSON_DEPS_TO_JSON_DEPRECATED_JQ_SCRIPT='
# Output is a JSON array
[
  .[] |
    # . is an object with { packagefile: "xxx", deps: [] }
    # Output a concise result with just dependencies and deprecation messages
    {
        packageFile: .packageFile,
        deps: [
            .deps[] |
            if has("deprecationMessage") then . else empty end | {
                depName: .depName,
                currentValue: .currentValue,
                deprecationMessage: .deprecationMessage,
            }
        ]
    } |

    # Filter out those deps with no updates.
    if .deps | length > 0 then . else empty end
]
'

# Convert the JSON deps with updates, to something human-readable
#
# $update in this line is incorrectly recognised as a shell-expansion.
# shellcheck disable=SC2016
JSON_UPDATES_TO_TEXT_JQ_SCRIPT='
.[] |
  .packageFile + ":",
  (
    .deps[] |
        "  " + .depName + ":\n    currentValue: \"" + .currentValue + "\"" + (
        reduce .updates[] as $update (""; . + "\n    " + $update.bucket + ": \"" + $update.newValue + "\"")
        )
  )
'

# Create a tempdir.
TMPDIR=$(mktemp --directory -t renovate-local-XXXXXXX)
trap 'echo "Processing renovate output failed. Tmpfiles in ${TMPDIR}"' ERR

# renovate: datasource=docker packageName=ghcr.io/jqlang/jq versioning=docker
JQ_VERSION="1.7.1"
# renovate: datasource=docker packageName=node versioning=docker
NODE_VERSION="22.2.0"
# renovate: datasource=npm packageName=renovate versioning=npm
RENOVATE_VERSION="37.429.1"

# Start in the root of the-repo.
roodir=$(dirname "$0")
cd "${rootdir}" || exit 1

echo "Running renovate. This can take some time..."
echo "Output will be saved in ${TMPDIR}"

RENOVATE_ARGUMENTS=(--platform=local --onboarding=false --dry-run=lookup)

if command -v pv >/dev/null; then
  # The Approx expected number of log lines when renovate does not have a cache
  # is about 2600 at time of writing.
  # When it does have a cache, this can be as low as 600 lines, but it also
  # depends on how old the cache is!
  declare -i NUM_RENOVATE_LINES
  NUM_RENOVATE_LINES=2600
  PVCMD=(pv --wait --progress --timer --line-mode --bytes --name renovate-output-lines --size "$NUM_RENOVATE_LINES")
else
  echo "If you want to see progress bars, run sudo apt install pv"
  PVCMD=(cat) # inefficient use of cat!
fi

RENOVATE_LOG_LEVEL=debug
RENOVATE_LOG_FORMAT=json
# Run renovate in dry run, with jsonl log output.
if [[ "${USE_DOCKER}" == "false" ]]; then
  RENOVATE_COMMAND=(env LOG_LEVEL="${RENOVATE_LOG_LEVEL}" LOG_FORMAT="${RENOVATE_LOG_FORMAT}")
  RENOVATE_COMMAND+=(npx --yes "renovate@${RENOVATE_VERSION}" "${RENOVATE_ARGUMENTS[@]}")
else
  RENOVATE_COMMAND=(docker run --rm)
  RENOVATE_COMMAND+=(--entrypoint="/bin/bash")
  RENOVATE_COMMAND+=(--env LOG_LEVEL="${RENOVATE_LOG_LEVEL}")
  RENOVATE_COMMAND+=(--env LOG_FORMAT="${RENOVATE_LOG_FORMAT}")
  RENOVATE_COMMAND+=(-v "$(pwd)":/usr/src/app:ro)
  RENOVATE_COMMAND+=(--workdir /usr/src/app)
  # Mount the renovate cache
  RENOVATE_CACHE_PATH=/tmp/renovate
  # Create the directory if not there already, otherwise Docker the Docker bind mounting
  # mechanism might create a file if it doesn't exist, instead
  mkdir --parents "${RENOVATE_CACHE_PATH}"
  RENOVATE_COMMAND+=(-v "${RENOVATE_CACHE_PATH}":"${RENOVATE_CACHE_PATH}")
  RENOVATE_COMMAND+=(node:"${NODE_VERSION}")

  RENOVATE_COMMAND+=(-e -x -c "
    apt-get -qyy update &&
    apt-get -qyy install git &&
    git config --global --add safe.directory /usr/src/app &&
    npm install --yes --global --no-save renovate@${RENOVATE_VERSION} &&
    renovate ${RENOVATE_ARGUMENTS[*]}")
fi
# RENOVATE_COMMAND+=(--platform=local --onboarding=false --dry-run=lookup)
echo "RENOVATE_COMMAND: ${RENOVATE_COMMAND[*]}"

RENOVATE_OUTPUT_FILE="${TMPDIR}/renovate-out.jsonl"
if ! "${RENOVATE_COMMAND[@]}" |
  "${PVCMD[@]}" >"${RENOVATE_OUTPUT_FILE}"; then
  echo "Renovate failed, check ${RENOVATE_OUTPUT_FILE}"
  exit 1
fi

# Get a user-readable summary line from the renovate output.
echo -n "Renovate found "
grep "flattened updates found" "${RENOVATE_OUTPUT_FILE}" | jq -r '.msg' | cut -d\  -f 1,2,3
echo ""

if [[ "${USE_DOCKER}" == "false" ]]; then
  JQ_COMMAND=(jq)
else
  JQ_COMMAND=()
  # Enable interactive mode (keep stdin open) so we can pipe output to jq
  JQ_COMMAND=(docker run --rm --interactive)
  JQ_COMMAND+=(--user="$(id --user):$(id --group)")
  JQ_COMMAND+=(--workdir /usr/src/app)
  JQ_COMMAND+=(-v "$(pwd)":/usr/src/app)
  JQ_COMMAND+=(ghcr.io/jqlang/jq:"${JQ_VERSION}")
fi
echo "JQ_COMMAND: ${JQ_COMMAND[*]}"

RENOVATE_DEPENDENCIES_FILE="${TMPDIR}/renovate-dependencies.json"
# Get the single line of log output with the dependency output into another tmpfile, and extract the deps.
grep '"baseBranch":.*"config":' <"${RENOVATE_OUTPUT_FILE}" |
  "${JQ_COMMAND[@]}" "${RENOVATE_OUTPUT_TO_JSON_DEPS_JQ_SCRIPT}" >"${RENOVATE_DEPENDENCIES_FILE}"

RENOVATE_PACKAGE_UPDATES_FILE="${TMPDIR}/package-updates.json"
# Get the updates.
"${JQ_COMMAND[@]}" "${JSON_DEPS_TO_JSON_UPDATES_JQ_SCRIPT}" <"${RENOVATE_DEPENDENCIES_FILE}" >"${RENOVATE_PACKAGE_UPDATES_FILE}"

RENOVATE_DEPRECATED_PACKAGES="${TMPDIR}/deprecated_packages.json"
# Get the deprecated
"${JQ_COMMAND[@]}" "${JSON_DEPS_TO_JSON_DEPRECATED_JQ_SCRIPT}" <"${RENOVATE_DEPENDENCIES_FILE}" >"${RENOVATE_DEPRECATED_PACKAGES}"

# Extract deps for each project in the output to separate files.
echo "The following dependency updates were found: "
echo ""

for project in $("${JQ_COMMAND[@]}" -r '.[].packageFile' <"${RENOVATE_PACKAGE_UPDATES_FILE}" | cut -d/ -f 1-2 | sort -u); do
  outfile_base="$TMPDIR/${project/\//-}.dependency-updates"
  # Extract package updates for a specific project to a single file.
  "${JQ_COMMAND[@]}" '[ .[] | objects | select(.packageFile | contains("'"${project}"'")) ]' <"${RENOVATE_PACKAGE_UPDATES_FILE}" >"${outfile_base}.json"
  # Make a human readable version
  "${JQ_COMMAND[@]}" -r "${JSON_UPDATES_TO_TEXT_JQ_SCRIPT}" <"${outfile_base}.json" >"${outfile_base}.text"

  # Summarize output
  echo "${project}: $(grep --count -F 'depName' <"${outfile_base}.json") updates, listed in:"
  echo "    ${outfile_base}.json"
  echo "    ${outfile_base}.text"
done

# Check for deprecated packages and report a summary.
if [[ -s "${RENOVATE_DEPRECATED_PACKAGES}" ]]; then
  echo ""
  echo "Deprecated packages were found in:"
  "${JQ_COMMAND[@]}" -r '.[] | .packageFile' <"${RENOVATE_DEPRECATED_PACKAGES}"
  echo ""
  echo "see details in ${RENOVATE_DEPRECATED_PACKAGES}"
fi
