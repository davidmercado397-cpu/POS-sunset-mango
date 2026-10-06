import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { ENV, Env } from '../config/env';

const MAX_BYTES = 8 * 1024 * 1024;

/** Guarda imágenes redimensionadas en WebP dentro de UPLOADS_DIR/<negocio>/. */
@Injectable()
export class UploadsService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async saveImage(tenantId: string, file: Express.Multer.File | undefined, size: number): Promise<string> {
    if (!file) throw new BadRequestException('Adjunta una imagen');
    if (file.size > MAX_BYTES) throw new BadRequestException('La imagen supera 8 MB');
    if (!/^image\/(jpeg|png|webp|gif|avif|heic|heif)$/.test(file.mimetype)) {
      throw new BadRequestException('Formato no soportado. Usa JPG, PNG o WebP');
    }
    let buffer: Buffer;
    try {
      buffer = await sharp(file.buffer)
        .rotate()
        .resize(size, size, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch {
      throw new BadRequestException('No se pudo procesar la imagen');
    }
    const dir = join(resolve(this.env.uploadsDir), tenantId);
    await mkdir(dir, { recursive: true });
    const name = `${randomUUID()}.webp`;
    await writeFile(join(dir, name), buffer);
    return `/uploads/${tenantId}/${name}`;
  }

  /** Borra una imagen previa del mismo negocio (ignora errores). */
  async remove(tenantId: string, url: string | null | undefined): Promise<void> {
    if (!url) return;
    const prefix = `/uploads/${tenantId}/`;
    if (!url.startsWith(prefix)) return;
    const name = url.slice(prefix.length);
    if (!/^[0-9a-f-]+\.webp$/.test(name)) return;
    await unlink(join(resolve(this.env.uploadsDir), tenantId, name)).catch(() => undefined);
  }
}
