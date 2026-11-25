/**
 * AI 处理节点属性面板。
 *
 * 从 property-panel.tsx 拆出。原文件 2600+ 行，各节点类型的表单全挤在一起，
 * 改一个字段要在上千行里翻找；现在按节点类型各自成文件。
 */
import type { NodePanelProps } from './node-props-shared';

const processTypeOptions = [
  { value: 'text-expand', label: '文案扩写' },
  { value: 'script-generate', label: '剧本生成' },
  { value: 'style-transfer', label: '风格转换' },
  { value: 'storyboard-grid-9', label: '9 宫格分镜方案' },
  { value: 'storyboard-grid-25', label: '25 宫格分镜方案' },
  { value: 'story-extrapolate', label: '剧情推演' },
  { value: 'custom-prompt', label: '自定义指令' },
];
import { Sparkles, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelector, nodeActionColors } from './node-props-shared';

export function AiProcessNodeProps({
  data,
  update,
  status,
  upstream,
  onGenerate,
}: NodePanelProps) {
  const nodeType = 'ai-process';
  return (
    <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">处理类型</Label>
                <Select
                  value={(data.processType as string) || 'text-expand'}
                  onValueChange={(val) => update('processType', val)}
                >
                  <SelectTrigger className="h-8 text-sm bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {processTypeOptions.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">提示词 / 指令</Label>
                <Textarea
                  value={(data.prompt as string) || ''}
                  onChange={(e) => update('prompt', e.target.value)}
                  placeholder="输入 AI 处理指令..."
                  rows={5}
                  className="text-sm resize-none bg-muted/50"
                />
              </div>
              {/* Input text from upstream */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">输入文本（可选）</Label>
                <Textarea
                  value={(data.inputText as string) || ''}
                  onChange={(e) => update('inputText', e.target.value)}
                  placeholder="粘贴需要处理的文本，或连接上游节点自动获取..."
                  rows={3}
                  className="text-xs resize-none bg-muted/50"
                />
              </div>
              {/* Upstream hint */}
              {(() => {
                if (upstream.text && !(data.inputText as string)) {
                  return (
                    <button
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300 hover:bg-cyan-500/15 transition"
                      onClick={() => update('inputText', upstream.text!)}
                    >
                      <Wand2 className="w-3 h-3" />
                      <span className="flex-1 text-left truncate">使用上游文本作为输入: {upstream.text!.slice(0, 40)}...</span>
                    </button>
                  );
                }
                return null;
              })()}
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
                  <Sparkles className="w-3.5 h-3.5 mr-1" />
                )}
                执行 AI 处理
              </Button>
    </>
  );
}
