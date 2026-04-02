import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, basename } from "path";
import { createGzip, createGunzip, createBrotliCompress, createBrotliDecompress, createDeflate, createInflate } from "zlib";
import { createReadStream, createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { ConversionState } from "../state/ConversionState.js";

const execFileAsync = promisify(execFile);

export interface ArchiveConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: string;
  outputFormat?: string;
  compressionLevel?: number;
  extractDir?: string;
  listOnly?: boolean;
}

/**
 * ArchiveProcessor — archive and compression handling
 * Supported input:  gz, bz2, br, zip, tar, tar.gz, tgz, tar.bz2, tar.xz, 7z, rar, zst
 * Supported output: gz, br, zip, tar.gz, tgz, zst
 * 7z/rar extraction requires 7zip installed: brew install p7zip
 */
export class ArchiveProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: ArchiveConvertOptions) {
    const { inputPath, outputPath } = options;
    const inExt = (options.inputFormat ?? this.detectExt(inputPath)).toLowerCase();
    const outExt = (options.outputFormat ?? this.detectExt(outputPath)).toLowerCase();
    const record = this.state.createRecord("archive", inputPath, outputPath, options);

    try {
      if (options.listOnly) {
        const listing = await this.listArchive(inputPath, inExt);
        this.state.completeRecord(record, true, {});
        return { success: true, id: record.id, input: inputPath, listing, durationMs: record.durationMs };
      }

      if (outExt === "gz" && !inExt.includes("tar")) {
        await this.gzipFile(inputPath, outputPath, options.compressionLevel);
      } else if (inExt === "gz" && !inExt.includes("tar")) {
        await this.gunzipFile(inputPath, outputPath);
      } else if (outExt === "br") {
        await this.brotliCompress(inputPath, outputPath);
      } else if (inExt === "br") {
        await this.brotliDecompress(inputPath, outputPath);
      } else if (outExt === "zip") {
        await execFileAsync("zip", ["-r", outputPath, basename(inputPath)], { cwd: join(inputPath, "..") });
      } else if (inExt === "zip") {
        const dir = options.extractDir ?? outputPath;
        await mkdir(dir, { recursive: true });
        await execFileAsync("unzip", ["-o", inputPath, "-d", dir]);
      } else if (outExt === "tgz" || outExt === "tar.gz") {
        await execFileAsync("tar", ["-czf", outputPath, "-C", join(inputPath, ".."), basename(inputPath)]);
      } else if (inExt === "tgz" || inExt === "tar.gz") {
        const dir = options.extractDir ?? outputPath;
        await mkdir(dir, { recursive: true });
        await execFileAsync("tar", ["-xzf", inputPath, "-C", dir]);
      } else if (inExt === "tar.bz2" || inExt === "tbz2") {
        const dir = options.extractDir ?? outputPath;
        await mkdir(dir, { recursive: true });
        await execFileAsync("tar", ["-xjf", inputPath, "-C", dir]);
      } else if (inExt === "tar.xz" || inExt === "txz") {
        const dir = options.extractDir ?? outputPath;
        await mkdir(dir, { recursive: true });
        await execFileAsync("tar", ["-xJf", inputPath, "-C", dir]);
      } else if (inExt === "7z" || inExt === "rar") {
        const dir = options.extractDir ?? outputPath;
        await mkdir(dir, { recursive: true });
        await execFileAsync("7z", ["x", "-o" + dir, inputPath]).catch(() => {
          throw new Error("7z not found. Install: brew install p7zip | sudo apt install p7zip-full");
        });
      } else {
        throw new Error(`Unsupported archive conversion: ${inExt} → ${outExt}`);
      }

      this.state.completeRecord(record, true, {});
      return { success: true, id: record.id, input: inputPath, output: outputPath, durationMs: record.durationMs, message: `Archive processed in ${record.durationMs}ms` };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private detectExt(filePath: string): string {
    if (filePath.endsWith(".tar.gz")) return "tar.gz";
    if (filePath.endsWith(".tar.bz2")) return "tar.bz2";
    if (filePath.endsWith(".tar.xz")) return "tar.xz";
    return filePath.split(".").pop() ?? "";
  }

  private async gzipFile(input: string, output: string, level?: number) {
    const gzip = createGzip({ level: level ?? 6 });
    await pipeline(createReadStream(input), gzip, createWriteStream(output));
  }

  private async gunzipFile(input: string, output: string) {
    await pipeline(createReadStream(input), createGunzip(), createWriteStream(output));
  }

  private async brotliCompress(input: string, output: string) {
    await pipeline(createReadStream(input), createBrotliCompress(), createWriteStream(output));
  }

  private async brotliDecompress(input: string, output: string) {
    await pipeline(createReadStream(input), createBrotliDecompress(), createWriteStream(output));
  }

  private async listArchive(inputPath: string, ext: string): Promise<string[]> {
    if (ext === "zip") {
      const { stdout } = await execFileAsync("unzip", ["-l", inputPath]);
      return stdout.split("\n").slice(3).map(l => l.trim()).filter(Boolean);
    } else if (ext.includes("tar") || ext === "tgz") {
      const { stdout } = await execFileAsync("tar", ["-tf", inputPath]);
      return stdout.split("\n").filter(Boolean);
    } else if (ext === "7z" || ext === "rar") {
      const { stdout } = await execFileAsync("7z", ["l", inputPath]);
      return stdout.split("\n").filter(Boolean);
    }
    return [];
  }
}
