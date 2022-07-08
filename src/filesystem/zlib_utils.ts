import { execFileSync } from 'child_process';
import { lstatSync, readFileSync, rm, writeFileSync } from 'fs';
import { dirname, sep } from 'path';
import zlib = require('zlib');

const tarFile = 'codio.tar';

const options = {
  params: {
    [zlib.constants.BROTLI_PARAM_MODE]: zlib.constants.BROTLI_MODE_TEXT,
  },
};

/**
 * Compress given source folder to a file and into given destination folder.
 * @param src Folder to compress.
 * @param dest Folder to save compress file to.
 */
export function compress(src: string, dest: string): void {
  const parentFolder = dirname(dest);
  const tarPath = `${parentFolder}${sep}${tarFile}`;
  archive(src, tarPath);
  const tarBuf = readFileSync(tarPath);
  const compressedContents = zlib.brotliCompressSync(tarBuf, options);
  writeFileSync(dest, compressedContents);
  rm(tarPath, { force: true, maxRetries: 3, recursive: true }, () => undefined);
}

/**
 * Archive given source to given destination file name.
 * @param src File or folder to archive.
 * @param dest Archive file name to create.
 */
function archive(src: string | string[], dest: string): void {
  const args = ['-cf', dest];

  // Change to given path if found
  if (typeof src === 'string') {
    src = ['-C', src, '.'];
  }
  try {
    execFileSync('tar', args.concat(src));
  } catch (error) {
    // Probably given file or folder does not exist
    console.log(`Archive error on ${src} to ${dest}: ${error.code} ${error.message}`);
  }
}

/**
 * Decompress given source file into given destination folder.
 * @param src Source file to decompress.
 * @param dest Folder to restore decompressed files to.
 */
export function decompress(src: string, dest: string): void {
  const buffer = readFileSync(src);
  const tarContents = zlib.brotliDecompressSync(buffer, options);
  const tarPath = `${dest}${sep}${tarFile}`;
  writeFileSync(tarPath, tarContents);
  restore(tarPath, dest);
  rm(tarPath, { force: true, maxRetries: 3, recursive: true }, () => undefined);
}

/**
 * Restore files found in given archive file into given destination folder.
 * @param src Archive file to decompress.
 * @param dest Folder where decompressed files are stored.
 */
function restore(src: string, dest: string): void {
  try {
    if (!lstatSync(dest).isDirectory()) {
      return; // TODO: Should create folder?
    }
    execFileSync('tar', ['-xmf', src, '-C', dest]);
  } catch (error) {
    // Probably given file or folder does not exist
    console.log(`Restore error on ${src} to ${dest}: ${error.code} ${error.message}`);
  }
}
