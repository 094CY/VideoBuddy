/**
 * 把用户上传的文件持久化到服务端，返回同源 URL。
 * 失败时退回 blob URL 并明确标记：调用方需告知用户「仅本次会话可用」。
 */
export interface UploadResult { url: string; persistent: boolean }

export async function persistUploadedFile(file: File): Promise<UploadResult> {
  try {
    const body = await file.arrayBuffer();
    const res = await fetch(
      `/api/assets/upload?name=${encodeURIComponent(file.name)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body,
        credentials: 'include',
      },
    );
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json() as { url?: string };
    if (!data.url) throw new Error('no url');
    return { url: data.url, persistent: true };
  } catch {
    return { url: URL.createObjectURL(file), persistent: false };
  }
}
