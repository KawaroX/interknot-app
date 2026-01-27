import { Buffer } from 'buffer';

export const fileToDataUrl = async (file: File) => {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'image/png';
  const base64 = buffer.toString('base64');
  return `data:${mime};base64,${base64}`;
};
