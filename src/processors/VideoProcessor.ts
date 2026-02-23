import { exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { ConversionState, ConversionRecord } from "../state/ConversionState.js";

const execAsync = promisify(exec);

export interface VideoConvertOptions {
  inputPath: string;
  outputPath: string;
  resolution?: string;
  fps?: number;
  videoBitrate?: string;
  audioBitrate?: string;
  noAudio?: boolean;
  startTime?: string;
  duration?: string;
}

export class VideoProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: VideoConvertOptions) {
    const {
      inputPath, outputPath, resolution, fps,
      videoBitrate, audioBitrate, noAudio, startTime, duration,
    } = options;

    const record = this.state.createRecord("video", inputPath, outputPath, {
      resolution, fps, videoBitrate, audioBitrate, noAudio,
    });

    try {
      await execAsync("ffmpeg -version").catch(() => {
        throw new Error(
          "ffmpeg not found. Install it: macOS: `brew install ffmpeg` | Ubuntu: `sudo apt install ffmpeg`"
        );
      });

      const args = this.buildArgs(outputPath, { resolution, fps, videoBitrate, audioBitrate, noAudio, startTime, duration });
      const cmd = `ffmpeg -y ${startTime ? `-ss ${startTime}` : ""} -i "${inputPath}" ${args} "${outputPath}"`;

      await execAsync(cmd, { maxBuffer: 1024 * 1024 * 50 }); // 50MB buffer for large videos

      const [inStat, outStat] = await Promise.all([
        stat(inputPath).catch(() => null),
        stat(outputPath).catch(() => null),
      ]);

      this.state.completeRecord(record, true, {
        inputSize: inStat?.size,
        outputSize: outStat?.size,
      });

      return this.buildResult(record, inStat?.size, outStat?.size);
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private buildArgs(
    output: string,
    opts: Omit<VideoConvertOptions, "inputPath" | "outputPath">
  ): string {
    const args: string[] = [];
    const ext = output.split(".").pop()?.toLowerCase();

    if (opts.duration) args.push(`-t ${opts.duration}`);
    if (opts.resolution) args.push(`-s ${opts.resolution}`);
    if (opts.fps) args.push(`-r ${opts.fps}`);
    if (opts.videoBitrate) args.push(`-b:v ${opts.videoBitrate}`);
    if (opts.noAudio) args.push("-an");
    else if (opts.audioBitrate) args.push(`-b:a ${opts.audioBitrate}`);

    // Format-specific settings
    if (ext === "mp4") {
      args.push("-codec:v libx264 -preset fast -crf 22");
      if (!opts.noAudio) args.push("-codec:a aac");
    } else if (ext === "webm") {
      args.push("-codec:v libvpx-vp9 -crf 30 -b:v 0");
      if (!opts.noAudio) args.push("-codec:a libopus");
    } else if (ext === "gif") {
      args.push("-vf 'fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse'");
    } else if (ext === "mov") {
      args.push("-codec:v libx264 -codec:a aac");
    } else if (ext === "avi") {
      args.push("-codec:v libxvid -codec:a libmp3lame");
    }

    return args.join(" ");
  }

  private buildResult(record: ConversionRecord, inSize?: number, outSize?: number) {
    const sizeReduction =
      inSize && outSize ? `${((1 - outSize / inSize) * 100).toFixed(1)}%` : null;
    return {
      success: true,
      id: record.id,
      input: record.inputPath,
      output: record.outputPath,
      durationMs: record.durationMs,
      inputSize: inSize ? `${(inSize / 1024 / 1024).toFixed(2)} MB` : null,
      outputSize: outSize ? `${(outSize / 1024 / 1024).toFixed(2)} MB` : null,
      sizeReduction,
      message: `Video converted successfully in ${record.durationMs}ms`,
    };
  }
}
