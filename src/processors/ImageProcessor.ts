import sharp from "sharp";
import { stat, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { ConversionState, ConversionRecord } from "../state/ConversionState.js";

export interface ImageConvertOptions {
  inputPath: string;
  outputPath: string;
  width?: number;
  height?: number;
  quality?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  grayscale?: boolean;
  rotate?: number;
  generateIcons?: boolean;
  flip?: boolean;
  flop?: boolean;
  blur?: number;
  sharpen?: boolean;
  normalize?: boolean;
  tint?: string;
  trim?: boolean;
  background?: string;
  density?: number;
  strip?: boolean;
  progressive?: boolean;
  lossless?: boolean;
}

/**
 * ImageProcessor — Sharp-based image conversion
 * Supported input:  jpg, jpeg, png, webp, gif, avif, tiff, bmp, svg, heic, heif, raw, jp2, jxl
 * Supported output: jpg, jpeg, png, webp, gif, avif, tiff, ico, jxl
 */
export class ImageProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: ImageConvertOptions) {
    const { inputPath, outputPath } = options;
    const record = this.state.createRecord("image", inputPath, outputPath, options);

    try {
      if (options.generateIcons) {
        return await this.generateIconSet(options, record);
      }

      await this.processImage(options);

      const [inStat, outStat] = await Promise.all([
        stat(inputPath).catch(() => null),
        stat(outputPath).catch(() => null),
      ]);

      this.state.completeRecord(record, true, { inputSize: inStat?.size, outputSize: outStat?.size });
      return this.buildResult(record, inStat?.size, outStat?.size);
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private async processImage(opts: ImageConvertOptions) {
    const ext = opts.outputPath.split(".").pop()?.toLowerCase();
    let pipeline = sharp(opts.inputPath, { density: opts.density ?? 72 });

    if (opts.rotate) pipeline = pipeline.rotate(opts.rotate);
    if (opts.flip) pipeline = pipeline.flip();
    if (opts.flop) pipeline = pipeline.flop();
    if (opts.trim) pipeline = pipeline.trim();
    if (opts.grayscale) pipeline = pipeline.grayscale();
    if (opts.normalize) pipeline = pipeline.normalize();
    if (opts.blur && opts.blur > 0) pipeline = pipeline.blur(opts.blur);
    if (opts.sharpen) pipeline = pipeline.sharpen();
    if (opts.tint) pipeline = pipeline.tint(opts.tint);

    if (opts.width || opts.height) {
      pipeline = pipeline.resize(opts.width, opts.height, {
        fit: opts.fit ?? "cover",
        background: opts.background ?? { r: 255, g: 255, b: 255, alpha: 0 },
      });
    }

    const quality = opts.quality ?? 85;
    if (ext === "jpg" || ext === "jpeg") {
      pipeline = pipeline.jpeg({ quality, progressive: opts.progressive ?? false, mozjpeg: true });
    } else if (ext === "png") {
      pipeline = pipeline.png({ quality, progressive: opts.progressive ?? false, compressionLevel: 9 });
    } else if (ext === "webp") {
      pipeline = pipeline.webp({ quality, lossless: opts.lossless ?? false });
    } else if (ext === "avif") {
      pipeline = pipeline.avif({ quality, lossless: opts.lossless ?? false });
    } else if (ext === "tiff") {
      pipeline = pipeline.tiff({ quality });
    } else if (ext === "gif") {
      pipeline = pipeline.gif();
    } else if (ext === "jxl") {
      pipeline = pipeline.jxl({ quality, lossless: opts.lossless ?? false });
    }

    if (opts.strip) pipeline = pipeline.withMetadata({});

    await pipeline.toFile(opts.outputPath);
  }

  private async generateIconSet(opts: ImageConvertOptions, record: ConversionRecord) {
    const sizes = [16, 32, 64, 128, 256, 512];
    const outDir = dirname(opts.outputPath);
    const generated: string[] = [];

    for (const size of sizes) {
      const outPath = join(outDir, `icon-${size}x${size}.png`);
      await sharp(opts.inputPath).resize(size, size, { fit: "contain" }).png().toFile(outPath);
      generated.push(outPath);
    }

    const inStat = await stat(opts.inputPath).catch(() => null);
    this.state.completeRecord(record, true, { inputSize: inStat?.size });
    return {
      success: true,
      id: record.id,
      input: opts.inputPath,
      generatedIcons: generated,
      durationMs: record.durationMs,
      message: `Generated ${sizes.length} icon sizes in ${record.durationMs}ms`,
    };
  }

  private buildResult(record: ConversionRecord, inSize?: number, outSize?: number) {
    const compression =
      inSize != null && inSize > 0 && outSize != null
        ? `${((1 - outSize / inSize) * 100).toFixed(1)}%`
        : null;
    return {
      success: true,
      id: record.id,
      input: record.inputPath,
      output: record.outputPath,
      durationMs: record.durationMs,
      inputSize: inSize ? `${(inSize / 1024).toFixed(1)} KB` : null,
      outputSize: outSize ? `${(outSize / 1024).toFixed(1)} KB` : null,
      sizeReduction: compression,
      message: `Image converted successfully in ${record.durationMs}ms`,
    };
  }
}
