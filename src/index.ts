#!/usr/bin/env node
/**
 * File Converter MCP Server
 * Handles audio, video, image, and document file conversions
 * Compatible with Claude Desktop / any MCP-compatible host
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { basename } from "path";
import { AudioProcessor } from "./processors/AudioProcessor.js";
import { VideoProcessor } from "./processors/VideoProcessor.js";
import { ImageProcessor } from "./processors/ImageProcessor.js";
import { DocProcessor } from "./processors/DocProcessor.js";
import { ConversionState } from "./state/ConversionState.js";

const state = new ConversionState();
const audio = new AudioProcessor(state);
const video = new VideoProcessor(state);
const image = new ImageProcessor(state);
const doc = new DocProcessor(state);

const server = new Server(
  { name: "file-converter-mcp", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// ─── Tool Definitions ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "convert_audio",
      description:
        "Convert audio files between formats: MP3, WAV, FLAC, AAC, OGG, M4A, AIFF, OPUS",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input audio file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          bitrate: { type: "string", description: "Output bitrate, e.g. '320k', '192k' (optional)" },
          sampleRate: { type: "number", description: "Sample rate in Hz, e.g. 44100, 48000 (optional)" },
          channels: { type: "number", description: "Number of channels: 1 (mono) or 2 (stereo) (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_video",
      description:
        "Convert video files between formats: MP4, WebM, AVI, MOV, MKV, GIF, and extract audio from video",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input video file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          resolution: { type: "string", description: "Output resolution e.g. '1920x1080', '1280x720' (optional)" },
          fps: { type: "number", description: "Frames per second for output (optional)" },
          videoBitrate: { type: "string", description: "Video bitrate e.g. '2000k' (optional)" },
          audioBitrate: { type: "string", description: "Audio bitrate e.g. '128k' (optional)" },
          noAudio: { type: "boolean", description: "Strip audio from output (optional)" },
          startTime: { type: "string", description: "Trim start time e.g. '00:01:30' (optional)" },
          duration: { type: "string", description: "Trim duration e.g. '00:02:00' (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_image",
      description:
        "Convert and process images: JPEG, PNG, WebP, GIF, AVIF, TIFF, SVG, ICO, BMP. Resize, compress, optimize.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input image" },
          outputPath: { type: "string", description: "Absolute path for output image (include extension)" },
          width: { type: "number", description: "Resize width in pixels (optional)" },
          height: { type: "number", description: "Resize height in pixels (optional)" },
          quality: { type: "number", description: "Output quality 1-100 (optional, default 85)" },
          fit: {
            type: "string",
            enum: ["cover", "contain", "fill", "inside", "outside"],
            description: "How to fit image when resizing (optional)",
          },
          grayscale: { type: "boolean", description: "Convert to grayscale (optional)" },
          rotate: { type: "number", description: "Rotate degrees clockwise (optional)" },
          generateIcons: {
            type: "boolean",
            description: "Generate icon set (16,32,64,128,256,512px) from input (optional)",
          },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_document",
      description:
        "Convert documents: Markdown↔JSON, Markdown↔HTML, JSON↔YAML, CSV↔JSON, plain text transformations",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input document" },
          outputPath: { type: "string", description: "Absolute path for output document (include extension)" },
          inputFormat: {
            type: "string",
            enum: ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt"],
            description: "Input format (auto-detected from extension if not provided)",
          },
          outputFormat: {
            type: "string",
            enum: ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt"],
            description: "Output format (auto-detected from extension if not provided)",
          },
          pretty: { type: "boolean", description: "Pretty-print JSON/YAML output (optional, default true)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "batch_convert",
      description:
        "Convert multiple files at once with the same settings",
      inputSchema: {
        type: "object",
        properties: {
          inputPaths: {
            type: "array",
            items: { type: "string" },
            description: "Array of absolute input file paths",
          },
          outputDir: { type: "string", description: "Directory for all output files" },
          outputFormat: { type: "string", description: "Target format extension e.g. 'wav', 'webp', 'json'" },
          options: {
            type: "object",
            description: "Format-specific options (same as individual converters)",
          },
        },
        required: ["inputPaths", "outputDir", "outputFormat"],
      },
    },
    {
      name: "get_conversion_history",
      description: "Get the history of all conversions performed in this session",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max number of records to return (default 20)" },
          status: {
            type: "string",
            enum: ["all", "success", "error", "processing"],
            description: "Filter by status (default 'all')",
          },
        },
        required: [],
      },
    },
    {
      name: "get_supported_formats",
      description: "List all supported input/output formats by category",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["audio", "video", "image", "document", "all"],
            description: "Category to list formats for (default 'all')",
          },
        },
        required: [],
      },
    },
  ],
}));

// ─── Tool Handlers ───────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "convert_audio": {
        const result = await audio.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "convert_video": {
        const result = await video.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "convert_image": {
        const result = await image.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "convert_document": {
        const result = await doc.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "batch_convert": {
        const { inputPaths, outputDir, outputFormat, options = {} } = args as any;
        const audioExts = ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "opus"];
        const videoExts = ["mp4", "webm", "avi", "mov", "mkv", "gif"];
        const imageExts = ["jpg", "jpeg", "png", "webp", "avif", "tiff", "ico", "bmp"];
        const documentExts = ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt"];
        const ext = (outputFormat as string).toLowerCase();

        if (![...audioExts, ...videoExts, ...imageExts, ...documentExts].includes(ext)) {
          throw new Error(
            `Unsupported output format "${outputFormat}". Supported: ${[...audioExts, ...videoExts, ...imageExts, ...documentExts].join(", ")}`
          );
        }

        const results = await Promise.allSettled(
          inputPaths.map(async (inputPath: string) => {
            const fileBaseName = basename(inputPath).replace(/\.[^.]+$/, "");
            const outputPath = `${outputDir}/${fileBaseName}.${ext}`;

            if (audioExts.includes(ext)) {
              return audio.convert({ inputPath, outputPath, ...options });
            } else if (videoExts.includes(ext)) {
              return video.convert({ inputPath, outputPath, ...options });
            } else if (imageExts.includes(ext)) {
              return image.convert({ inputPath, outputPath, ...options });
            } else {
              return doc.convert({ inputPath, outputPath, ...options });
            }
          })
        );
        const summary = results.map((r, i) => {
          const file = inputPaths[i];
          if (r.status === "fulfilled") {
            return {
              file,
              status: r.status,
              result: r.value,
            };
          }
          const reason: unknown = (r as PromiseRejectedResult).reason;
          const message =
            reason instanceof Error ? reason.message : String(reason);
          const stack =
            reason instanceof Error && reason.stack ? reason.stack : undefined;
          return {
            file,
            status: r.status,
            error: {
              message,
              stack,
            },
          };
        });
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }
      case "get_conversion_history": {
        const { limit = 20, status = "all" } = args as any;
        const history = state.getHistory(limit, status);
        return { content: [{ type: "text", text: JSON.stringify(history, null, 2) }] };
      }
      case "get_supported_formats": {
        const { category = "all" } = args as any;
        const formats: Record<string, any> = {
          audio: {
            input: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "opus"],
            output: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "opus"],
            notes: "Powered by FFmpeg. Supports bitrate, sample rate, channel control.",
          },
          video: {
            input: ["mp4", "webm", "avi", "mov", "mkv", "flv", "wmv", "m4v", "3gp"],
            output: ["mp4", "webm", "avi", "mov", "mkv", "gif"],
            notes: "Powered by FFmpeg. Supports trim, resize, fps, bitrate, audio extraction.",
          },
          image: {
            input: ["jpg", "jpeg", "png", "webp", "gif", "avif", "tiff", "bmp", "svg"],
            output: ["jpg", "jpeg", "png", "webp", "gif", "avif", "tiff", "ico"],
            notes: "Powered by Sharp. Supports resize, compress, rotate, grayscale, icon generation.",
          },
          document: {
            input: ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt"],
            output: ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt"],
            notes: "Pure Node.js. Supports bidirectional conversion with formatting options.",
          },
        };
        const result = category === "all" ? formats : { [category]: formats[category] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
});

// ─── Resources ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "converter://status",
      name: "Converter Status",
      description: "Current conversion queue and session statistics",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "converter://status") {
    return {
      contents: [
        {
          uri: "converter://status",
          mimeType: "application/json",
          text: JSON.stringify(state.getStatus(), null, 2),
        },
      ],
    };
  }
  throw new Error("Resource not found");
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("File Converter MCP server running on stdio");
