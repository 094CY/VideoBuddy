// origin: 094CY/VideoBuddy
/** 本地开发配置：读取项目根 .env。环境变量优先，不覆盖已有值；生产由部署环境注入。 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(projectRoot, '.env');

if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const matched = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!matched) continue;
    const [, key, value] = matched;
    if (process.env[key] === undefined) {
      process.env[key] = value.replace(/^['"]|['"]$/g, '');
    }
  }
}
