import { stat, mkdir } from "fs/promises";
import { dirname, basename, join, extname } from "path";
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
}

export class ImageProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: ImageConvertOptions) {
    const {
      inputPath, outputPath, width, height, quality = 85,
      fit = "inside", grayscale, rotate, generateIcons,
    } = options;

    const record = this.state.createRecord("image", inputPath, outputPath, {
      width, height, quality, fit, grayscale, rotate, generateIcons,
    });

    try {
      // Dynamic import — sharp is optional dep; fail gracefully
      let sharp: any;
      try {
        const mod = await import("sharp");
        sharp = mod.default;
      } catch {
        throw new Error(
          "sharp not installed. Run: npm install sharp\n" +
          "For browser environments, use the Canvas API fallback or install sharp for Node.js."
        );
      }

      const inStat = await stat(inputPath).catch(() => null);
      const outExt = extname(outputPath).slice(1).toLowerCase();
      const outDir = dirname(outputPath);
      await mkdir(outDir, { recursive: true });

      if (generateIcons) {
        return await this.generateIconSet(sharp, inputPath, outDir, record, inStat?.size);
      }

      let pipeline = sharp(inputPath);

      if (rotate) pipeline = pipeline.rotate(rotate);
      if (grayscale) pipeline = pipeline.grayscale();
      if (width || height) pipeline = pipeline.resize(width, height, { fit });

      // Format output
      if (outExt === "jpg" || outExt === "jpeg") {
        pipeline = pipeline.jpeg({ quality });
      } else if (outExt === "png") {
        pipeline = pipeline.png({ quality });
      } else if (outExt === "webp") {
        pipeline = pipeline.webp({ quality });
      } else if (outExt === "avif") {
        pipeline = pipeline.avif({ quality });
      } else if (outExt === "gif") {
        pipeline = pipeline.gif();
      } else if (outExt === "tiff" || outExt === "tif") {
        pipeline = pipeline.tiff({ quality });
      } else if (outExt === "ico") {
        // ICO: resize to 256x256 PNG, then rename (basic ICO support)
        pipeline = pipeline.resize(256, 256, { fit: "inside" }).png();
      }

      await pipeline.toFile(outputPath);

      const outStat = await stat(outputPath).catch(() => null);
      this.state.completeRecord(record, true, {
        inputSize: inStat?.size,
        outputSize: outStat?.size,
      });

      return {
        success: true,
        id: record.id,
        input: inputPath,
        output: outputPath,
        durationMs: record.durationMs,
        inputSize: inStat ? `${(inStat.size / 1024).toFixed(1)} KB` : null,
        outputSize: outStat ? `${(outStat.size / 1024).toFixed(1)} KB` : null,
        sizeReduction: inStat && outStat && inStat.size > 0
          ? `${((1 - outStat.size / inStat.size) * 100).toFixed(1)}%`
          : null,
        message: `Image converted successfully in ${record.durationMs}ms`,
      };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private async generateIconSet(
    sharp: any,
    inputPath: string,
    outDir: string,
    record: ConversionRecord,
    inSize?: number
  ) {
    const sizes = [16, 32, 48, 64, 96, 128, 192, 256, 512];
    const nameBase = basename(inputPath, extname(inputPath));
    const outputs: string[] = [];

    for (const size of sizes) {
      const outPath = join(outDir, `${nameBase}-${size}x${size}.png`);
      await sharp(inputPath).resize(size, size, { fit: "inside" }).png().toFile(outPath);
      outputs.push(outPath);
    }

    this.state.completeRecord(record, true, { inputSize: inSize });

    return {
      success: true,
      id: record.id,
      input: inputPath,
      iconSet: outputs,
      sizes: sizes.map((s) => `${s}x${s}`),
      durationMs: record.durationMs,
      message: `Icon set (${sizes.length} sizes) generated in ${record.durationMs}ms`,
    };
  }
}
