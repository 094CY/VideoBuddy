/**
 * 视频节点属性面板。
 *
 * 从 property-panel.tsx 拆出。原文件 2600+ 行，各节点类型的表单全挤在一起，
 * 改一个字段要在上千行里翻找；现在按节点类型各自成文件。
 */
import type { NodePanelProps } from './node-props-shared';
import { toast } from 'sonner';
import { Type, ImageIcon, Video, Play, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelector, ImageUploadZone, AssetPicker, nodeActionColors } from './node-props-shared';

export function VideoNodeProps({
  data,
  update,
  status,
  upstream,
  onGenerate,
}: NodePanelProps) {
  const nodeType = 'video';
  return (
    <>
              {/* Video sub-type selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">视频功能</Label>
                <Select
                  value={(data.videoSubType as string) || 'txt2vid'}
                  onValueChange={(val) => update('videoSubType', val)}
                >
                  <SelectTrigger className="h-8 text-sm bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="txt2vid">文字生成视频</SelectItem>
                    <SelectItem value="img2vid">首帧生视频</SelectItem>
                    <SelectItem value="concat">片段汇总</SelectItem>
                    <SelectItem value="style-transfer">按风格重生成</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* === Txt2Vid 文字生成视频 === */}
              {((data.videoSubType as string) || 'txt2vid') === 'txt2vid' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">视频描述</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="描述视频内容和镜头运动..."
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
                          <Type className="w-3 h-3" />
                          <span className="flex-1 text-left truncate">引用上游文本为视频描述</span>
                        </button>
                      );
                    }
                    return null;
                  })()}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">时长(秒)</Label>
                      <Input
                        type="number"
                        value={(data.duration as number) || 5}
                        onChange={(e) => update('duration', Number(e.target.value))}
                        className="h-8 text-sm bg-muted/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">帧率</Label>
                      <Input
                        type="number"
                        value={(data.fps as number) || 24}
                        onChange={(e) => update('fps', Number(e.target.value))}
                        className="h-8 text-sm bg-muted/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">运镜方式</Label>
                    <Select
                      value={(data.cameraMovement as string) || 'auto'}
                      onValueChange={(val) => update('cameraMovement', val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">自动</SelectItem>
                        <SelectItem value="static">固定</SelectItem>
                        <SelectItem value="push-in">推进</SelectItem>
                        <SelectItem value="pull-out">拉远</SelectItem>
                        <SelectItem value="pan-left">左摇</SelectItem>
                        <SelectItem value="pan-right">右摇</SelectItem>
                        <SelectItem value="crane-up">上升</SelectItem>
                        <SelectItem value="crane-down">下降</SelectItem>
                        <SelectItem value="orbit">环绕</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* === Img2Vid 首帧生视频 === */}
              {(data.videoSubType as string) === 'img2vid' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">上传首帧图片（必需）</Label>
                    <ImageUploadZone
                      onUpload={(url) => {
                        update('referenceImageUrl', url);
                        toast.success('首帧图片已上传');
                      }}
                    />
                    {(data.referenceImageUrl as string) && (
                      <div className="relative rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={data.referenceImageUrl as string}
                          alt="首帧参考图"
                          className="w-full h-24 object-cover"
                        />
                        <button
                          className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-white hover:bg-red-500/80 transition"
                          onClick={() => update('referenceImageUrl', '')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    {/* Upstream image hint */}
                    {(() => {
                      if (upstream.imageUrl && !(data.referenceImageUrl as string)) {
                        return (
                          <button
                            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-slate-500/10 border border-slate-500/20 text-xs text-slate-400 hover:bg-slate-500/15 transition"
                            onClick={() => update('referenceImageUrl', upstream.imageUrl!)}
                          >
                            <ImageIcon className="w-3 h-3" />
                            <span className="flex-1 text-left truncate">使用上游图片为首帧参考</span>
                          </button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">运动描述</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="描述画面中物体的运动方式..."
                      rows={3}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">时长(秒)</Label>
                      <Input
                        type="number"
                        value={(data.duration as number) || 5}
                        onChange={(e) => update('duration', Number(e.target.value))}
                        className="h-8 text-sm bg-muted/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">运镜</Label>
                      <Select
                        value={(data.cameraMovement as string) || 'auto'}
                        onValueChange={(val) => update('cameraMovement', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">自动</SelectItem>
                          <SelectItem value="static">固定</SelectItem>
                          <SelectItem value="push-in">推进</SelectItem>
                          <SelectItem value="pull-out">拉远</SelectItem>
                          <SelectItem value="orbit">环绕</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* === Concat 片段汇总 === */}
              {(data.videoSubType as string) === 'concat' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">视频片段</Label>
                    <p className="text-[10px] text-muted-foreground">从素材库选择多个视频片段，按顺序拼接</p>
                    <AssetPicker
                      type="video"
                      onSelect={(url) => {
                        const clips = (data.videoClips as string[]) || [];
                        update('videoClips', [...clips, url]);
                        toast.success('已添加视频片段');
                      }}
                    />
                    {/* Show added clips */}
                    {((data.videoClips as string[]) || []).length > 0 && (
                      <div className="space-y-1">
                        {((data.videoClips as string[]) || []).map((_clip, i) => (
                          <div key={i} className="flex items-center gap-2 p-1.5 rounded-md bg-accent/20 text-[10px]">
                            <Video className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                            <span className="flex-1 truncate text-muted-foreground">片段 {i + 1}</span>
                            <button
                              onClick={() => {
                                const clips = [...((data.videoClips as string[]) || [])];
                                clips.splice(i, 1);
                                update('videoClips', clips);
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">转场效果</Label>
                    <Select
                      value={(data.transitionType as string) || 'crossfade'}
                      onValueChange={(val) => update('transitionType', val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">无转场</SelectItem>
                        <SelectItem value="crossfade">交叉淡化</SelectItem>
                        <SelectItem value="fade-black">淡入淡出（黑）</SelectItem>
                        <SelectItem value="fade-white">淡入淡出（白）</SelectItem>
                        <SelectItem value="slide-left">左滑入</SelectItem>
                        <SelectItem value="slide-right">右滑入</SelectItem>
                        <SelectItem value="zoom">缩放</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">转场时长(秒)</Label>
                    <Input
                      type="number"
                      value={(data.transitionDuration as number) || 0.5}
                      onChange={(e) => update('transitionDuration', parseFloat(e.target.value))}
                      step={0.1}
                      min={0}
                      max={3}
                      className="h-7 text-[11px] bg-muted/50"
                    />
                  </div>
                </>
              )}

              {/* === Style Transfer 按风格重生成 === */}
              {(data.videoSubType as string) === 'style-transfer' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">上传原视频</Label>
                    <AssetPicker
                      type="video"
                      onSelect={(url) => {
                        update('referenceVideoUrl', url);
                      }}
                    />
                    {(data.referenceVideoUrl as string) && (
                      <div className="flex items-center gap-2 p-1.5 rounded-md bg-accent/20 text-[10px]">
                        <Video className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                        <span className="flex-1 truncate text-muted-foreground">原视频已选择</span>
                        <button onClick={() => update('referenceVideoUrl', '')} className="text-muted-foreground hover:text-foreground">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">目标风格</Label>
                    <Select
                      value={(data.targetStyle as string) || 'anime'}
                      onValueChange={(val) => update('targetStyle', val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anime">动漫风</SelectItem>
                        <SelectItem value="oil-painting">油画风</SelectItem>
                        <SelectItem value="watercolor">水彩风</SelectItem>
                        <SelectItem value="sketch">素描风</SelectItem>
                        <SelectItem value="cyberpunk">赛博朋克</SelectItem>
                        <SelectItem value="ghibli">吉卜力</SelectItem>
                        <SelectItem value="pixel">像素风</SelectItem>
                        <SelectItem value="comic">漫画风</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      风格强度 ({((data.styleStrength as number) || 0.7).toFixed(1)})
                    </Label>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.1}
                      value={(data.styleStrength as number) || 0.7}
                      onChange={(e) => update('styleStrength', parseFloat(e.target.value))}
                      className="w-full h-1.5 accent-amber-500"
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>轻微 0.1</span>
                      <span>强烈 1.0</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">风格描述（可选）</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="进一步描述风格细节..."
                      rows={2}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                </>
              )}

              {/* Common: Reference material from asset library (for txt2vid) */}
              {((data.videoSubType as string) || 'txt2vid') === 'txt2vid' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">参考素材（可选）</Label>
                  <AssetPicker
                    type="image"
                    onSelect={(url) => {
                      update('referenceImageUrl', url);
                    }}
                  />
                  <AssetPicker
                    type="video"
                    onSelect={(url) => {
                      update('referenceVideoUrl', url);
                    }}
                  />
                  {(data.referenceImageUrl as string) && (
                    <div className="flex items-center gap-2 p-1.5 rounded-md bg-accent/20 text-[10px]">
                      <img src={data.referenceImageUrl as string} alt="" className="w-8 h-8 rounded object-cover" />
                      <span className="flex-1 truncate text-muted-foreground">参考图片已选择</span>
                      <button onClick={() => update('referenceImageUrl', '')} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
              <ModelSelector
                type="video"
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
                  <Play className="w-3.5 h-3.5 mr-1" />
                )}
                {(() => {
                  const subType = (data.videoSubType as string) || 'txt2vid';
                  if (subType === 'txt2vid') return '生成视频';
                  if (subType === 'img2vid') return '首帧生视频';
                  if (subType === 'concat') return '拼接视频';
                  if (subType === 'style-transfer') return '风格转绘';
                  return '生成视频';
                })()}
              </Button>
    </>
  );
}
