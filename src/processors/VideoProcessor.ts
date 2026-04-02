import { execFile } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { ConversionState, ConversionRecord } from "../state/ConversionState.js";

const execFileAsync = promisify(execFile);

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
  videoCodec?: string;
  audioCodec?: string;
  crf?: number;
  preset?: string;
  hwAccel?: boolean;
  subtitlePath?: string;
  extractFrames?: boolean;
  frameRate?: number;
}

/**
 * VideoProcessor — FFmpeg-based video conversion
 * Supported input:  mp4, webm, avi, mov, mkv, flv, wmv, m4v, 3gp, ts, m2ts, vob, ogv, hevc, h265
 * Supported output: mp4, webm, avi, mov, mkv, gif, ts, ogv, flv, hevc
 */
export class VideoProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: VideoConvertOptions) {
    const record = this.state.createRecord("video", options.inputPath, options.outputPath, options);
    try {
      await execFileAsync("ffmpeg", ["-version"]).catch(() => {
        throw new Error("ffmpeg not found. Install: macOS: `brew install ffmpeg` | Ubuntu: `sudo apt install ffmpeg`");
      });

      const args = this.buildArgs(options);
      await execFileAsync("ffmpeg", ["-y", "-i", options.inputPath, ...args, options.outputPath]);

      const [inStat, outStat] = await Promise.all([
        stat(options.inputPath).catch(() => null),
        stat(options.outputPath).catch(() => null),
      ]);

      this.state.completeRecord(record, true, { inputSize: inStat?.size, outputSize: outStat?.size });
      return this.buildResult(record, inStat?.size, outStat?.size);
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private buildArgs(opts: VideoConvertOptions): string[] {
    const args: string[] = [];
    const ext = opts.outputPath.split(".").pop()?.toLowerCase();

    if (opts.hwAccel) args.unshift("-hwaccel", "auto");
    if (opts.startTime) args.push("-ss", opts.startTime);
    if (opts.duration) args.push("-t", opts.duration);
    if (opts.subtitlePath) args.push("-vf", `subtitles=${opts.subtitlePath}`);
    if (opts.extractFrames) {
      args.push("-vf", `fps=${opts.frameRate ?? 1}`);
      return args;
    }
    if (opts.resolution) args.push("-vf", `scale=${opts.resolution.replace("x", ":")}`);
    if (opts.fps) args.push("-r", String(opts.fps));
    if (opts.videoBitrate) args.push("-b:v", opts.videoBitrate);
    if (opts.audioBitrate) args.push("-b:a", opts.audioBitrate);
    if (opts.crf != null) args.push("-crf", String(opts.crf));
    if (opts.preset) args.push("-preset", opts.preset);
    if (opts.noAudio) args.push("-an");

    if (opts.videoCodec) {
      args.push("-c:v", opts.videoCodec);
    } else if (ext === "mp4" || ext === "m4v") {
      args.push("-c:v", "libx264");
    } else if (ext === "webm") {
      args.push("-c:v", "libvpx-vp9");
    } else if (ext === "hevc") {
      args.push("-c:v", "libx265");
    } else if (ext === "gif") {
      args.push("-vf", `fps=${opts.fps ?? 10},scale=${opts.resolution?.replace("x", ":") ?? "320:-1"}:flags=lanczos`, "-loop", "0");
    } else if (ext === "ogv") {
      args.push("-c:v", "libtheora");
    } else if (ext === "ts") {
      args.push("-c:v", "libx264", "-c:a", "aac");
    }

    if (opts.audioCodec && !opts.noAudio) args.push("-c:a", opts.audioCodec);

    return args;
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
      inputSize: inSize ? `${(inSize / 1024 / 1024).toFixed(2)} MB` : null,
      outputSize: outSize ? `${(outSize / 1024 / 1024).toFixed(2)} MB` : null,
      sizeReduction: compression,
      message: `Video converted successfully in ${record.durationMs}ms`,
    };
  }
}
