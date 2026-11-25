/**
 * 音频节点属性面板。
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
import { ModelSelector, AudioUploadZone, AssetPicker, nodeActionColors } from './node-props-shared';

export function AudioNodeProps({
  data,
  update,
  status,
  upstream,
  onGenerate,
}: NodePanelProps) {
  const nodeType = 'audio';
  return (
    <>
              {/* Audio sub-type selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">音频类型</Label>
                <Select
                  value={(data.audioSubType as string) || 'tts'}
                  onValueChange={(val) => update('audioSubType', val)}
                >
                  <SelectTrigger className="h-8 text-sm bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tts">AI 语音合成 (TTS)</SelectItem>
                    <SelectItem value="bgm">背景音乐方案</SelectItem>
                    <SelectItem value="sfx">音效方案</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* TTS Options */}
              {((data.audioSubType as string) || 'tts') === 'tts' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">旁白/台词文案</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="输入需要合成的语音文案..."
                      rows={4}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                  {/* Upstream text hint */}
                  {(() => {
                    if (upstream.text && !(data.prompt as string)) {
                      return (
                        <button
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 hover:bg-indigo-500/15 transition"
                          onClick={() => update('prompt', upstream.text!)}
                        >
                          <Wand2 className="w-3 h-3" />
                          <span className="flex-1 text-left truncate">使用上游文本: {upstream.text!.slice(0, 40)}...</span>
                        </button>
                      );
                    }
                    return null;
                  })()}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">音色</Label>
                      <Select
                        value={(data.voice as string) || 'alloy'}
                        onValueChange={(val) => update('voice', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="alloy">Alloy (自然)</SelectItem>
                          <SelectItem value="echo">Echo (沉稳)</SelectItem>
                          <SelectItem value="fable">Fable (故事)</SelectItem>
                          <SelectItem value="onyx">Onyx (深沉)</SelectItem>
                          <SelectItem value="nova">Nova (清新)</SelectItem>
                          <SelectItem value="shimmer">Shimmer (柔和)</SelectItem>
                          <SelectItem value="male-qn-qingse">男声·青涩</SelectItem>
                          <SelectItem value="female-shaonv">女声·少女</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">语速</Label>
                      <Input
                        type="number"
                        value={(data.speed as number) || 1.0}
                        onChange={(e) => update('speed', parseFloat(e.target.value))}
                        step={0.1}
                        min={0.5}
                        max={2.0}
                        className="h-7 text-[11px] bg-muted/50"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* BGM Options */}
              {(data.audioSubType as string) === 'bgm' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">音乐风格描述</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="描述你想要的背景音乐风格，如：轻快的电子音乐，适合科技产品宣传片..."
                      rows={3}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">时长(秒)</Label>
                      <Input
                        type="number"
                        value={(data.bgmDuration as number) || 30}
                        onChange={(e) => update('bgmDuration', Number(e.target.value))}
                        className="h-7 text-[11px] bg-muted/50"
                        min={5}
                        max={300}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">情绪</Label>
                      <Select
                        value={(data.bgmMood as string) || 'upbeat'}
                        onValueChange={(val) => update('bgmMood', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="upbeat">欢快明亮</SelectItem>
                          <SelectItem value="calm">平静舒缓</SelectItem>
                          <SelectItem value="dramatic">紧张戏剧</SelectItem>
                          <SelectItem value="emotional">感人深情</SelectItem>
                          <SelectItem value="epic">史诗壮阔</SelectItem>
                          <SelectItem value="mysterious">神秘悬疑</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* SFX Options */}
              {(data.audioSubType as string) === 'sfx' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">音效描述</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="描述需要的音效，如：脚步声、关门声、雨声..."
                      rows={3}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">音效场景</Label>
                    <Select
                      value={(data.sfxCategory as string) || 'general'}
                      onValueChange={(val) => update('sfxCategory', val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">通用</SelectItem>
                        <SelectItem value="nature">自然环境</SelectItem>
                        <SelectItem value="urban">城市环境</SelectItem>
                        <SelectItem value="human">人物动作</SelectItem>
                        <SelectItem value="impact">碰撞打击</SelectItem>
                        <SelectItem value="ui">UI 交互</SelectItem>
                        <SelectItem value="transition">转场过渡</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Upload or select from asset library */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">音频素材</Label>
                <AudioUploadZone
                  onUpload={(url) => {
                    update('uploadedAudioUrl', url);
                    toast.success('音频已上传');
                  }}
                />
                <AssetPicker
                  type="audio"
                  onSelect={(url) => {
                    update('uploadedAudioUrl', url);
                  }}
                />
              </div>
              <ModelSelector
                type="audio"
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
                {((data.audioSubType as string) || 'tts') === 'tts' ? '生成语音' : (data.audioSubType as string) === 'bgm' ? '生成音乐' : '生成音效'}
              </Button>
    </>
  );
}
