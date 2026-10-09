import { MAX_RECEIPT_BYTES } from '@hanjing/shared';
import { ApiError } from '@/api/http';

const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * Shrink a receipt photo on the phone before upload (003 FR-006, research R7): at most 1600 px on the long side,
 * re-encoded as JPEG. PDFs, and images the browser cannot decode (e.g. HEIC outside Safari), are sent as they are.
 * A file still over 10 MB is refused here, before spending the upload.
 */
export async function reduceImage(file: File): Promise<File> {
  let result = file;
  if (file.type.startsWith('image/')) {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (context) {
        // White background: transparent PNG areas would otherwise turn black in JPEG.
        context.fillStyle = '#fff';
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
        if (blob && blob.size < file.size) {
          result = new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
        }
      }
      bitmap.close();
    } catch {
      // Not decodable here: keep the original file.
    }
  }
  if (result.size > MAX_RECEIPT_BYTES) throw new ApiError(413, 'file_too_large');
  return result;
}
