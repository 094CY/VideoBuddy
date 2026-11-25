import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useConfirmStore } from './confirm-store';

/** 挂在应用根节点一次即可。 */
export function ConfirmHost() {
  const { open, title, description, confirmText, cancelText, destructive, settle } =
    useConfirmStore();

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!v) settle(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>
            {cancelText || '取消'}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {confirmText || '确定'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
