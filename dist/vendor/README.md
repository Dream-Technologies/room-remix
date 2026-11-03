# Browser TypeScript transpiler

`sucrase.js` is the minified Sucrase 3.35.0 transform API bundled for the
TypeScript editor. It is committed so the editor works offline; users do not
install Sucrase or any other package. License: MIT, in `LICENSE`.

Rebuild from the repository root with Node.js and npm:

```sh
npx --yes --package=esbuild@0.24.0 --package=sucrase@3.35.0 -- sh -c 'NODE_PATH="$(dirname "$(dirname "$(command -v esbuild)")")" esbuild dist/vendor/sucrase-entry.js --bundle --minify --format=iife --global-name=sucrase --banner:js="/*! Sucrase 3.35.0 | MIT License; see dist/vendor/LICENSE */" --outfile=dist/vendor/sucrase.js'
```
