import { fixPages } from "./lib.js";

import { createReadStream, createWriteStream, statSync } from "fs";
import { pipeline } from "stream";
import glob from "tiny-glob";
import { promisify } from "util";
import zlib from "zlib";

const pipe = promisify(pipeline);

/** @type {import('.')} */
export default function ({
  pages = "build",
  assets = pages,
  fallback,
  precompress = false,
  callbacks = undefined,
  copyBeforeSourceMapRemoval = undefined,
  removeSourceMap = false,
  removeBuiltInServiceWorkerRegistration = false,
  injectPagesInServiceWorker = false,
  injectDebugConsole = false,
} = {}) {
  const adapter = {
    name: "sveltejs-adapter-ipfs",

    async adapt(builder) {
      builder.rimraf(assets);
      builder.rimraf(pages);

      builder.writeClient(assets);
      builder.writePrerendered(pages, { fallback });

      // before compress or after ?
      await fixPages({
        pages,
        assets,
        callbacks,
        copyBeforeSourceMapRemoval,
        removeSourceMap,
        removeBuiltInServiceWorkerRegistration,
        injectPagesInServiceWorker,
        injectDebugConsole,
      });

      if (precompress) {
        if (pages === assets) {
          builder.log.minor("Compressing assets and pages");
          await compress(assets);
        } else {
          builder.log.minor("Compressing assets");
          await compress(assets);

          builder.log.minor("Compressing pages");
          await compress(pages);
        }
      }
    },
  };
  return adapter;
}

/**
 * @param {string} directory
 */
async function compress(directory) {
  const files = await glob("**/*.{html,js,json,css,svg,xml}", {
    cwd: directory,
    dot: true,
    absolute: true,
    filesOnly: true,
  });

  await Promise.all(
    files.map((file) =>
      Promise.all([compress_file(file, "gz"), compress_file(file, "br")])
    )
  );
}

/**
 * @param {string} file
 * @param {'gz' | 'br'} format
 */
async function compress_file(file, format = "gz") {
  const compress =
    format == "br"
      ? zlib.createBrotliCompress({
          params: {
            [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
            [zlib.constants.BROTLI_PARAM_QUALITY]:
              zlib.constants.BROTLI_MAX_QUALITY,
            [zlib.constants.BROTLI_PARAM_SIZE_HINT]: statSync(file).size,
          },
        })
      : zlib.createGzip({ level: zlib.constants.Z_BEST_COMPRESSION });

  const source = createReadStream(file);
  const destination = createWriteStream(`${file}.${format}`);

  await pipe(source, compress, destination);
}
