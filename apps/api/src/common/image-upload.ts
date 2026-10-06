import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

/** Interceptor para un campo de archivo "file" en memoria (máx. 8 MB). */
export const ImageUpload = () => FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
