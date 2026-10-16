import { config } from './config';

export const photoTypes: Record<string,string> = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
export function validatePhoto(file: Pick<File,'type'|'size'>) {
  if (!photoTypes[file.type]) throw new Error('Choose a JPEG, PNG, or WebP photo.');
  if (file.size > config.maxUploadMB * 1024 * 1024) throw new Error(`Maximum photo size is ${config.maxUploadMB} MB.`);
}
