import { useState, useCallback } from 'react';
import { useCommentStore } from '@/stores/comment-store';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  MessageSquare,
  X,
  CheckCircle,
  Circle,
  Send,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

interface CommentPanelProps {
  projectId: string;
  onClose: () => void;
}

export function CommentPanel({ projectId, onClose }: CommentPanelProps) {
  const { user } = useAuthStore();
  const {
    getComments,
    addComment,
    deleteComment,
    resolveComment,
    unresolveComment,
    getUnresolvedCount,
  } = useCommentStore();

  const [newComment, setNewComment] = useState('');
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('all');

  const comments = getComments(projectId);
  const unresolvedCount = getUnresolvedCount(projectId);

  const filteredComments = comments.filter((c) => {
    if (filter === 'unresolved') return !c.isResolved;
    if (filter === 'resolved') return c.isResolved;
    return true;
  });

  const handleAddComment = useCallback(() => {
    if (!newComment.trim() || !user) return;
    addComment({
      projectId,
      userId: user.id,
      userName: user.name,
      content: newComment,
    });
    setNewComment('');
    toast.success('批注已添加');
  }, [newComment, user, projectId, addComment]);

  return (
    <div className="absolute top-2 right-2 w-80 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[calc(100vh-180px)] animate-scale-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">批注</span>
          {unresolvedCount > 0 && (
            <Badge variant="secondary" className="text-[10px] text-muted-foreground h-5 px-1.5">
              {unresolvedCount} 待解决
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <p className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border/30">
        仅当前账号可见，用于记录节点问题；不向其他成员同步。
      </p>

      {/* Filters */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border/30">
        {(['all', 'unresolved', 'resolved'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-[11px] transition ${
              filter === f
                ? 'bg-white/[0.06] text-white/60'
                : 'text-muted-foreground hover:bg-accent'
            }`}
          >
            {f === 'all' ? '全部' : f === 'unresolved' ? '未解决' : '已解决'}
          </button>
        ))}
      </div>

      {/* Comment list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {filteredComments.length === 0 ? (
            <div className="text-center py-8">
              <MessageSquare className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">暂无批注</p>
            </div>
          ) : (
            filteredComments.map((comment) => (
              <div
                key={comment.id}
                className={`p-3 rounded-lg border transition ${
                  comment.isResolved
                    ? 'bg-slate-500/5 border-slate-500/10 opacity-70'
                    : 'bg-accent/20 border-border/30'
                }`}
              >
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                      <span className="text-[11px] font-bold text-muted-foreground">
                        {comment.userName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span className="text-xs font-medium">{comment.userName}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDate(comment.createdAt)}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-foreground leading-relaxed mb-2">
                  {comment.content}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2"
                    onClick={() => {
                      if (comment.isResolved) {
                        unresolveComment(projectId, comment.id);
                      } else {
                        resolveComment(projectId, comment.id);
                      }
                    }}
                  >
                    {comment.isResolved ? (
                      <><Circle className="w-3 h-3 mr-0.5" /> 重新打开</>
                    ) : (
                      <><CheckCircle className="w-3 h-3 mr-0.5" /> 标为已解决</>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] px-2 text-red-400 hover:text-red-300"
                    onClick={() => {
                      deleteComment(projectId, comment.id);
                      toast.success('批注已删除');
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* New comment input */}
      <div className="p-3 border-t border-border/50">
        <div className="flex gap-2">
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="添加批注..."
            className="text-xs resize-none bg-background/50 min-h-[60px]"
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleAddComment();
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <Button
            size="sm"
            className="h-7 text-xs bg-white text-black hover:bg-white/90"
            onClick={handleAddComment}
            disabled={!newComment.trim()}
          >
            <Send className="w-3 h-3 mr-1" /> 发送
          </Button>
        </div>
      </div>
    </div>
  );
}
