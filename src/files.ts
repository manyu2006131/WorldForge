export function readData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function importImage(file: File) {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
    throw Error('请选择 PNG、JPEG、WebP 或 GIF 图片。');
  }
  if (file.size > 25 * 1024 * 1024) throw Error('单张图片最大支持 25 MB。');
  return window.forge.writeAsset({ name: file.name, data: await readData(file) });
}

export const report = (error: unknown) => alert(error instanceof Error ? error.message : String(error));
