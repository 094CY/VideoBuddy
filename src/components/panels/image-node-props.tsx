/**
 * 图片节点属性面板。
 *
 * 从 property-panel.tsx 拆出。原文件 2600+ 行，各节点类型的表单全挤在一起，
 * 改一个字段要在上千行里翻找；现在按节点类型各自成文件。
 */
import type { NodePanelProps } from './node-props-shared';
import { toast } from 'sonner';
import { X, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModelSelector, ImageUploadZone, AssetPicker, nodeActionColors } from './node-props-shared';

export function ImageNodeProps({
  data,
  update,
  status,
  upstream,
  onGenerate,
}: NodePanelProps) {
  const nodeType = 'image';
  return (
    <>
              {/* Image sub-type selector */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">图片功能</Label>
                <Select
                  value={(data.imageSubType as string) || 'txt2img'}
                  onValueChange={(val) => update('imageSubType', val)}
                >
                  <SelectTrigger className="h-8 text-sm bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="txt2img">文生图 (Txt2Img)</SelectItem>
                    <SelectItem value="img2img">参考描述重绘</SelectItem>
                    <SelectItem value="bg-remove">背景方案</SelectItem>
                    <SelectItem value="upscale">高分辨率重绘</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* === Txt2Img 文生图 === */}
              {((data.imageSubType as string) || 'txt2img') === 'txt2img' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">图片提示词</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="描述你想要生成的图片..."
                      rows={4}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                  {/* Upstream text hint for prompt */}
                  {(() => {
                    if (upstream.text && !(data.prompt as string)) {
                      return (
                        <button
                          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 hover:bg-indigo-500/15 transition"
                          onClick={() => update('prompt', upstream.text!)}
                        >
                          <Wand2 className="w-3 h-3" />
                          <span className="flex-1 text-left truncate">引用上游文本为图片提示词</span>
                        </button>
                      );
                    }
                    return null;
                  })()}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">反向提示词</Label>
                    <Input
                      value={(data.negativePrompt as string) || ''}
                      onChange={(e) => update('negativePrompt', e.target.value)}
                      placeholder="不想出现的元素..."
                      className="h-8 text-sm bg-muted/50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">宽度</Label>
                      <Input
                        type="number"
                        value={(data.width as number) || 1024}
                        onChange={(e) => update('width', Number(e.target.value))}
                        className="h-8 text-sm bg-muted/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">高度</Label>
                      <Input
                        type="number"
                        value={(data.height as number) || 1024}
                        onChange={(e) => update('height', Number(e.target.value))}
                        className="h-8 text-sm bg-muted/50"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">图片风格</Label>
                    <Select
                      value={(data.imageStyle as string) || 'auto'}
                      onValueChange={(val) => update('imageStyle', val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">自动</SelectItem>
                        <SelectItem value="photographic">摄影写实</SelectItem>
                        <SelectItem value="digital-art">数字艺术</SelectItem>
                        <SelectItem value="anime">动漫</SelectItem>
                        <SelectItem value="oil-painting">油画</SelectItem>
                        <SelectItem value="watercolor">水彩</SelectItem>
                        <SelectItem value="3d-render">3D 渲染</SelectItem>
                        <SelectItem value="pixel-art">像素风</SelectItem>
                        <SelectItem value="cinematic">电影质感</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* === Img2Img 图生图 === */}
              {(data.imageSubType as string) === 'img2img' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">参考图片（必需）</Label>
                    <ImageUploadZone
                      onUpload={(url) => {
                        update('uploadedImageUrl', url);
                        toast.success('参考图已上传');
                      }}
                    />
                    {(data.uploadedImageUrl as string) && (
                      <div className="relative rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={data.uploadedImageUrl as string}
                          alt="参考图"
                          className="w-full h-24 object-cover"
                        />
                        <button
                          className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-white hover:bg-red-500/80 transition"
                          onClick={() => update('uploadedImageUrl', '')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">变化描述</Label>
                    <Textarea
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="描述你想要的变化，如：将背景改为海边日落..."
                      rows={3}
                      className="text-sm resize-none bg-muted/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">变化强度 ({((data.img2imgStrength as number) || 0.6).toFixed(1)})</Label>
                    <input
                      type="range"
                      min={0.1}
                      max={1.0}
                      step={0.1}
                      value={(data.img2imgStrength as number) || 0.6}
                      onChange={(e) => update('img2imgStrength', parseFloat(e.target.value))}
                      className="w-full h-1.5 accent-slate-500"
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>微调 0.1</span>
                      <span>大改 1.0</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">宽度</Label>
                      <Input
                        type="number"
                        value={(data.width as number) || 1024}
                        onChange={(e) => update('width', Number(e.target.value))}
                        className="h-8 text-sm bg-muted/50"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">高度</Label>
                      <Input
                        type="number"
                        value={(data.height as number) || 1024}
                        onChange={(e) => update('height', Number(e.target.value))}
                        className="h-8 text-sm bg-muted/50"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* === Background Remove 背景替换/移除 === */}
              {(data.imageSubType as string) === 'bg-remove' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">上传主体图片</Label>
                    <ImageUploadZone
                      onUpload={(url) => {
                        update('uploadedImageUrl', url);
                        toast.success('图片已上传');
                      }}
                    />
                    {(data.uploadedImageUrl as string) && (
                      <div className="relative rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={data.uploadedImageUrl as string}
                          alt="待处理图片"
                          className="w-full h-24 object-cover"
                        />
                        <button
                          className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-white hover:bg-red-500/80 transition"
                          onClick={() => update('uploadedImageUrl', '')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">背景处理模式</Label>
                    <Select
                      value={(data.bgMode as string) || 'remove'}
                      onValueChange={(val) => update('bgMode', val)}
                    >
                      <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="remove">移除背景（透明）</SelectItem>
                        <SelectItem value="white">替换为白色背景</SelectItem>
                        <SelectItem value="custom">自定义背景描述</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(data.bgMode as string) === 'custom' && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">新背景描述</Label>
                      <Textarea
                        value={(data.prompt as string) || ''}
                        onChange={(e) => update('prompt', e.target.value)}
                        placeholder="描述新背景，如：蓝天白云的海边沙滩..."
                        rows={2}
                        className="text-sm resize-none bg-muted/50"
                      />
                    </div>
                  )}
                </>
              )}

              {/* === Upscale 高分辨率重绘 === */}
              {(data.imageSubType as string) === 'upscale' && (
                <>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">上传待放大图片</Label>
                    <ImageUploadZone
                      onUpload={(url) => {
                        update('uploadedImageUrl', url);
                        toast.success('图片已上传');
                      }}
                    />
                    {(data.uploadedImageUrl as string) && (
                      <div className="relative rounded-lg overflow-hidden border border-border/50">
                        <img
                          src={data.uploadedImageUrl as string}
                          alt="待放大图片"
                          className="w-full h-24 object-cover"
                        />
                        <button
                          className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-white hover:bg-red-500/80 transition"
                          onClick={() => update('uploadedImageUrl', '')}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">放大倍数</Label>
                      <Select
                        value={(data.upscaleRatio as string) || '2x'}
                        onValueChange={(val) => update('upscaleRatio', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2x">2x 放大</SelectItem>
                          <SelectItem value="4x">4x 放大</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">降噪强度</Label>
                      <Select
                        value={(data.denoiseLevel as string) || 'medium'}
                        onValueChange={(val) => update('denoiseLevel', val)}
                      >
                        <SelectTrigger className="h-7 text-[11px] bg-muted/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">低</SelectItem>
                          <SelectItem value="medium">中</SelectItem>
                          <SelectItem value="high">高</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">修复提示（可选）</Label>
                    <Input
                      value={(data.prompt as string) || ''}
                      onChange={(e) => update('prompt', e.target.value)}
                      placeholder="如：修复面部细节、增强纹理..."
                      className="h-8 text-sm bg-muted/50"
                    />
                  </div>
                </>
              )}

              {/* Common: Upload or select from asset library (for txt2img) */}
              {((data.imageSubType as string) || 'txt2img') === 'txt2img' && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">图片素材（可选参考）</Label>
                  <ImageUploadZone
                    onUpload={(url) => {
                      update('uploadedImageUrl', url);
                      toast.success('图片已上传');
                    }}
                  />
                  <AssetPicker
                    type="image"
                    onSelect={(url) => {
                      update('uploadedImageUrl', url);
                    }}
                  />
                </div>
              )}
              {/* Asset picker for non-txt2img modes */}
              {(data.imageSubType as string) && (data.imageSubType as string) !== 'txt2img' && (
                <AssetPicker
                  type="image"
                  onSelect={(url) => {
                    update('uploadedImageUrl', url);
                  }}
                />
              )}
              {/* Show current image for txt2img */}
              {((data.imageSubType as string) || 'txt2img') === 'txt2img' && (data.uploadedImageUrl as string) && (
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">当前图片</Label>
                  <div className="relative rounded-lg overflow-hidden border border-border/50">
                    <img
                      src={data.uploadedImageUrl as string}
                      alt="当前素材"
                      className="w-full h-24 object-cover"
                    />
                    <button
                      className="absolute top-1 right-1 w-5 h-5 rounded bg-black/60 flex items-center justify-center text-white hover:bg-red-500/80 transition"
                      onClick={() => update('uploadedImageUrl', '')}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
              <ModelSelector
                type="image"
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
                  const subType = (data.imageSubType as string) || 'txt2img';
                  if (subType === 'txt2img') return '生成图片';
                  if (subType === 'img2img') return '参考描述重绘';
                  if (subType === 'bg-remove') return '处理背景';
                  if (subType === 'upscale') return '高分辨率重绘';
                  return '生成图片';
                })()}
              </Button>
    </>
  );
}
