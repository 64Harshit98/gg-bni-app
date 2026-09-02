// functions/ has no eslint.config.js of its own, so ESLint 8's flat-config
// auto-detection walks up to the repo root's eslint.config.js (written for
// the frontend, on ESLint 9 / typescript-eslint v8) and applies it using the
// older @typescript-eslint packages installed here, which crashes rule
// loading. Forcing legacy mode makes ESLint use functions/.eslintrc.js
// instead, entirely locally. Set via a wrapper (not inline in package.json)
// because Windows cmd.exe doesn't support `VAR=value command` syntax.
process.env.ESLINT_USE_FLAT_CONFIG = "false";

const { execFileSync } = require("child_process");
const path = require("path");

// eslint's package.json "exports" map doesn't expose "./bin/eslint.js" as a
// resolvable subpath, so build the path from the package root instead of
// using require.resolve("eslint/bin/eslint.js") directly.
const eslintPkgDir = path.dirname(require.resolve("eslint/package.json"));
const eslintBin = path.join(eslintPkgDir, "bin", "eslint.js");

execFileSync(
    process.execPath,
    [eslintBin, "."],
    { stdio: "inherit", cwd: path.join(__dirname, ".."), env: process.env }
);
