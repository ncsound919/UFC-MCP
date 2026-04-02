import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, stat } from "fs/promises";
import { ConversionState } from "../state/ConversionState.js";

const execFileAsync = promisify(execFile);

export interface FontConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: string;
  outputFormat?: string;
  subsetting?: string[];
  unicodeRange?: string;
}

/**
 * FontProcessor — font format conversion
 * Supported input:  ttf, otf, woff, woff2
 * Supported output: woff, woff2, ttf, otf, css (generates @font-face CSS snippet)
 * Requires: fonttools (pip install fonttools brotli zopfli) OR woff2 CLI
 */
export class FontProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: FontConvertOptions) {
    const { inputPath, outputPath } = options;
    const inExt = (options.inputFormat ?? inputPath.split(".").pop() ?? "").toLowerCase();
    const outExt = (options.outputFormat ?? outputPath.split(".").pop() ?? "").toLowerCase();
    const record = this.state.createRecord("font", inputPath, outputPath, options);

    try {
      if (outExt === "css") {
        const css = this.generateFontFaceCSS(inputPath, inExt);
        await writeFile(outputPath, css, "utf8");
        this.state.completeRecord(record, true, {});
        return { success: true, id: record.id, input: inputPath, output: outputPath, durationMs: record.durationMs, message: "@font-face CSS generated" };
      }

      if (outExt === "woff2") {
        await execFileAsync("python3", ["-m", "fonttools", "ttLib.woff2", "compress", inputPath, "-o", outputPath]).catch(() => {
          throw new Error("fonttools not found. Install: pip install fonttools brotli");
        });
      } else if (inExt === "woff2" && (outExt === "ttf" || outExt === "otf")) {
        await execFileAsync("python3", ["-m", "fonttools", "ttLib.woff2", "decompress", inputPath, "-o", outputPath]).catch(() => {
          throw new Error("fonttools not found. Install: pip install fonttools brotli");
        });
      } else if (outExt === "woff") {
        await execFileAsync("python3", ["-m", "fonttools", "subset", inputPath, `--output-file=${outputPath}`, "--flavor=woff"]).catch(() => {
          throw new Error("fonttools not found. Install: pip install fonttools");
        });
      } else if (outExt === "ttf" || outExt === "otf") {
        await execFileAsync("python3", ["-m", "fonttools", "subset", inputPath, `--output-file=${outputPath}`]).catch(() => {
          throw new Error("fonttools not found. Install: pip install fonttools");
        });
      } else {
        throw new Error(`Unsupported font conversion: ${inExt} → ${outExt}`);
      }

      const [inStat, outStat] = await Promise.all([
        stat(inputPath).catch(() => null),
        stat(outputPath).catch(() => null),
      ]);

      this.state.completeRecord(record, true, { inputSize: inStat?.size, outputSize: outStat?.size });
      return {
        success: true, id: record.id, input: inputPath, output: outputPath,
        inputSize: inStat?.size ? `${(inStat.size / 1024).toFixed(1)} KB` : null,
        outputSize: outStat?.size ? `${(outStat.size / 1024).toFixed(1)} KB` : null,
        durationMs: record.durationMs, message: `Font converted from ${inExt} to ${outExt} in ${record.durationMs}ms`,
      };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private generateFontFaceCSS(fontPath: string, ext: string): string {
    const name = fontPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "CustomFont";
    const mimeTypes: Record<string, string> = {
      woff2: "font/woff2", woff: "font/woff", ttf: "font/truetype", otf: "font/opentype",
    };
    const mime = mimeTypes[ext] ?? "font/truetype";
    return `@font-face {\n  font-family: '${name}';\n  src: url('${fontPath}') format('${ext}');\n  font-weight: normal;\n  font-style: normal;\n  font-display: swap;\n}\n`;
  }
}
