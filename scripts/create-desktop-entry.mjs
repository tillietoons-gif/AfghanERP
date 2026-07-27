import { readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const publicDirectory = resolve(".output/public");
const assetsDirectory = resolve(publicDirectory, "assets");
const assetFiles = await readdir(assetsDirectory);
const entryScript = assetFiles.find((file) => /^index-[\w-]+\.js$/.test(file));
const stylesheet = assetFiles.find((file) => /^styles-[\w-]+\.css$/.test(file));

if (!entryScript || !stylesheet) {
  throw new Error("The desktop build could not find the generated client entry assets.");
}

const html = `<!doctype html>
<html lang="ps" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="icon" href="/favicon.ico" />
    <link rel="stylesheet" href="/assets/${stylesheet}" />
    <title>Dummy Friend ERP</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/assets/${entryScript}"></script>
  </body>
</html>
`;

await writeFile(resolve(publicDirectory, "index.html"), html);