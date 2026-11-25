/**
 * 测试入口：用 esbuild 编译 TS 模块，再用 Node 内置断言验证。
 * 不引入额外测试框架依赖，npm test 即可运行。
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = mkdtempSync(join(tmpdir(), 'vb-test-'));
let passed = 0;
let failed = 0;

function check(name, fn) {
  try { fn(); passed++; console.log('  ✓', name); }
  catch (err) { failed++; console.error('  ✗', name, '\n    ', err.message); }
}
async function checkAsync(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (err) { failed++; console.error('  ✗', name, '\n    ', err.message); }
}

const store = {};
globalThis.localStorage = {
  getItem: (k) => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i) => Object.keys(store)[i] ?? null,
};
globalThis.window = { addEventListener() {}, location: { replace() {} } };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };

async function bundle(entry, name) {
  const file = join(out, name + '.mjs');
  await build({
    entryPoints: [join(root, 'src', entry)],
    bundle: true, format: 'esm', platform: 'node',
    outfile: file, logLevel: 'silent',
    alias: { '@': join(root, 'src') },
  });
  return import(file + '?t=' + Date.now());
}

console.log('\n[1] 工作流布局与节点规范化');
{
  const m = await bundle('lib/workflow-layout.ts', 'layout');
  const nodes = [
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 0, y: 0 } },
    { id: 'c', position: { x: 0, y: 0 } },
  ];
  const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
  const laidOut = m.layoutWorkflow(nodes, edges);
  check('按依赖分成 3 列', () => {
    assert.equal(new Set(laidOut.map((n) => n.position.x)).size, 3);
  });
  check('列距 >= 320，不与 320px 脚本节点重叠', () => {
    const xs = [...new Set(laidOut.map((n) => n.position.x))].sort((a, b) => a - b);
    assert.ok(xs[1] - xs[0] >= 320 && xs[2] - xs[1] >= 320);
  });
  check('同列节点行距 >= 200', () => {
    const grouped = {};
    for (const n of laidOut) (grouped[n.position.x] ||= []).push(n.position.y);
    for (const ys of Object.values(grouped)) {
      const sorted = ys.sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i] - sorted[i - 1] >= 200);
    }
  });
  const typed = m.fillNodeSubTypes([
    { id: 'i', type: 'image', data: {} },
    { id: 'a', type: 'audio', data: {} },
    { id: 'v', type: 'video', data: {} },
  ], [{ source: 'i', target: 'v' }]);
  check('图片/音频/视频子类型显式补齐', () => {
    assert.equal(typed[0].data.imageSubType, 'txt2img');
    assert.equal(typed[1].data.audioSubType, 'tts');
    assert.equal(typed[2].data.videoSubType, 'img2vid');
  });
}

console.log('\n[2] 模板与技能数据完整性');
{
  const t = await bundle('stores/template-store.ts', 'templates');
  const templates = t.useTemplateStore.getState().templates.filter((x) => x.isPublic);
  check('内置模板数量 >= 15', () => assert.ok(templates.length >= 15));
  for (const tpl of templates) {
    check(`模板 ${tpl.id} 起点可用、连线有效、子类型齐全、无重叠`, () => {
      const norm = t.normalizeTemplateWorkflow(tpl.workflowData);
      const byId = Object.fromEntries(norm.nodes.map((n) => [n.id, n]));
      const targets = new Set(norm.edges.map((e) => e.target));
      for (const n of norm.nodes.filter((x) => !targets.has(x.id))) {
        const d = n.data;
        const v = d.content ?? d.prompt ?? '';
        assert.ok(String(v).trim().length > 0, '起点内容为空');
        assert.ok(!String(v).includes('请输入'), '起点仍是占位提示');
      }
      assert.equal(norm.edges.filter((e) =>
        byId[e.source]?.type === 'audio' && byId[e.target]?.type === 'video').length, 0);
      for (const n of norm.nodes.filter((x) => ['image', 'audio', 'video'].includes(x.type))) {
        assert.ok(n.data.imageSubType || n.data.audioSubType || n.data.videoSubType);
      }
      for (let i = 0; i < norm.nodes.length; i++) {
        for (let j = i + 1; j < norm.nodes.length; j++) {
          const a = norm.nodes[i].position, b = norm.nodes[j].position;
          assert.ok(!(Math.abs(a.x - b.x) < 320 && Math.abs(a.y - b.y) < 200), '节点重叠');
        }
      }
    });
  }
  const sk = await bundle('stores/skill-store.ts', 'skills');
  const skills = sk.useSkillStore.getState().skills;
  check('8 个技能提示词均可构造且包含全部要点', () => {
    for (const s of skills) {
      const d = sk.buildSkillDirective(s.id);
      assert.ok(d.length > 60, s.id + ' 提示词过短');
      for (const p of s.stepLabels) assert.ok(d.includes(p), s.id + ' 缺少要点 ' + p);
    }
  });
  check('空技能返回空提示词', () => assert.equal(sk.buildSkillDirective(null), ''));
}

console.log('\n[3] 同步层：本机较新数据不被服务端旧值覆盖');
{
  const w = await bundle('lib/workspace-storage.ts', 'workspace-storage');
  const KEY = 'videobuddy-projects';
  const meta = {};
  meta[KEY] = { ts: Date.now(), dirty: true };
  store['videobuddy-sync-meta'] = JSON.stringify(meta);
  store[KEY] = JSON.stringify({ state: { projects: [{ id: 'local-new' }] } });

  w.applyWorkspaceItems({ [KEY]: { state: { projects: [{ id: 'server-old' }] } } });
  check('脏键保留本机较新值', () => {
    assert.ok(store[KEY].includes('local-new'));
  });
  w.finishTenantLoad();
  check('恢复同步后脏键进入待推送队列', () => {
    assert.ok(w.getSyncSnapshot().pendingKeys >= 1 || w.getSyncSnapshot().state === 'pending');
  });
  w.disableWorkspaceSync();
  delete store['videobuddy-sync-meta'];
  w.applyWorkspaceItems({ [KEY]: { state: { projects: [{ id: 'server-new' }] } } });
  check('干净键采用服务端值', () => {
    assert.ok(store[KEY].includes('server-new'));
  });
}

console.log('\n[4] 多租户账号：通用账号标识与数据隔离');
{
  process.env.VB_DATA_DIR = join(out, 'tenant-data');
  process.env.VB_ADMIN_ACCOUNT = 'admin';
  process.env.VB_ADMIN_PASSWORD = 'testpass26';
  const tenant = await bundle('../server/multi-tenant.js', 'tenant');
  const created = tenant.createUser({ account: '13800138000', name: '张三', password: 'testphone26' });
  check('手机号可作为账号', () => assert.equal(created.user.account, '13800138000'));
  const chinese = tenant.createUser({ account: '设计部-小李', name: '小李', password: 'testname26' });
  check('中文名称可作为账号', () => assert.equal(chinese.user.account, '设计部-小李'));
  check('重复账号被拒绝', () => {
    assert.ok(tenant.createUser({ account: 'admin', password: 'testdup26x' }).error);
  });
  check('空账号被拒绝', () => {
    assert.ok(tenant.createUser({ account: '   ', password: 'testblank26' }).error);
  });
  check('登录按通用账号校验', () => {
    assert.ok(tenant.login('13800138000', 'testphone26').user);
    assert.ok(tenant.login('bad', 'PhonePass123').error);
  });
  const wid = created.user.id;
  tenant.putWorkspaceItems(wid, { 'videobuddy-projects': { state: { projects: ['mine'] } } });
  const got = tenant.getWorkspace(wid);
  check('工作区按 userId 存取', () => {
    assert.deepEqual(got.items['videobuddy-projects'].state.projects, ['mine']);
  });
  const other = tenant.getWorkspace(chinese.user.id);
  check('不同账号工作区互不可见', () => {
    assert.equal(other.items['videobuddy-projects'], undefined);
  });
}


console.log('\n[5] 模型协议与接入预设');
{
  const c = await bundle('config/model-catalog.ts', 'catalog');
  check('预设含千问、方舟、DeepSeek 等主流接入', () => {
    const ids = c.SERVICE_PRESETS.map((x) => x.id);
    for (const id of ['bailian-openai', 'volcengine-ark', 'deepseek', 'zhipu', 'moonshot', 'minimax']) {
      assert.ok(ids.includes(id), '缺少预设 ' + id);
    }
  });
  check('每个预设地址合法、协议存在、含模型示例', () => {
    for (const preset of c.SERVICE_PRESETS) {
      if (preset.id !== 'custom') {
        assert.match(preset.baseUrl, /^https:\/\//, preset.id + ' 地址必须为 HTTPS');
        assert.ok(c.getProtocol(preset.protocol), preset.id + ' 协议不存在');
        assert.ok(preset.modelExamples.length > 0, preset.id + ' 缺模型示例');
      }
    }
  });
  check('协议端点可自动拼接', () => {
    assert.equal(c.getProtocol('openai').endpoints.text, '/chat/completions');
    assert.equal(c.getProtocol('anthropic').endpoints.text, '/messages');
    assert.equal(c.getProtocol('jimeng').endpoints.video, '/contents/generations/tasks');
  });
  check('历史协议 id 归一到现行协议', () => {
    assert.equal(c.normalizeProtocolId('zhipu'), 'openai');
    assert.equal(c.normalizeProtocolId('runway'), 'kling');
    assert.equal(c.normalizeProtocolId('jimeng'), 'jimeng');
  });
}

console.log('\n[6] 可插拔存储与服务端托管服务');
{
  const dbDir = mkdtempSync(join(tmpdir(), 'vb-store-'));
  process.env.VB_DATA_DIR = dbDir;
  process.env.DATABASE_URL = join(dbDir, 'store.db');
  process.env.VB_STORAGE_BACKEND = 'sqlite';
  const storage = await bundle('../server/storage.js', 'storage');
  await storage.initStorage();
  const st = storage.getStorage();
  check('SQLite 后端生效', () => assert.equal(st.kind, 'sqlite'));
  st.write('root', 'accounts', { admin: { id: 'u1' } });
  check('账号写入 SQLite 可读回', () => assert.equal(st.read('root', 'accounts').admin.id, 'u1'));
  st.write('workspace', 'u1/videobuddy-projects', { state: { projects: ['a'] } });
  check('工作区按用户键写入 SQLite', () =>
    assert.deepEqual(st.read('workspace', 'u1/videobuddy-projects').state.projects, ['a']));
  check('不同用户工作区互不可见', () =>
    assert.equal(st.read('workspace', 'u2/videobuddy-projects'), null));
  rmSync(dbDir, { recursive: true, force: true });

  process.env.VB_DATA_DIR = join(out, 'managed-data');
  process.env.VB_STORAGE_BACKEND = 'file';
  delete process.env.DATABASE_URL;
  const managed = await bundle('../server/managed-services.js', 'managed');
  const saved = managed.saveManagedConfig({
    services: [{ id: 's1', name: 'Qwen', protocol: 'openai',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKey: 'testapi26x' }],
    models: [{ id: 'm1', serviceId: 's1', modelId: 'qwen-plus', type: 'text' }],
    defaults: { text: { serviceId: 's1', modelId: 'qwen-plus' } },
  }, 'admin');
  check('托管配置保存到服务端', () => assert.equal(saved.services[0].apiKey, 'testapi26x'));
  check('对外视图不含明文密钥', () => {
    const pub = managed.publicManagedConfig();
    assert.equal(pub.services[0].apiKey, undefined);
    assert.ok(pub.services[0].keyMasked.includes('••••'));
  });
  check('托管域名视为已登记', () =>
    assert.ok(managed.isManagedServiceHost('dashscope.aliyuncs.com')));
  check('鉴权头由服务端按协议生成', () => {
    const svc = managed.findManagedService('s1');
    assert.equal(managed.authHeadersFor(svc).Authorization, 'Bearer testapi26x');
    assert.equal(managed.authHeadersFor({ ...svc, protocol: 'anthropic' })['x-api-key'], 'testapi26x');
  });
  check('连通性测试拼出真实端点', () => {
    const svc = managed.findManagedService('s1');
    const req = managed.buildTestRequest(svc, 'text', 'qwen-plus');
    assert.equal(req.url, 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions');
    assert.equal(req.body.model, 'qwen-plus');
  });
}



console.log('\n[7] 组件规范：单层容器与语义令牌');
{
  const { readFileSync } = await import('fs');
  const src = (rel) => readFileSync(join(root, 'src', rel), 'utf8');

  const input = src('components/ui/input.tsx');
  check('Input 基础组件无实线边框', () => {
    assert.ok(!/\bborder\s+/.test(input) && !/border-input/.test(input));
  });
  check('Input 使用语义令牌与柔和聚焦', () => {
    assert.ok(input.includes('bg-muted/60'));
    assert.ok(input.includes('focus-visible:ring-2'));
    assert.ok(!/#[0-9a-fA-F]{3,8}/.test(input));
  });

  const select = src('components/ui/select.tsx');
  check('Select 与 Input 同一套边框规范', () => {
    assert.ok(select.includes('border-0 bg-muted/60'));
    assert.ok(select.includes('focus-visible:ring-2'));
    assert.ok(!/border-indigo|#[0-9a-fA-F]{3,8}/.test(select));
  });

  const dashboard = src('pages/dashboard.tsx');
  check('首页输入卡有清晰细线外框，且只用语义令牌', () => {
    assert.ok(dashboard.includes('rounded-2xl border border-border bg-card'));
    assert.ok(!/bg-white dark:bg-\[#/.test(dashboard));
    assert.ok(!/border-gray-\d/.test(dashboard));
  });
  check('内层多行输入无边框、无阴影、聚焦不产生环', () => {
    const card = dashboard.slice(
      dashboard.indexOf('function InputBox'),
      dashboard.indexOf('export function DashboardPage'),
    );
    const line = card.split('\n').find((l) => l.includes('resize-none')) || '';
    assert.ok(line.includes('border-0'));
    assert.ok(line.includes('shadow-none'));
    assert.ok(!/onFocus=|inputFocused/.test(card));
  });
  check('首页不产生嵌套按钮', () => {
    const skillChip = dashboard.slice(
      dashboard.indexOf('function SkillQuickSelector'),
      dashboard.indexOf('function ModelQuickSelector'),
    );
    assert.ok(!/<button[\s\S]{0,400}<button/.test(skillChip));
  });

  const css = readFileSync(join(root, 'src', 'index.css'), 'utf8');
  check('全局聚焦态不画实线边框，且不作用于多行输入', () => {
    assert.ok(!/outline: 2px solid hsl\(var\(--ring\) \/ 0\.85\)/.test(css));
    assert.ok(css.includes('0 0 0 3px hsl(var(--ring) / 0.08)'));
    assert.ok(!/:where\([^)]*textarea[^)]*\):focus-visible/.test(css));
  });
  check('侧栏折叠态由 Logo 切换，无独立展开图标', () => {
    const layout = src('components/layout/MainLayout.tsx');
    assert.ok(!layout.includes('PanelLeftOpen'));
    assert.ok(layout.includes("aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}"));
  });


  // 不同场景使用不同规范，不把所有输入控件套成同一套样式
  const searchField = src('components/ui/search-field.tsx');
  check('搜索框按位置分变体，聚焦不使用高亮色', () => {
    assert.ok(searchField.includes("variant === 'sidebar'"));
    assert.ok(searchField.includes('border-border bg-background'));
    assert.ok(searchField.includes('border-transparent bg-muted/50'));
    assert.ok(searchField.includes('text-muted-foreground'));
    assert.ok(!/focus-visible:border-foreground|focus-visible:ring-ring/.test(searchField));
    assert.ok(!/violet|indigo|blue-500/.test(searchField));
  });
  check('五个搜索入口统一使用 L2 SearchField', () => {
    const files = ['pages/skills.tsx', 'pages/templates.tsx', 'pages/assets.tsx', 'components/layout/MainLayout.tsx'];
    const uses = files.reduce((n, f) => n + (src(f).match(/<SearchField/g) || []).length, 0);
    assert.equal(uses, 5);
  });
  check('列表页搜索框不再被透明背景与有色无宽边框抹掉', () => {
    for (const f of ['pages/skills.tsx', 'pages/templates.tsx', 'pages/assets.tsx']) {
      assert.ok(!/bg-transparent border-gray/.test(src(f)), f + ' 仍有透明搜索框');
    }
  });

  const assets = src('pages/assets.tsx');
  check('素材与产物空态复用 Empty 并居中铺满', () => {
    assert.ok(!/w-1\/2 mx-auto/.test(assets));
    assert.ok(!/max-w-3xl mx-auto/.test(assets));
    assert.ok((assets.match(/<EmptyHeader>/g) || []).length >= 2);
    assert.ok((assets.match(/<EmptyMedia/g) || []).length >= 2);
    const emptyComp = src('components/ui/empty.tsx');
    assert.ok(emptyComp.includes('items-center justify-center'));
    assert.ok(emptyComp.includes('text-center'));
    assert.ok(!/flex w-full items-center gap-5/.test(assets));
  });
  check('资产页内容卡片只用语义令牌', () => {
    assert.ok(!/bg-\[#|bg-white dark:bg-|border-gray-\d|text-gray-\d/.test(assets));
  });
  check('资产与产物网格列数一致', () => {
    assert.equal((assets.match(/grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5/g) || []).length, 2);
  });

  const entityCard = src('components/ui/entity-card.tsx');
  check('EntityCard 定义三段结构与中性标签', () => {
    assert.ok(entityCard.includes('data-slot="entity-card"'));
    assert.ok(entityCard.includes('border border-border/70 bg-card'));
    assert.ok(entityCard.includes('function CardTag'));
    assert.ok(!/bg-violet|bg-amber|bg-green/.test(entityCard));
  });
  check('四类内容卡片统一复用 EntityCard', () => {
    const users = {
      'pages/templates.tsx': '<EntityCard',
      'pages/skills.tsx': '<EntityCard',
      'pages/assets.tsx': '<EntityCard',
    };
    for (const [f, token] of Object.entries(users)) {
      assert.ok(src(f).includes(token), f + ' 未复用 EntityCard');
    }
    assert.equal((src('pages/assets.tsx').match(/<EntityCard/g) || []).length, 2);
    assert.ok(!/group rounded-xl border border-border\/60 bg-card overflow-hidden/.test(src('pages/assets.tsx')));
  });
  check('模板卡片不再有彩色节点标签', () => {
    assert.ok(!/nodeTypeColors/.test(src('pages/templates.tsx')));
  });

  const dialog = src('components/shared/global-settings-dialog.tsx');
  check('设置弹窗尺寸在克制区间', () => {
    assert.ok(dialog.includes("maxWidth: '1040px'"));
    assert.ok(dialog.includes("height: '84vh'"));
    assert.ok(!/maxWidth: '1180px'/.test(dialog));
  });

  const probes = await bundle('lib/local-models.ts', 'local-models');
  check('本地模型探测列表覆盖四个后端', () => {
    const ids = probes.LOCAL_BACKEND_PROBES.map((x) => x.id);
    assert.deepEqual(ids, ['ollama', 'lm-studio', 'mlx', 'mflux']);
  });
  await checkAsync('探测失败返回明确原因而非静默', async () => {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const r = await probes.detectLocalBackend(probes.LOCAL_BACKEND_PROBES[0]);
    assert.equal(r.status, 'offline');
    assert.ok(r.error && r.error.length > 0);
  });
}



console.log('\n[8] 模型分区、卡片与页面规范');
{
  const { readFileSync } = await import('fs');
  const src = (rel) => readFileSync(join(root, 'src', rel), 'utf8');

  const settings = src('pages/settings.tsx');
  check('模型设置分三个 Tab，来源不混排', () => {
    assert.ok(settings.includes('<Tabs defaultValue="local">'));
    for (const v of ['value="local"', 'value="personal"', 'value="team"']) {
      assert.ok(settings.includes(v), v);
    }
    assert.ok(!/团队共享服务（服务端托管）/.test(settings));
  });

  const card = src('components/ui/entity-card.tsx');
  check('内容卡片底部不画横线', () => {
    assert.ok(!/border-t/.test(card));
    assert.ok(card.includes('mt-auto pt-3 flex items-center justify-between'));
  });

  const assets = src('pages/assets.tsx');
  check('上传区紧凑且不写存储实现', () => {
    assert.ok(assets.includes('py-5 mt-4'));
    assert.ok(!/文件保存在服务端/.test(assets));
    assert.ok(!/py-12 mt-4/.test(assets));
  });
  check('页面不使用顶部副标题', () => {
    for (const f of ['pages/assets.tsx', 'pages/skills.tsx', 'pages/templates.tsx']) {
      assert.ok(!/管理项目中使用的|个已启用 · 技能会|选择模板快速开始/.test(src(f)), f);
    }
  });

  const layout = src('components/layout/MainLayout.tsx');
  check('历史项目用「…」菜单承载三项操作', () => {
    assert.ok(layout.includes('aria-label="项目操作"'));
    assert.ok(layout.includes('重命名') && layout.includes('复制项目') && layout.includes('删除项目'));
    assert.ok(layout.includes('updateProject'));
    assert.ok(!/title="复制"/.test(layout));
  });

  const server = readFileSync(join(root, 'server.js'), 'utf8');
  check('本地生图模型 ID 规范化到 CLI 参数', () => {
    assert.ok(server.includes("'flux.2-klein-4b': 'flux2-klein-4b'"));
    assert.ok(server.includes('function normalizeMfluxModel'));
    assert.ok(!server.includes('const validModels = ['));
  });


  const aiService = src('services/ai-service.ts');
  check('本地生图产物写入服务端素材目录', () => {
    assert.ok(aiService.includes('/api/assets/upload?name='));
    assert.ok(aiService.includes('application/octet-stream'));
  });
  const wizard = src('components/shared/first-run-wizard.tsx');
  check('首次引导识别本地模型与默认模型', () => {
    assert.ok(wizard.includes('hasLocalModel'));
    assert.ok(wizard.includes('hasDefaultModel'));
  });

  const runner = src('components/workspace/agent-runner.tsx');
  check('技能参与生图 Prompt 构造', () => {
    assert.ok(runner.includes('Boolean(skillDirective) || !isEnglishPrompt'));
    assert.ok(runner.includes('[userPrompt, skillDirective].filter(Boolean).join'));
    assert.ok(runner.includes('ic.isLocal ? 512 : 1024'));
  });
}



console.log('\n[9] 侧栏与登录页规范');
{
  const { readFileSync } = await import('fs');
  const src = (rel) => readFileSync(join(root, 'src', rel), 'utf8');

  const layout = src('components/layout/MainLayout.tsx');
  check('主导航与历史项目字号分级', () => {
    assert.ok(layout.includes('text-[14px] transition-colors w-full'));
    assert.ok(layout.includes('text-[13px] leading-snug'));
    assert.ok(layout.includes('text-[11px] text-muted-foreground flex-shrink-0'));
  });
  check('历史项目是可折叠主抽屉', () => {
    assert.ok(layout.includes('aria-expanded={historyOpen}'));
    assert.ok(layout.includes('ChevronDown') && layout.includes('ChevronRight'));
    assert.ok(layout.includes('flex-1 overflow-y-auto') && layout.includes('mt-5'));
    assert.ok(!/历史项目[\s\S]{0,200}border-t/.test(layout));
    assert.ok(!/!collapsed && projects.length > 0/.test(layout));
  });
  const sidebarStore = src('stores/sidebar-store.ts');
  check('抽屉状态持久化，且不影响折叠状态', () => {
    assert.ok(sidebarStore.includes('historyOpen: true'));
    assert.ok(sidebarStore.includes('agentOpen: true') && sidebarStore.includes('canvasOpen: true'));
    assert.ok(sidebarStore.includes('toggleAgent') && sidebarStore.includes('toggleCanvas'));
  });

  const login = src('pages/login.tsx');
  check('登录页固定暗色上下文并使用语义令牌', () => {
    assert.ok(login.includes('className="dark min-h-screen'));
    assert.ok(login.includes('bg-background text-foreground'));
    assert.ok(login.includes('text-muted-foreground'));
  });
  check('登录页无硬编码色与半透明文字色', () => {
    assert.ok(!/bg-\[#|from-indigo-|from-violet-|text-white\/|text-indigo-|text-white"/.test(login));
    assert.ok(!/accent=/.test(login));
  });
  check('登录页分隔线只占中间一小段', () => {
    assert.ok(login.includes('h-[45vh] min-h-[200px] max-h-[420px]'));
    assert.ok(!login.includes('w-px h-full'));
  });
  check('登录页分隔线长度适中', () => {
    assert.ok(!login.includes('w-px h-full'));
    assert.ok(login.includes('h-[45vh]'));
  });
  const templates = src('pages/templates.tsx');
  check('模板库搜索与筛选同行，首屏不空置', () => {
    assert.ok(templates.includes('px-6'));
    assert.ok(templates.includes('justify-between gap-3 mb-4'));
    assert.ok(!templates.includes('pt-7 pb-12'));
  });
  check('登录表单不使用浏览器原生校验气泡', () => {
    assert.ok(login.includes('noValidate'));
    assert.ok(!/onInvalid=/.test(login));
  });

  const spec = readFileSync(join(root, 'docs', '界面组件规范.md'), 'utf8');
  check('规范文件登记侧栏、登录页与变更约束', () => {
    assert.ok(spec.includes('## 侧栏') && spec.includes('## 登录页'));
    assert.ok(spec.includes('## 变更登记'));
    assert.ok(spec.includes('对比度 ≥ 4.5:1'));
  });
}



console.log('\n[10] 会话稳定性');
{
  const { readFileSync } = await import('fs');
  const server = readFileSync(join(root, 'server', 'multi-tenant.js'), 'utf8');
  check('会话上限不挤掉有效期内的设备', () => {
    assert.ok(server.includes('const MAX_SESSIONS_PER_USER = 100'));
    assert.ok(server.includes('expiresAt <= now') && server.includes('delete all[k]'));
    assert.ok(server.includes('lastSeen: now'));
  });

  const session = readFileSync(join(root, 'src', 'lib', 'session.ts'), 'utf8');
  check('网络抖动重试且不清除登录态与工作区', () => {
    assert.ok(session.includes('for (let attempt = 0; attempt < 3; attempt++)'));
    assert.ok(session.includes("if (!res) return 'error';"));
    const bootstrap = session.slice(session.indexOf('export async function bootstrapSession'), session.indexOf('/** 登录：'));
    assert.ok(!bootstrap.includes('clearLocalWorkspace()'));
  });
  check('401 只清身份，保留本机工作区', () => {
    const branch = session.slice(
      session.indexOf("if (res.status === 401 || res.status === 403)"),
      session.indexOf("return 'anonymous';"),
    );
    assert.ok(branch.includes('useAuthStore.setState'));
    assert.ok(!branch.includes('clearLocalWorkspace'));
  });
}



console.log('\n[11] Agent 工作台');
{
  const { readFileSync, existsSync: fsExists } = await import('fs');
  const src = (rel) => readFileSync(join(root, 'src', rel), 'utf8');

  const workspace = src('pages/workspace.tsx');
  check('任务记录与结果在同一页面，不进入返回页', () => {
    assert.ok(!workspace.includes('AgentTaskList'));
    assert.ok(workspace.includes('flex-1 flex overflow-hidden'));
    assert.ok(!workspace.includes('d="M15 19l-7-7 7-7"'));
    assert.ok(workspace.includes('新任务'));
  });

  const app = src('App.tsx');
  const layout = src('components/layout/MainLayout.tsx');
  const taskPage = src('pages/agent-task.tsx');
  const dashboard = src('pages/dashboard.tsx');
  check('Agent 任务挂在主布局内，复用侧栏历史项目', () => {
    assert.ok(app.includes('path="/task/:id"'));
    assert.ok(layout.includes('navigate(`/task/${project.id}?outputType='));
    assert.ok(layout.includes("location.pathname.startsWith('/task/')"));
    assert.ok(dashboard.includes('navigate(`/task/${proj.id}?outputType='));
    assert.ok(!taskPage.includes('d="M15 19l-7-7 7-7"') && !taskPage.includes('AgentTaskList'));
    assert.ok(taskPage.includes('<AgentRunner'));
    assert.ok(!fsExists(join(root, 'src/components/workspace/agent-task-list.tsx')));
  });

  const runner = src('components/workspace/agent-runner.tsx');
  check('Agent 为左对话、右结果的左右两栏', () => {
    assert.ok(runner.includes('flex h-full bg-background'));
    assert.ok(runner.includes('style={{ width: `${leftPercent}%` }}'));
    assert.ok(runner.includes('左：任务需求、进度与继续对话'));
    assert.ok(runner.includes('右：结果铺满剩余区域'));
    assert.ok(!runner.includes('执行进度') && !runner.includes('过程记录'));
    assert.ok(runner.includes('查看优化后的 Prompt'));
    assert.ok(!runner.includes('max-w-[520px]'));
    assert.ok(runner.includes('h-full w-full object-contain'));
  });

  check('左栏为完整信息流，不用卡片', () => {
    for (const t of ['任务需求', '执行过程', '查看生成提示词', '对话记录']) {
      assert.ok(runner.includes(t), t);
    }
    assert.ok(runner.includes('stages.map'));
    const info = runner.slice(runner.indexOf('任务需求</h4>'), runner.indexOf('对话记录'));
    assert.ok(!info.includes('border border-border/60 bg-card'));
  });
  check('对话输入为带框容器，按钮内嵌且复用基础组件', () => {
    assert.ok(runner.includes('data-slot="agent-composer"'));
    assert.ok(runner.includes('<Textarea') && runner.includes('<Button'));
    assert.ok(runner.includes('aria-label="发送"'));
    assert.ok(!runner.includes('flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-primary'));
  });

  check('四类任务结果共用一套数据结构与展示分支', () => {
    for (const t of ["type: 'image'", "type: 'video'", "type: 'audio'", "type: 'text'"]) {
      assert.ok(runner.includes(t), t);
    }
    assert.ok(runner.includes('selected.type === '));
    assert.ok(runner.includes('results.length > 1') && runner.includes('setSelectedId'));
    assert.ok(runner.includes('RESULT_LABEL'));
  });
  check('产物按任务名归属，切换任务可读回结果', () => {
    assert.ok(runner.includes('sourceProject: projectName'));
    assert.ok(runner.includes("a.sourceProject === projectName"));
  });

  const spec = readFileSync(join(root, 'docs', '界面组件规范.md'), 'utf8');
  check('Agent 工作台规范已登记', () => {
    assert.ok(spec.includes('## Agent 工作台'));
    assert.ok(spec.includes('不设返回箭头'));
  });
}



console.log('\n[12] 任务记录分组与画布主布局');
{
  const { readFileSync } = await import('fs');
  const src = (rel) => readFileSync(join(root, 'src', rel), 'utf8');

  const layout = src('components/layout/MainLayout.tsx');
  check('任务记录主抽屉下有两个可折叠子抽屉', () => {
    assert.ok(layout.includes("'nav.agentTasks'") && layout.includes("'nav.canvasProjects'"));
    assert.ok(layout.includes('aria-expanded={agentOpen}') && layout.includes('aria-expanded={canvasOpen}'));
    assert.ok(layout.includes("p.taskMode === 'agent'"));
    assert.ok(layout.includes('renderProjectRow(project)'));
  });
  const i18n = src('lib/i18n.ts');
  check('侧栏文案为任务记录与两个子分组', () => {
    assert.ok(i18n.includes("'nav.history': '任务记录'"));
    assert.ok(i18n.includes("'nav.canvasProjects': '画布项目'"));
  });

  const app = src('App.tsx');
  const workspace = src('pages/workspace.tsx');
  const header = src('components/workspace/workspace-header.tsx');
  const dashboard = src('pages/dashboard.tsx');
  check('画布项目挂在主布局并隐藏返回箭头', () => {
    assert.ok(app.includes('path="/canvas/:id"'));
    assert.ok(workspace.includes("location.pathname.startsWith('/canvas/')"));
    assert.ok(workspace.includes('hideBack={inMainLayout}'));
    assert.ok(header.includes('hideBack'));
    assert.ok(dashboard.includes('navigate(`/canvas/${proj.id}`)'));
    assert.ok(layout.includes('navigate(`/canvas/${project.id}`)'));
  });


  const templates = src('pages/templates.tsx');
  const skills = src('pages/skills.tsx');
  check('模板库与技能库卡片统一三列', () => {
    const grid = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3';
    assert.ok(templates.includes(grid));
    assert.ok(skills.includes(grid));
    assert.ok(!templates.includes('xl:grid-cols-4'));
  });

  const spec = readFileSync(join(root, 'docs', '界面组件规范.md'), 'utf8');
  check('规范登记子抽屉、画布主布局与两区结构', () => {
    assert.ok(spec.includes('子抽屉'));
    assert.ok(spec.includes('/canvas/:id'));
    assert.ok(spec.includes('只有「内容流」与「结果」两栏'));
  });
}





console.log('\n[13] 单次执行、状态机与模型持久性');
{
  const { readFileSync } = await import('fs');
  const src = (rel) => readFileSync(join(root, 'src', rel), 'utf8');

  const runner = src('components/workspace/agent-runner.tsx');
  check('同一任务同时只允许一个执行，且不重复自动启动', () => {
    assert.ok(runner.includes('const activeRuns = new Set<string>()'));
    assert.ok(runner.includes('activeRuns.has(lockKey)'));
    assert.ok(runner.includes('activeRuns.delete(lockKey)'));
    assert.ok(runner.includes('autoStartedRef'));
    assert.ok(runner.includes('hasPriorRun'));
    assert.ok(runner.includes('taskArtifacts.length > 0'));
  });
  check('执行状态机与 spinner 清理', () => {
    assert.ok(runner.includes("type RunStatus"));
    assert.ok(runner.includes("cancelled: '已暂停'"));
    assert.ok(runner.includes('hasPayload') && runner.includes('thinking: undefined'));
    assert.ok(runner.includes('已暂停生成'));
  });
  check('模型由下拉选择，缺模型不弹页面提示', () => {
    assert.ok(runner.includes('aria-label="任务类型"') && runner.includes('aria-label="生成模型"'));
    assert.ok(!runner.includes('toast.error(`未设置默认'));
    assert.ok(runner.includes('modelRef') && runner.includes('onModelChange'));
  });
  check('结果只在右栏，左栏不渲染媒体', () => {
    const left = runner.slice(runner.indexOf('左：任务需求'), runner.indexOf('右：四类任务结果'));
    assert.ok(!left.includes('msg.imageUrl') && !left.includes('msg.videoUrl') && !left.includes('msg.audioUrl'));
    assert.ok(runner.includes('查看优化后的 Prompt'));
  });

  const taskPage = src('pages/agent-task.tsx');
  check('任务记录执行结果并沿用创建时模型', () => {
    assert.ok(taskPage.includes('hasPriorRun={Boolean(project.agentRun)}'));
    assert.ok(taskPage.includes('agentRun: { status'));
    assert.ok(taskPage.includes('modelRef={project.modelRef}'));
  });

  const artifacts = src('stores/artifact-store.ts');
  check('产物写入去重且恢复时收敛', () => {
    assert.ok(artifacts.includes('const duplicate = state.items.some'));
    assert.ok(artifacts.includes('merge:'));
    assert.ok(artifacts.includes('perTask[key] <= 3'));
  });

  const storage = src('lib/workspace-storage.ts');
  check('默认模型不被服务端快照清空', () => {
    assert.ok(storage.includes("key === 'videobuddy-models'"));
    assert.ok(storage.includes('hasLocalChoice'));
    assert.ok(storage.includes("if (!items['videobuddy-models']"));
  });

  const login = src('pages/login.tsx');
  check('登录密码支持显示切换', () => {
    assert.ok(login.includes('showPassword') && login.includes('EyeOff'));
    assert.ok(login.includes("type={showPassword ? 'text' : 'password'}"));
  });

  const header = src('components/workspace/workspace-header.tsx');
  const agentHeader = src('pages/agent-task.tsx');
  check('顶部无分隔线，Agent 页无新任务入口', () => {
    assert.ok(!header.includes('border-b border-border flex items-center'));
    assert.ok(!agentHeader.includes('新任务'));
    assert.ok(!agentHeader.includes('border-b'));
  });

  const spec = readFileSync(join(root, 'docs', '界面组件规范.md'), 'utf8');


  check('对话输入无灰块与快捷键提示', () => {
    assert.ok(!runner.includes('Enter 发送 · Shift + Enter 换行'));
    assert.ok(runner.includes('hover:bg-transparent focus-visible:bg-transparent'));
  });
  check('结果卡铺满右栏，分界线在左右栏之间', () => {
    assert.ok(runner.includes('flex-1 min-w-0 flex p-3'));
    assert.ok(!runner.includes('mx-auto') && !runner.includes('mr-auto'));
    assert.ok(!runner.includes('videobuddy-agent-result-width'));
    assert.ok(runner.includes('videobuddy-agent-split'));
    assert.ok(runner.includes('aria-label="调整左右面板宽度"'));
    assert.ok(runner.includes('leftPercent'));
    assert.ok(runner.includes('onPointerDown') && runner.includes('cursor-col-resize'));
  });
  const dashboard = readFileSync(join(root, 'src', 'pages', 'dashboard.tsx'), 'utf8');
  check('模式切换为输入卡正上方居中的连体胶囊', () => {
    assert.ok(dashboard.includes("'Agent模式'") && dashboard.includes("'画布模式'"));
    assert.ok(dashboard.includes('flex justify-center mb-7'));
    assert.ok(dashboard.includes('inline-flex items-center gap-1 rounded-full bg-muted p-1'));
    assert.ok(dashboard.includes('text-[13px]') && dashboard.includes('rounded-full'));
    const head = dashboard.slice(dashboard.indexOf('function InputBox'), dashboard.indexOf('className="rounded-2xl border border-border bg-card shadow-sm"'));
    assert.ok(head.includes('Agent模式'));
  });
  check('输入卡工具项左对齐', () => {
    assert.ok(dashboard.includes('flex items-center gap-2 flex-1 min-w-0'));
    assert.ok(!dashboard.includes('p-0.5 rounded-lg bg-muted'));
  });


  const layout = readFileSync(join(root, 'src', 'components', 'layout', 'MainLayout.tsx'), 'utf8');
  check('任务页不高亮主导航', () => {
    assert.ok(layout.includes('const isActive = !onTaskPage && item.key === activePanel'));
    assert.ok(layout.includes("if (location.pathname.startsWith('/task/')"));
  });

  check('规范登记内容流、输入容器、右栏与模式切换', () => {
    const spec = readFileSync(join(root, 'docs', '界面组件规范.md'), 'utf8');
    assert.ok(spec.includes('左栏 · 分区') && spec.includes('对话输入'));
    assert.ok(spec.includes('任务概览卡') && spec.includes('对话记录'));
    assert.ok(spec.includes('不居中、不设左右留白'));
    assert.ok(spec.includes('可拖拽分界线'));
    assert.ok(spec.includes('连体胶囊容器'));
    assert.ok(spec.includes('新建任务输入'));
  });

  check('规范登记单次执行、状态机与模型默认值', () => {
    assert.ok(spec.includes('执行状态机') && spec.includes('单次执行'));
    assert.ok(spec.includes('模型默认值') && spec.includes('产物收敛'));
  });
}



console.log('\n[14] 团队交付阻断项与界面收口');
{
  const { readFileSync } = await import('fs');
  const src = (rel) => readFileSync(join(root, 'src', rel), 'utf8');
  const server = readFileSync(join(root, 'server.js'), 'utf8');

  check('共享服务回写保留已有密钥', () => {
    assert.ok(server.includes('const usable = typeof incoming'));
    assert.ok(server.includes('if (existing) svc.apiKey = existing.apiKey'));
    assert.ok(server.includes("!incoming.includes('••••')"));
  });
  check('生产模式不把本地代理路径吞成 SPA 页面', () => {
    assert.ok(server.includes("req.path.startsWith('/local-api/')"));
    const probe = src('lib/local-models.ts');
    assert.ok(probe.includes("contentType.includes('json')"));
    assert.ok(probe.includes('本地代理不可用'));
  });
  check('生产模式调用本地模型给出明确引导', () => {
    const ai = src('services/ai-service.ts');
    assert.ok(ai.includes('!import.meta.env.DEV'));
    assert.ok(ai.includes('本地模型仅在开发模式可用'));
  });
  check('错误响应体只读一次，降级不再静默', () => {
    const ai = src('services/ai-service.ts');
    assert.ok(ai.includes('响应体只能读一次'));
    assert.ok(ai.includes('产物未能保存到服务端'));
    const runner = src('components/workspace/agent-runner.tsx');
    assert.ok(runner.includes("url.startsWith('data:')"));
  });
  check('模板取不到时给出反馈，共享配置读取失败可见', () => {
    const tpl = src('pages/templates.tsx');
    const dash = src('pages/dashboard.tsx');
    assert.ok(tpl.includes("toast.error('模板不存在或已被删除')"));
    assert.ok(dash.includes("toast.error('模板不存在或已被删除')"));
    const managed = src('components/workspace/managed-services-settings.tsx');
    assert.ok(managed.includes('团队共享服务读取失败'));
    const settings = src('pages/settings.tsx');
    assert.ok(settings.includes('登录会话加载失败'));
  });

  check('左栏三区层级与无灰底', () => {
    const runner = src('components/workspace/agent-runner.tsx');
    assert.ok(runner.includes('data-slot="task-overview"'));
    assert.ok(runner.includes('data-slot="user-bubble"') && runner.includes('data-slot="assistant-bubble"'));
    assert.ok(!runner.includes('bg-muted/20'));
    assert.ok(!runner.includes('bg-muted/50'));
    assert.ok(!runner.includes("bg-accent text-foreground"));
  });

  check('三处界面收口', () => {
    const runner = src('components/workspace/agent-runner.tsx');
    assert.ok(runner.includes('rows={2}') && runner.includes('min-h-[52px]'));
    const workspace = src('pages/workspace.tsx');
    assert.ok(workspace.includes('selectedNodeId &&'));
    const css = src('index.css');
    assert.ok(css.includes('input:not([type="search"])'));
  });
}


  await checkAsync('发布授权与开源范围口径', async () => {
    const { readFileSync: rf, existsSync: ex } = await import('fs');
    // LICENSE 只随发布副本提供；主项目不保留该文件
    const licensePath = join(root, 'LICENSE');
    if (ex(licensePath)) {
      const license = rf(licensePath, 'utf8');
      assert.ok(license.includes('094CY') && license.includes('非商业'));
      assert.ok(!license.includes('MIT License'));
    }
    const readme = rf(join(root, 'README.md'), 'utf8');
    assert.ok(!/docker|Docker/.test(readme));
    const pkg = JSON.parse(rf(join(root, 'package.json'), 'utf8'));
    assert.ok(pkg.author === '094CY' && pkg.license !== 'MIT');
    const agents = ex(join(root, 'AGENTS.md')) ? rf(join(root, 'AGENTS.md'), 'utf8') : '';
    assert.ok(agents.includes('发布授权口径') || rf(join(root, 'CONTRIBUTING.md'), 'utf8').includes('origin: 094CY'));
    assert.ok(rf(join(root, 'index.html'), 'utf8').includes('name="author" content="094CY"'));
    assert.ok(rf(join(root, 'src/main.tsx'), 'utf8').includes('origin: 094CY'));
    assert.ok(rf(join(root, 'server.js'), 'utf8').includes('origin: 094CY'));
  });

rmSync(out, { recursive: true, force: true });
console.log(`\n通过 ${passed} 项，失败 ${failed} 项\n`);
if (failed > 0) process.exit(1);
