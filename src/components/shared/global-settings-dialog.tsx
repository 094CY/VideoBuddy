import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { SettingsPage } from '@/pages/settings';
import { useSettingsPanelStore } from '@/stores/settings-panel-store';

/**
 * 全局设置弹窗，挂在 App 根层。
 *
 * 工作台是独立全屏路由（不走 MainLayout），如果只在 MainLayout 里渲染，
 * 画布中打开设置就只能整页跳到 /settings/*，关闭后还会丢回首页。
 * 放到根层后，任何页面都能原位弹窗，关闭即回到原页面。
 */
export function GlobalSettingsDialog() {
  const { open, section, openSettings, closeSettings } = useSettingsPanelStore();

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? openSettings(section) : closeSettings())}
    >
      <DialogContent
        showCloseButton={false}
        className="p-0 overflow-hidden flex flex-col gap-0 [&>*]:min-h-0"
        style={{
          maxWidth: '1040px',
          width: '88vw',
          height: '84vh',
          maxHeight: '780px',
          minHeight: 'min(600px, 84vh)',
        }}
      >
        <SettingsPage onClose={closeSettings} initialSection={section} />
      </DialogContent>
    </Dialog>
  );
}
