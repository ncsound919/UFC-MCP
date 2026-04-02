import { execFile } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { ConversionState, ConversionRecord } from "../state/ConversionState.js";

const execFileAsync = promisify(execFile);

export interface AudioConvertOptions {
  inputPath: string;
  outputPath: string;
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
  normalize?: boolean;
  volume?: number;
  startTime?: string;
  duration?: string;
  fadeIn?: number;
  fadeOut?: number;
}

/**
 * AudioProcessor — FFmpeg-based audio conversion
 * Supported input:  mp3, wav, flac, aac, ogg, m4a, aiff, opus, wma, ac3, dts, amr, ra, wv, ape, tta, mka
 * Supported output: mp3, wav, flac, aac, ogg, m4a, aiff, opus, wma, ac3, amr, wv, mka
 */
export class AudioProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: AudioConvertOptions) {
    const { inputPath, outputPath, bitrate, sampleRate, channels, normalize, volume, startTime, duration, fadeIn, fadeOut } = options;
    const record = this.state.createRecord("audio", inputPath, outputPath, {
      bitrate, sampleRate, channels, normalize, volume, startTime, duration, fadeIn, fadeOut,
    });

    try {
      await execFileAsync("ffmpeg", ["-version"]).catch(() => {
        throw new Error(
          "ffmpeg not found. Install: macOS: `brew install ffmpeg` | Ubuntu: `sudo apt install ffmpeg` | Windows: https://ffmpeg.org/download.html"
        );
      });

      const codecArgs = this.buildArgs(inputPath, outputPath, options);
      await execFileAsync("ffmpeg", ["-y", "-i", inputPath, ...codecArgs, outputPath]);

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

  private buildArgs(input: string, output: string, opts: AudioConvertOptions): string[] {
    const args: string[] = [];
    const ext = output.split(".").pop()?.toLowerCase();

    if (opts.startTime) args.push("-ss", opts.startTime);
    if (opts.duration) args.push("-t", opts.duration);
    if (opts.bitrate) args.push("-b:a", opts.bitrate);
    if (opts.sampleRate) args.push("-ar", String(opts.sampleRate));
    if (opts.channels) args.push("-ac", String(opts.channels));

    const filterParts: string[] = [];
    if (opts.normalize) filterParts.push("loudnorm");
    if (opts.volume != null) filterParts.push(`volume=${opts.volume}dB`);
    if (opts.fadeIn != null) filterParts.push(`afade=t=in:st=0:d=${opts.fadeIn}`);
    if (opts.fadeOut != null) filterParts.push(`afade=t=out:st=0:d=${opts.fadeOut}`);
    if (filterParts.length > 0) args.push("-af", filterParts.join(","));

    if (ext === "mp3") args.push("-codec:a", "libmp3lame");
    else if (ext === "ogg") args.push("-codec:a", "libvorbis");
    else if (ext === "aac" || ext === "m4a") args.push("-codec:a", "aac");
    else if (ext === "flac") args.push("-codec:a", "flac");
    else if (ext === "opus" || ext === "mka") args.push("-codec:a", "libopus");
    else if (ext === "wav") args.push("-codec:a", "pcm_s16le");
    else if (ext === "aiff") args.push("-codec:a", "pcm_s16be");
    else if (ext === "wma") args.push("-codec:a", "wmav2");
    else if (ext === "ac3") args.push("-codec:a", "ac3");
    else if (ext === "amr") args.push("-codec:a", "libopencore_amrnb", "-ar", "8000", "-ac", "1");
    else if (ext === "wv") args.push("-codec:a", "wavpack");

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
      inputSize: inSize ? `${(inSize / 1024).toFixed(1)} KB` : null,
      outputSize: outSize ? `${(outSize / 1024).toFixed(1)} KB` : null,
      sizeReduction: compression,
      message: `Audio converted successfully in ${record.durationMs}ms`,
    };
  }
}
