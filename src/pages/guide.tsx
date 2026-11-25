import {
  Zap, Layers, Settings, Play, FileText, ImageIcon, Video, Music, Sparkles,
  MousePointerClick, Workflow, Download, Key, GitBranch, Save,
  RotateCcw, Bot, Cpu, FolderOpen, HardDrive, BookmarkPlus, History,
  Users, ShieldCheck, Info,
} from 'lucide-react';

/**
 * 使用指南：只描述当前真实存在的能力与边界。
 * 不点名具体模型厂商，不把「文字方案」「地址汇总」写成生成的音视频文件。
 */
export function GuidePage() {
  return (
    <div className="flex-1 overflow-y-auto">
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-9">

        <section>
          <SectionTitle icon={<Zap />} title="开始之前" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <StepCard step={1} title="配置模型密钥" desc="在「设置 → 模型 & Key」填入所使用平台的 API Key，并把需要的模型设为默认。" />
            <StepCard step={2} title="描述需求" desc="选择输出类型，用自然语言说明想做什么；也可以从模板库挑一条现成流水线。" />
            <StepCard step={3} title="执行并查看结果" desc="按拓扑顺序执行节点，产物自动汇总到资产库，可逐个下载。" />
          </div>
        </section>

        <section>
          <SectionTitle icon={<Bot />} title="两种工作模式" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<Bot />} title="Agent 模式" desc="一句话描述需求，系统自动拆解并逐步执行，适合快速出第一版结果。" />
            <FeatureRow icon={<Workflow />} title="画布模式" desc="自行添加节点并连线，逐个环节填写提示词与模型，适合需要精细控制的专业场景。" />
          </div>
        </section>

        <section>
          <SectionTitle icon={<Layers />} title="节点与产出" />
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            节点通过连线组成工作流，上游结果自动作为下游输入。下面列出每类节点实际会产出什么，标注「方案」的子类型只生成文字说明，不生成文件。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <NodeGuide icon={<FileText />} name="文本节点" features={['品牌广告文案', '续写改写', '多语言翻译', '关键词提取']} />
            <NodeGuide icon={<ImageIcon />} name="图片节点" features={['文生图（图片文件）', '参考描述重绘', '背景方案', '高分辨率重绘']} />
            <NodeGuide icon={<Video />} name="视频节点" features={['文生视频（视频文件）', '首帧生视频', '片段汇总', '按风格重生成']} />
            <NodeGuide icon={<Music />} name="音频节点" features={['语音合成（音频文件）', '配乐方案', '音效方案']} />
            <NodeGuide icon={<Sparkles />} name="AI 处理节点" features={['文案扩写', '剧本生成', '风格转换', '分镜方案']} />
            <NodeGuide icon={<FileText />} name="脚本节点" features={['结构化分镜编排', '批量分发到图片与视频节点']} />
          </div>
        </section>

        <section>
          <SectionTitle icon={<GitBranch />} title="连接规则" />
          <div className="rounded-lg border border-border overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-foreground">上游节点</th>
                  <th className="text-left px-4 py-2.5 font-medium text-foreground">可连接到</th>
                  <th className="text-left px-4 py-2.5 font-medium text-foreground">数据如何传递</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                <tr>
                  <td className="px-4 py-2.5 text-foreground">文本</td>
                  <td className="px-4 py-2.5 text-muted-foreground">文本、脚本、AI 处理、图片、视频、音频</td>
                  <td className="px-4 py-2.5 text-muted-foreground">文本内容作为下游提示词</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-foreground">图片</td>
                  <td className="px-4 py-2.5 text-muted-foreground">图片、视频、AI 处理</td>
                  <td className="px-4 py-2.5 text-muted-foreground">图片作为首帧或参考图</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-foreground">视频</td>
                  <td className="px-4 py-2.5 text-muted-foreground">视频、AI 处理</td>
                  <td className="px-4 py-2.5 text-muted-foreground">片段地址汇总，不合成文件</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-foreground">音频</td>
                  <td className="px-4 py-2.5 text-muted-foreground">AI 处理</td>
                  <td className="px-4 py-2.5 text-muted-foreground">语音文件可供下载，不混入视频</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <SectionTitle icon={<Settings />} title="画布操作" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<MousePointerClick />} title="添加节点" desc="工具栏、双击画布、右键下游菜单，或使用快捷菜单。" />
            <FeatureRow icon={<Play />} title="执行" desc="按拓扑顺序依次运行；上游失败会跳过下游，取消会中断进行中的请求。" />
            <FeatureRow icon={<RotateCcw />} title="撤销与重做" desc="支持完整操作历史，第一个新增节点也可撤销。" />
            <FeatureRow icon={<Layers />} title="一键整理布局" desc="顶部「整理」按钮按依赖关系自动分层排列节点，消除重叠；从模板创建时也会自动排版。" />
            <FeatureRow icon={<Save />} title="保存" desc="切换项目、返回、刷新或关闭页面时自动保存，也可手动保存。" />
            <FeatureRow icon={<BookmarkPlus />} title="存为模板" desc="把当前工作流结构保存为个人模板，供下次复用。" />
            <FeatureRow icon={<History />} title="版本历史" desc="按项目保存快照，可随时回退。" />
            <FeatureRow icon={<Download />} title="导出" desc="批量下载生成的图片、视频、音频源文件。" />
          </div>
        </section>

        <section>
          <SectionTitle icon={<BookmarkPlus />} title="模板库与技能库" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<BookmarkPlus />} title="模板库" desc="首页「从模板开始」或模板库页面，点一下即可创建带完整节点与连线的项目，卡片上的节点数与使用次数都是真实数据。" />
            <FeatureRow icon={<Zap />} title="技能库" desc="选中技能后，其方法论与输出要点会注入该任务的 AI 调用，影响实际生成结果，同时切换输出类型与起始提示。" />
          </div>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            模板创建的节点若未指定模型，画布会持续提示，需先在「设置 → 模型 & Key」配置服务并设为默认。
          </p>
        </section>

        <section>
          <SectionTitle icon={<Key />} title="模型与密钥" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<Key />} title="添加服务" desc="选择接口协议，可从内置预设带入服务地址（HTTPS），再填写 API Key。" />
            <FeatureRow icon={<Cpu />} title="添加模型" desc="在已添加的服务下，按服务商文档填写模型 ID 与能力类型，再设为默认或供节点选用。" />
            <FeatureRow icon={<Sparkles />} title="服务地址注册" desc="服务地址保存时会注册到当前账号的代理白名单，只有自己登记过的地址才会被放行。" />
          </div>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            个别协议使用原生签名鉴权，需按设置页的提示填写对应格式的密钥。开发模式下还可接入本地模型后端。
          </p>
        </section>

        <section>
          <SectionTitle icon={<FolderOpen />} title="资产库" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<FolderOpen />} title="素材" desc="上传参考图片、视频、音频或文本，支持分类筛选与预览。" />
            <FeatureRow icon={<Download />} title="产物" desc="自动汇总各项目工作流生成的图片、视频与文案，不另行保存副本。" />
          </div>
        </section>

        <section>
          <SectionTitle icon={<Users />} title="账号与团队" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<ShieldCheck />} title="管理员" desc="创建成员账号、重置密码、删除账号。" />
            <FeatureRow icon={<Users />} title="成员" desc="用管理员分配的账号登录，拥有独立的项目、素材、模板与产物。" />
          </div>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            各账号数据由服务端按租户隔离，切换账号不会看到他人的任务。团队记录仅用于登记成员与角色，不产生跨账号的数据共享。
          </p>
        </section>

        <section>
          <SectionTitle icon={<HardDrive />} title="数据与备份" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<HardDrive />} title="存储" desc="工作区数据由服务端按账号保存，登录时加载到当前浏览器；退出登录后本机数据立即清除。" />
            <FeatureRow icon={<Download />} title="备份" desc="在「设置 → 数据迁移」导出 JSON 备份；导入前会校验版本并确认来源。" />
          </div>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            备份文件包含账号信息与 API Key，请妥善保管，不要分享给他人。
          </p>
        </section>

        <section>
          <SectionTitle icon={<Info />} title="能力边界" />
          <div className="space-y-3 mt-4">
            <FeatureRow icon={<Music />} title="方案类节点" desc="配乐、音效、分镜方案等只产出文字说明，不会生成音频或图片文件，也不计入可下载产物。" />
            <FeatureRow icon={<Video />} title="片段汇总" desc="该节点只列出上游片段地址，不做真实合并；成片合成请使用本地剪辑工具。" />
            <FeatureRow icon={<Download />} title="导出" desc="导出的是 AI 生成的原始文件，不做转码。分辨率与帧率设置仅用于文件名标注和体积预估。" />
          </div>
        </section>

        <section className="pb-8">
          <SectionTitle icon={<Zap />} title="使用技巧" />
          <ul className="text-sm text-muted-foreground space-y-2 mt-4">
            <li>• 从模板库开始，比从空白画布搭建更快</li>
            <li>• 执行失败时先看节点上的原因提示，再检查模型与密钥配置</li>
            <li>• 一个节点失败后可单独调整并重跑，不必整条流水线重来</li>
            <li>• 重要工作流建议保存版本快照，或存为个人模板</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function StepCard({ step, title, desc }: { step: number; title: string; desc: string }) {
  return (
    <div className="p-4 rounded-lg border border-border bg-card">
      <div className="w-7 h-7 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center mb-3">
        {step}
      </div>
      <p className="text-sm font-medium text-foreground mb-1.5">{title}</p>
      <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}

function NodeGuide({ icon, name, features }: { icon: React.ReactNode; name: string; features: string[] }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-card">
      <div className="w-8 h-8 rounded-lg bg-accent/50 flex items-center justify-center flex-shrink-0 text-muted-foreground">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {features.map((f, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded bg-accent/50 flex items-center justify-center flex-shrink-0 text-muted-foreground">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[13px] text-muted-foreground leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}
