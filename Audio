import { exec } from "child_process";
import { promisify } from "util";
import { stat } from "fs/promises";
import { ConversionState, ConversionRecord } from "../state/ConversionState.js";

const execAsync = promisify(exec);

export interface AudioConvertOptions {
  inputPath: string;
  outputPath: string;
  bitrate?: string;
  sampleRate?: number;
  channels?: number;
}

export class AudioProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: AudioConvertOptions) {
    const { inputPath, outputPath, bitrate, sampleRate, channels } = options;
    const record = this.state.createRecord("audio", inputPath, outputPath, {
      bitrate, sampleRate, channels,
    });

    try {
      // Verify ffmpeg is available
      await execAsync("ffmpeg -version").catch(() => {
        throw new Error(
          "ffmpeg not found. Install it: macOS: `brew install ffmpeg` | Ubuntu: `sudo apt install ffmpeg` | Windows: https://ffmpeg.org/download.html"
        );
      });

      const args = this.buildArgs(inputPath, outputPath, { bitrate, sampleRate, channels });
      const cmd = `ffmpeg -y -i "${inputPath}" ${args} "${outputPath}"`;
      
      await execAsync(cmd);

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
    _input: string,
    output: string,
    opts: Omit<AudioConvertOptions, "inputPath" | "outputPath">
  ): string {
    const args: string[] = [];
    const ext = output.split(".").pop()?.toLowerCase();

    if (opts.bitrate) args.push(`-b:a ${opts.bitrate}`);
    if (opts.sampleRate) args.push(`-ar ${opts.sampleRate}`);
    if (opts.channels) args.push(`-ac ${opts.channels}`);

    // Format-specific codec choices
    if (ext === "mp3") args.push("-codec:a libmp3lame");
    else if (ext === "ogg") args.push("-codec:a libvorbis");
    else if (ext === "aac" || ext === "m4a") args.push("-codec:a aac");
    else if (ext === "flac") args.push("-codec:a flac");
    else if (ext === "opus") args.push("-codec:a libopus");
    else if (ext === "wav") args.push("-codec:a pcm_s16le");
    else if (ext === "aiff") args.push("-codec:a pcm_s16be");

    return args.join(" ");
  }

  private buildResult(record: ConversionRecord, inSize?: number, outSize?: number) {
    const compression =
      inSize && outSize ? `${((1 - outSize / inSize) * 100).toFixed(1)}%` : null;
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
