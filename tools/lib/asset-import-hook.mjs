// Node module hook so tools can import browser-style packages (like EZ-Tree's source):
// `import x from "./file.jpg"` gives the file's absolute path, and extensionless
// relative imports ("./tree") resolve to "./tree.js".
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
    const url = new URL(`${specifier}.js`, context.parentURL);
    if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (/\.(jpe?g|png)$/i.test(url)) {
    return { format: "module", shortCircuit: true, source: `export default ${JSON.stringify(fileURLToPath(url))};` };
  }
  if (url.endsWith(".json")) return nextLoad(url, { ...context, importAttributes: { type: "json" } });
  return nextLoad(url, context);
}
