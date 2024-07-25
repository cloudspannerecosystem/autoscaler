/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Support scripts for browser-based config editor.
 */

// eslint-disable-next-line
import {
  JSONEditor,
  createAjvValidator,
  renderJSONSchemaEnum,
  renderValue,
} from "./build/vanilla-jsoneditor/standalone.js";
import schema from "./build/autoscaler-config.schema.json" with { type: "json" };
import * as JsYaml from "./build/js-yaml/dist/js-yaml.mjs";

/** @typedef {import("vanilla-jsoneditor").Content} Content */

/** @type {JSONEditor} */
let editor;

/**
 * Checks if the JSON is valid, and if so, copy it to the YAML textarea.
 *
 * If it is not, but _is_ valid YAML, convert it to JSON and update both the
 * JSON editor and the YAML textarea.
 *
 * @param {Content} content
 * @param {Content} previousContent
 * @param {{
 *    contentErrors: import("vanilla-jsoneditor").ContentErrors | null,
 *    patchResult: import("vanilla-jsoneditor").JSONPatchResult | null
 *  }} changeStatus
 */
function jsonEditorChangeHandler(newcontent, previousContent, changeStatus) {
  const yamlTextarea = document.getElementById("yamlequivalent");

  if (changeStatus?.contentErrors?.parseError) {
    console.log(
      "jsonEditorChangeHandler - got JSON parsing errors %o",
      changeStatus.contentErrors,
    );
    if (newcontent.text?.search("\nkind: ConfigMap\n") >= 0) {
      // Check if it is valid YAML text to see if we need to convert it back
      // to JSON.
      try {
        const configMap = JsYaml.load(newcontent.text);
        if (
          configMap &&
          configMap.kind === "ConfigMap" &&
          configMap.data &&
          Object.values(configMap.data)[0]
        ) {
          // The autoscaler ConfigMap data is YAML stored as text in a YAML,
          // so we need to re-parse the data object.
          const configMapData = JsYaml.load(Object.values(configMap.data)[0]);
          console.log("got yaml configMap data object: %o", configMapData);

          // Asynchronously update the content with the parsed configmap data.
          // This is because JSON editor likes to finish the onchange before
          // anything else happens!
          setTimeout(() => {
            /** @type {Content} */
            const content = { json: configMapData };
            editor.updateProps({
              content,
              mode: "text",
              selection: null,
            });
            editor.refresh();
            // Trigger refresh of YAML textarea.
            updateYamlWithJsonContent(content);
          }, 100);
          return;
        }
      } catch (e) {
        console.log("not valid yaml " + e);
      }
    }
    // Some other unparsable JSON.
    yamlTextarea.setAttribute("disabled", "true");
  } else {
    // Got valid JSON, even if it might not be valid Autoscaler config, we
    // update the YAML version.
    updateYamlWithJsonContent(newcontent);
  }
}

/**
 * Converts the content from JSONEditor to YAML and stores it in the YAML
 * textarea.
 *
 * @param {Content} content
 */
function updateYamlWithJsonContent(content) {
  const yamlTextarea = document.getElementById("yamlequivalent");
  yamlTextarea.removeAttribute("disabled");
  const json = content.text ? JSON.parse(content.text) : content.json;

  const configMap = {
    apiVersion: "v1",
    kind: "ConfigMap",
    metadata: {
      name: "autoscaler-config",
      namespace: "spanner-autoscaler",
    },
    data: {
      // Autoscaler configmap.data is YAML as text.
      "autoscaler-config.yaml": JsYaml.dump(json, { lineWidth: -1 }),
    },
  };
  yamlTextarea.value = JsYaml.dump(configMap, { lineWidth: -1 });
}

/**
 * Handles addling rendering of Schema enums in JSONEditor.
 *
 * @param {import("vanilla-jsoneditor").RenderValueProps} props
 * @return {import("vanilla-jsoneditor").RenderValueComponentDescription[]}
 */
function onRenderValue(props) {
  return renderJSONSchemaEnum(props, schema) || renderValue(props);
}

/** @type {Content} */
const EXAMPLE_CONFIG = {
  json: [
    {
      $comment: "Sample autoscaler config",
      projectId: "my-project",
      instanceId: "my-instance",
      units: "NODES",
      minSize: 1,
      maxSize: 3,
      stateDatabase: {
        name: "firestore",
      },
      scalerPubSubTopic: "projects/my-project/topics/scaler-topic",
    },
  ],
};

/** Handles DOMContentLoaded event. */
function onDOMContentLoaded() {
  editor = new JSONEditor({
    target: document.getElementById("jsoneditor"),
    props: {
      content: EXAMPLE_CONFIG,
      mode: "text",
      schema,
      indentation: 2,
      validator: createAjvValidator({ schema }),
      onChange: jsonEditorChangeHandler,
      onRenderValue,
    },
  });
  updateYamlWithJsonContent(EXAMPLE_CONFIG);
  document.getElementById("loading").style.display = "none";
}

document.addEventListener("DOMContentLoaded", onDOMContentLoaded, false);
