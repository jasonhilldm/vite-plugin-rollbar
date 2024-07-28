'use strict';

var fs = require('fs');
var path = require('path');
var glob = require('fast-glob');
var VError = require('verror');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var glob__default = /*#__PURE__*/_interopDefaultLegacy(glob);
var VError__default = /*#__PURE__*/_interopDefaultLegacy(VError);

const ROLLBAR_ENDPOINT = 'https://api.rollbar.com/api/1/sourcemap';

// Custom rollup plugin for uploading rollbar deploys

async function uploadSourcemap(form, { filename, rollbarEndpoint, silent }) {
  const errMessage = `Failed to upload ${filename} to Rollbar`;

  let res;
  try {
    res = await fetch(rollbarEndpoint, {
      method: 'POST',
      body: form
    });
  } catch (err) {
    // Network or operational errors
    throw new VError__default["default"](err, errMessage)
  }

  // 4xx or 5xx response
  if (!res.ok) {
    // Attempt to parse error details from response
    let details;
    try {
      const body = await res.json();
      details = body?.message ?? `${res.status} - ${res.statusText}`;
    } catch (parseErr) {
      details = `${res.status} - ${res.statusText}`;
    }

    throw new Error(`${errMessage}: ${details}`)
  }

  // Success
  if (!silent) {
    console.info(`Uploaded ${filename} to Rollbar`);
  }
}

function rollbarSourcemaps({
  accessToken,
  version,
  baseUrl,
  silent = false,
  rollbarEndpoint = ROLLBAR_ENDPOINT,
  ignoreUploadErrors = true,
  base = '/'
}) {
  let config;
  return {
    localProps: {
      accessToken,
      version,
      baseUrl,
      silent,
      rollbarEndpoint
    },
    name: 'vite-plugin-rollbar',
    resolveConfig(resolvedConfig) {
      config = resolvedConfig;
    },
    async writeBundle() {
      const outputDir = config.build.outDir;
      const files = await glob__default["default"]('./**/*.map', { cwd: outputDir });
      const sourcemaps = files
        .map((file) => {
          const sourcePath = file.replace(/\.map$/, '');
          const sourceFilename = path.resolve(outputDir, sourcePath);

          if (!fs.existsSync(sourceFilename)) {
            console.error(`No corresponding source found for '${file}'`, true);
            return null
          }

          const sourcemapLocation = path.resolve(outputDir, file);

          try {
            return {
              content: fs.readFileSync(sourcemapLocation, 'utf8'),
              sourcemap_url: sourcemapLocation,
              original_file: `${base}${sourcePath}`
            }
          } catch (error) {
            console.error(`Error reading sourcemap file ${sourcemapLocation}: ${error}`, true);
            return null
          }
        })
        .filter((sourcemap) => sourcemap !== null);

      if (!sourcemaps.length) return

      try {
        await Promise.all(
          sourcemaps.map((asset) => {
            const form = new FormData();

            form.set('access_token', accessToken);
            form.set('version', version);
            form.set('minified_url', `${baseUrl}${asset.original_file}`);
            form.set('source_map', new Blob([asset.content]), asset.original_file);

            return uploadSourcemap(form, {
              filename: asset.original_file,
              rollbarEndpoint,
              silent
            })
          })
        );
      } catch (error) {
        if (ignoreUploadErrors) {
          console.error('Uploading sourcemaps to Rollbar failed: ', error);
          return
        }
        throw error
      }
    }
  }
}

module.exports = rollbarSourcemaps;
//# sourceMappingURL=index.js.map
