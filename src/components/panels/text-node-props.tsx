/**
 * 文本节点属性面板。
 *
 * 从 property-panel.tsx 拆出。原文件 2600+ 行，各节点类型的表单全挤在一起，
 * 改一个字段要在上千行里翻找；现在按节点类型各自成文件。
 */
import type { NodePanelProps } from './node-props-shared';
import { toast } from 'sonner';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelector, AssetPicker, nodeActionColors } from './node-props-shared';

export function TextNodeProps({
  data,
  update,
  status,
  upstream,
  onGenerate,
}: NodePanelProps) {
  const nodeType = 'text';
  return (
    <>
              {/* Text sub-type selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">文本功能</Label>
                <Select
                  value={(data.textSubType as string) || 'copywriting'}
                  onValueChange={(val) => update('textSubType', val)}
                >
                  <SelectTrigger className="h-8 text-sm bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="copywriting">品牌广告文案</SelectItem>
                    <SelectItem value="rewrite">AI 续写 / 改写</SelectItem>
                    <SelectItem value="translate">多语言翻译</SelectItem>
                    <SelectItem value="keywords">关键词提取</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* === Copywriting 品牌广告文案 === */}
              {((data.textSubType as string) || 'copywriting') === 'copywriting' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">品牌 / 产品名称</Label>
                    <Input
                      value={(data.brandName as string) || ''}
                      onChange={(e) => update('brandName', e.target.value)}
                      placeholder="如：Tesla Model S"
                      className="h-8 text-sm bg-muted/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">文案调性</Label>
                      <Select
                        value={(data.copyTone as string) || 'professional'}
                        onValueChange={(val) => update('copyTone', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">专业正式</SelectItem>
                          <SelectItem value="casual">轻松活泼</SelectItem>
                          <SelectItem value="luxury">高端奢华</SelectItem>
                          <SelectItem value="youthful">年轻潮流</SelectItem>
                          <SelectItem value="warm">温暖走心</SelectItem>
                          <SelectItem value="humorous">幽默诙谐</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">投放场景</Label>
                      <Select
                        value={(data.copyScene as string) || 'social'}
                        onValueChange={(val) => update('copyScene', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="social">社交媒体</SelectItem>
                          <SelectItem value="video-ad">视频广告</SelectItem>
                          <SelectItem value="print">平面海报</SelectItem>
                          <SelectItem value="ecommerce">电商详情页</SelectItem>
                          <SelectItem value="push">推送/短信</SelectItem>
                          <SelectItem value="slogan">品牌Slogan</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">目标字数</Label>
                    <Input
                      type="number"
                      value={(data.targetLength as number) || 200}
                      onChange={(e) => update('targetLength', Number(e.target.value))}
                      className="h-7 text-[11px] bg-muted/50"
                      min={20}
                      max={5000}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">核心卖点 / 创意要求</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {((data.content as string) || '').length} 字
                      </span>
                    </div>
                    <Textarea
                      value={(data.content as string) || ''}
                      onChange={(e) => update('content', e.target.value)}
                      placeholder="输入产品卖点、目标受众、创意方向..."
                      rows={5}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                </>
              )}

              {/* === Rewrite AI续写/改写 === */}
              {(data.textSubType as string) === 'rewrite' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">改写模式</Label>
                      <Select
                        value={(data.rewriteMode as string) || 'continue'}
                        onValueChange={(val) => update('rewriteMode', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="continue">续写</SelectItem>
                          <SelectItem value="rewrite">改写</SelectItem>
                          <SelectItem value="polish">润色</SelectItem>
                          <SelectItem value="expand">扩写</SelectItem>
                          <SelectItem value="compress">缩写</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">风格</Label>
                      <Select
                        value={(data.rewriteStyle as string) || 'neutral'}
                        onValueChange={(val) => update('rewriteStyle', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="neutral">原风格</SelectItem>
                          <SelectItem value="formal">正式商务</SelectItem>
                          <SelectItem value="creative">创意文学</SelectItem>
                          <SelectItem value="simple">简洁口语</SelectItem>
                          <SelectItem value="academic">学术严谨</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">原文内容</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {((data.content as string) || '').length} 字
                      </span>
                    </div>
                    <Textarea
                      value={(data.content as string) || ''}
                      onChange={(e) => update('content', e.target.value)}
                      placeholder="粘贴需要续写或改写的原文..."
                      rows={8}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                </>
              )}

              {/* === Translate 多语言翻译 === */}
              {(data.textSubType as string) === 'translate' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">源语言</Label>
                      <Select
                        value={(data.sourceLang as string) || 'auto'}
                        onValueChange={(val) => update('sourceLang', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自动检测</SelectItem>
                          <SelectItem value="zh">中文</SelectItem>
                          <SelectItem value="en">英语</SelectItem>
                          <SelectItem value="ja">日语</SelectItem>
                          <SelectItem value="ko">韩语</SelectItem>
                          <SelectItem value="fr">法语</SelectItem>
                          <SelectItem value="de">德语</SelectItem>
                          <SelectItem value="es">西班牙语</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">目标语言</Label>
                      <Select
                        value={(data.targetLang as string) || 'en'}
                        onValueChange={(val) => update('targetLang', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="zh">中文</SelectItem>
                          <SelectItem value="en">英语</SelectItem>
                          <SelectItem value="ja">日语</SelectItem>
                          <SelectItem value="ko">韩语</SelectItem>
                          <SelectItem value="fr">法语</SelectItem>
                          <SelectItem value="de">德语</SelectItem>
                          <SelectItem value="es">西班牙语</SelectItem>
                          <SelectItem value="ar">阿拉伯语</SelectItem>
                          <SelectItem value="pt">葡萄牙语</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">翻译风格</Label>
                    <Select
                      value={(data.translateStyle as string) || 'natural'}
                      onValueChange={(val) => update('translateStyle', val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="natural">自然流畅</SelectItem>
                        <SelectItem value="literal">忠于原文</SelectItem>
                        <SelectItem value="localized">本地化</SelectItem>
                        <SelectItem value="marketing">营销文案</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">待翻译内容</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {((data.content as string) || '').length} 字
                      </span>
                    </div>
                    <Textarea
                      value={(data.content as string) || ''}
                      onChange={(e) => update('content', e.target.value)}
                      placeholder="粘贴需要翻译的文本..."
                      rows={6}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                </>
              )}

              {/* === Keywords 关键词提取 === */}
              {(data.textSubType as string) === 'keywords' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">提取类型</Label>
                      <Select
                        value={(data.extractType as string) || 'keywords'}
                        onValueChange={(val) => update('extractType', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="keywords">关键词</SelectItem>
                          <SelectItem value="tags">标签</SelectItem>
                          <SelectItem value="summary">摘要</SelectItem>
                          <SelectItem value="seo">SEO 关键词</SelectItem>
                          <SelectItem value="hashtags">话题标签 #</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">提取数量</Label>
                      <Input
                        type="number"
                        value={(data.extractCount as number) || 10}
                        onChange={(e) => update('extractCount', Number(e.target.value))}
                        className="h-7 text-[11px] bg-muted/50"
                        min={1}
                        max={50}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">待提取文本</Label>
                      <span className="text-[10px] text-muted-foreground">
                        {((data.content as string) || '').length} 字
                      </span>
                    </div>
                    <Textarea
                      value={(data.content as string) || ''}
                      onChange={(e) => update('content', e.target.value)}
                      placeholder="粘贴需要提取关键词的文本..."
                      rows={6}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                </>
              )}

              {/* Upstream text hint */}
              {(() => {
                if (upstream.text && !(data.content as string)) {
                  return (
                    <button
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 hover:bg-indigo-500/15 transition"
                      onClick={() => update('content', upstream.text!)}
                    >
                      <Wand2 className="w-3 h-3" />
                      <span className="flex-1 text-left truncate">引用上游文本: {upstream.text!.slice(0, 50)}...</span>
                    </button>
                  );
                }
                return null;
              })()}
              <AssetPicker
                type="text"
                onSelect={(_url, name, textContent) => {
                  // 优先使用 textContent（文件实际内容），回退到从 data URL 解码
                  let content = textContent || '';
                  if (!content && _url && _url.startsWith('data:')) {
                    try {
                      const base64 = _url.split(',')[1];
                      content = atob(base64);
                    } catch {
                      content = '';
                    }
                  }
                  if (content) {
                    update('content', (data.content as string || '') + (data.content ? '\n' : '') + content);
                    toast.success(`已导入「${name}」的内容`);
                  } else {
                    toast.error('无法读取文件内容');
                  }
                }}
              />
              <ModelSelector
                type="text"
                currentProvider={(data.provider as string) || ''}
                currentModel={(data.model as string) || ''}
                currentServiceId={(data.serviceId as string) || ''}
                onSelect={(provider, model, serviceId) => {
                  update('provider', provider);
                  update('model', model);
                  update('serviceId', serviceId);
                }}
              />
              <Button
                size="sm"
                className={`w-full ${nodeActionColors[nodeType]}`}
                onClick={onGenerate}
                disabled={status === 'running'}
              >
                {status === 'running' ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                ) : (
                  <Wand2 className="w-3.5 h-3.5 mr-1" />
                )}
                {(() => {
                  const subType = (data.textSubType as string) || 'copywriting';
                  if (subType === 'copywriting') return '生成文案';
                  if (subType === 'rewrite') return 'AI 改写';
                  if (subType === 'translate') return '翻译';
                  if (subType === 'keywords') return '提取关键词';
                  return 'AI 生成';
                })()}
              </Button>
              {status === 'error' && (data.errorMessage as string) && (
                <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400">{data.errorMessage as string}</p>
                </div>
              )}
    </>
  );
}
