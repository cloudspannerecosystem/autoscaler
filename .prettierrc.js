/* Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License
 */

const shared = {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'preserve',
  bracketSpacing: false,
  trailingComma: 'all',
  arrowParens: 'always',
  embeddedLanguageFormatting: 'off',
  bracketSameLine: true,
  singleAttributePerLine: false,
  jsxSingleQuote: false,
  htmlWhitespaceSensitivity: 'strict',
};

module.exports = {
  overrides: [
    {
      /** TSX/TS/JS-specific configuration. */
      files: '*.tsx',
      options: shared,
    },
    {
      files: '*.ts',
      options: shared,
    },
    {
      files: '*.js',
      options: shared,
    },
    {
      files: '*.md',
      options: shared,
    },
    {
      /** Sass-specific configuration. */
      files: '*.scss',
      options: {
        singleQuote: true,
      },
    },
    {
      files: '*.html',
      options: {
        printWidth: 100,
      },
    },
    {
      files: '*.acx.html',
      options: {
        parser: 'angular',
        singleQuote: true,
      },
    },
    {
      files: '*.ng.html',
      options: {
        parser: 'angular',
        singleQuote: true,
        printWidth: 100,
      },
    },
  ],
};
