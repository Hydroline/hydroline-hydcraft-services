import { BadRequestException } from '@nestjs/common';
import type { Request } from 'express';
import Busboy from 'busboy';
import type { Readable } from 'node:stream';

export type ParsedMultipartFile = {
  fieldName: string;
  filename: string;
  mimeType: string;
  encoding: string;
  stream: Readable;
};

export type ParseSingleFileMultipartOptions = {
  fileFieldName: string;
  maxFileSizeBytes: number;
  /** Optional allow-list of mime types. */
  allowedMimeTypes?: string[];
};

export async function parseSingleFileMultipart(
  req: Request,
  options: ParseSingleFileMultipartOptions,
): Promise<{ fields: Record<string, string>; file: ParsedMultipartFile }> {
  if (!req.headers['content-type']?.includes('multipart/form-data')) {
    throw new BadRequestException('Expected multipart/form-data');
  }

  const fields: Record<string, string> = {};

  return await new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: options.maxFileSizeBytes,
      },
    });

    let resolved = false;
    let fileSeen = false;

    busboy.on('field', (name, value) => {
      if (fileSeen) {
        reject(
          new BadRequestException(
            'Multipart fields must be provided before the file field',
          ),
        );
        return;
      }

      // last-write-wins; for arrays use comma-separated per existing DTO transforms
      fields[name] = value;
    });

    busboy.on('file', (fieldName, file, info) => {
      if (fieldName !== options.fileFieldName) {
        // drain unexpected file fields
        file.resume();
        return;
      }

      fileSeen = true;

      const { filename, mimeType, encoding } = info;

      if (
        options.allowedMimeTypes &&
        options.allowedMimeTypes.length > 0 &&
        !options.allowedMimeTypes.includes(mimeType)
      ) {
        file.resume();
        reject(new BadRequestException('Unsupported file type'));
        return;
      }

      file.on('limit', () => {
        file.destroy(new BadRequestException('File too large'));
      });

      if (resolved) {
        file.resume();
        return;
      }
      resolved = true;
      resolve({
        fields,
        file: {
          fieldName,
          filename,
          mimeType,
          encoding,
          stream: file,
        },
      });
    });

    busboy.on('error', (err) => reject(err));

    busboy.on('finish', () => {
      if (!resolved) {
        reject(new BadRequestException('Missing file field'));
      }
    });

    req.pipe(busboy);
  });
}
