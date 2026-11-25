/**
 * patch-rollup.cjs
 * macOS: rollup 预编译 .node 的 Team ID 与 Box/系统 node 不匹配时，
 * 让 native.js 在 dlopen 失败时自动 fallback 到 @rollup/wasm-node
 */
const fs = require('fs');
const path = require('path');

const nativePath = path.join(__dirname, '../node_modules/rollup/dist/native.js');
if (!fs.existsSync(nativePath)) process.exit(0);

const src = fs.readFileSync(nativePath, 'utf8');
const TARGET = 'const { parse, parseAsync, xxhashBase64Url, xxhashBase36, xxhashBase16 } = requireWithFriendlyError(';

if (src.includes(TARGET)) {
  const patched = src.replace(
    `const { parse, parseAsync, xxhashBase64Url, xxhashBase36, xxhashBase16 } = requireWithFriendlyError(\n\texistsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`\n);`,
    `let _native;
try {
\t_native = requireWithFriendlyError(
\t\texistsSync(path.join(__dirname, localName)) ? localName : \`@rollup/rollup-\${packageBase}\`
\t);
} catch (_err) {
\ttry { _native = require('@rollup/wasm-node'); } catch (_e2) { throw _err; }
}
const { parse, parseAsync, xxhashBase64Url, xxhashBase36, xxhashBase16 } = _native;`
  );
  fs.writeFileSync(nativePath, patched, 'utf8');
  console.log('[patch-rollup] native.js patched with wasm fallback');
} else {
  console.log('[patch-rollup] native.js already patched, skipping');
}
