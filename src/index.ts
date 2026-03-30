#!/usr/bin/env node
/**
 * File Converter MCP Server
 * Handles audio, video, image, document, music, biotech, fintech, logistics, and dev format conversions
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
import { MusicProcessor } from "./processors/MusicProcessor.js";
import { BiotechProcessor } from "./processors/BiotechProcessor.js";
import { FintechProcessor } from "./processors/FintechProcessor.js";
import { LogisticsProcessor } from "./processors/LogisticsProcessor.js";
import { DevFormatProcessor } from "./processors/DevFormatProcessor.js";
import { ConversionState } from "./state/ConversionState.js";

const state = new ConversionState();
const audio = new AudioProcessor(state);
const video = new VideoProcessor(state);
const image = new ImageProcessor(state);
const doc = new DocProcessor(state);
const music = new MusicProcessor(state);
const biotech = new BiotechProcessor(state);
const fintech = new FintechProcessor(state);
const logistics = new LogisticsProcessor(state);
const devfmt = new DevFormatProcessor(state);

const server = new Server(
  { name: "file-converter-mcp", version: "2.0.0" },
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
      name: "convert_music",
      description:
        "Convert music notation and MIDI files: MIDI (.mid/.midi)→JSON, ABC notation (.abc)→JSON, MusicXML (.musicxml/.mxl)→JSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input music file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: {
            type: "string",
            enum: ["midi", "mid", "abc", "musicxml", "mxl", "json"],
            description: "Input format (auto-detected from extension if not provided)",
          },
          outputFormat: {
            type: "string",
            enum: ["json"],
            description: "Output format (currently json)",
          },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_biotech",
      description:
        "Convert bioinformatics and genomics files: FASTA↔JSON/CSV, FASTQ→JSON/FASTA, VCF→JSON/CSV, GFF/GTF→JSON/CSV, PDB→JSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input biotech file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: {
            type: "string",
            enum: ["fasta", "fastq", "vcf", "gff", "gff3", "gtf", "pdb", "json"],
            description: "Input format (auto-detected from extension if not provided)",
          },
          outputFormat: {
            type: "string",
            enum: ["json", "csv", "fasta"],
            description: "Output format",
          },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_fintech",
      description:
        "Convert financial data formats: OFX/QFX (banking)→JSON/CSV, QIF (Quicken)→JSON/CSV, MT940 (SWIFT)→JSON/CSV",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input financial data file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: {
            type: "string",
            enum: ["ofx", "qfx", "qif", "mt940", "json"],
            description: "Input format (auto-detected from extension if not provided)",
          },
          outputFormat: {
            type: "string",
            enum: ["json", "csv"],
            description: "Output format",
          },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_logistics",
      description:
        "Convert supply chain and logistics formats: EDI X12→JSON/CSV, EDIFACT→JSON, GPX↔GeoJSON, JSON→GeoJSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input logistics file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: {
            type: "string",
            enum: ["edi", "edifact", "gpx", "geojson", "json"],
            description: "Input format (auto-detected from extension if not provided)",
          },
          outputFormat: {
            type: "string",
            enum: ["json", "csv", "geojson", "gpx"],
            description: "Output format",
          },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_dev_format",
      description:
        "Convert developer config and schema formats: TOML↔JSON, INI↔JSON, ENV↔JSON, XML→JSON, JSONL↔JSON, Protobuf schema→JSON, GraphQL schema→JSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input config/schema file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: {
            type: "string",
            enum: ["toml", "ini", "env", "xml", "jsonl", "json", "proto", "graphql", "gql"],
            description: "Input format (auto-detected from extension if not provided)",
          },
          outputFormat: {
            type: "string",
            enum: ["json", "toml", "ini", "env", "jsonl"],
            description: "Output format",
          },
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
          outputFormat: { type: "string", description: "Target format extension e.g. 'wav', 'webp', 'json', 'csv'" },
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
            enum: ["audio", "video", "image", "document", "music", "biotech", "fintech", "logistics", "devformat", "all"],
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
      case "convert_music": {
        const result = await music.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "convert_biotech": {
        const result = await biotech.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "convert_fintech": {
        const result = await fintech.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "convert_logistics": {
        const result = await logistics.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "convert_dev_format": {
        const result = await devfmt.convert(args as any);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
      case "batch_convert": {
        const { inputPaths, outputDir, outputFormat, options = {} } = args as any;
        const audioExts = ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "opus"];
        const videoExts = ["mp4", "webm", "avi", "mov", "mkv", "gif"];
        const imageExts = ["jpg", "jpeg", "png", "webp", "avif", "tiff", "ico", "bmp"];
        const documentExts = ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt"];
        const musicExts = ["mid", "midi", "abc", "musicxml", "mxl"];
        const biotechExts = ["fasta", "fa", "fna", "faa", "fastq", "fq", "vcf", "gff", "gff3", "gtf", "pdb"];
        const fintechExts = ["ofx", "qfx", "qif", "mt940"];
        const logisticsExts = ["edi", "x12", "edifact", "gpx", "geojson"];
        const devExts = ["toml", "ini", "env", "xml", "jsonl", "proto", "graphql", "gql"];
        const ext = (outputFormat as string).toLowerCase();
        const allExts = [...audioExts, ...videoExts, ...imageExts, ...documentExts, ...musicExts, ...biotechExts, ...fintechExts, ...logisticsExts, ...devExts];

        if (!allExts.includes(ext) && ext !== 'json' && ext !== 'csv') {
          throw new Error(`Unsupported output format "${outputFormat}".`);
        }

        const results = await Promise.allSettled(
          inputPaths.map(async (inputPath: string) => {
            const fileBaseName = basename(inputPath).replace(/\.[^.]+$/, "");
            const outputPath = `${outputDir}/${fileBaseName}.${ext}`;
            const inExt = inputPath.split('.').pop()?.toLowerCase() ?? '';

            if (audioExts.includes(inExt) || audioExts.includes(ext)) {
              return audio.convert({ inputPath, outputPath, ...options });
            } else if (videoExts.includes(inExt) || videoExts.includes(ext)) {
              return video.convert({ inputPath, outputPath, ...options });
            } else if (imageExts.includes(inExt) || imageExts.includes(ext)) {
              return image.convert({ inputPath, outputPath, ...options });
            } else if (musicExts.includes(inExt)) {
              return music.convert({ inputPath, outputPath, ...options });
            } else if (biotechExts.includes(inExt)) {
              return biotech.convert({ inputPath, outputPath, ...options });
            } else if (fintechExts.includes(inExt)) {
              return fintech.convert({ inputPath, outputPath, ...options });
            } else if (logisticsExts.includes(inExt)) {
              return logistics.convert({ inputPath, outputPath, ...options });
            } else if (devExts.includes(inExt)) {
              return devfmt.convert({ inputPath, outputPath, ...options });
            } else {
              return doc.convert({ inputPath, outputPath, ...options });
            }
          })
        );
        const summary = results.map((r, i) => {
          const file = inputPaths[i];
          if (r.status === "fulfilled") return { file, status: r.status, result: r.value };
          const reason: unknown = (r as PromiseRejectedResult).reason;
          const message = reason instanceof Error ? reason.message : String(reason);
          const stack = reason instanceof Error && reason.stack ? reason.stack : undefined;
          return { file, status: r.status, error: { message, stack } };
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
          music: {
            input: ["mid", "midi", "abc", "musicxml", "mxl"],
            output: ["json"],
            notes: "Pure Node.js. Binary MIDI parsing, ABC notation, MusicXML structured extraction.",
          },
          biotech: {
            input: ["fasta", "fa", "fna", "faa", "fastq", "fq", "vcf", "gff", "gff3", "gtf", "pdb"],
            output: ["json", "csv", "fasta"],
            notes: "Pure Node.js. Includes GC content, variant parsing, structural PDB chain extraction.",
          },
          fintech: {
            input: ["ofx", "qfx", "qif", "mt940"],
            output: ["json", "csv"],
            notes: "Pure Node.js. OFX/SGML/XML, QIF Quicken, MT940 SWIFT statements.",
          },
          logistics: {
            input: ["edi", "x12", "edifact", "gpx", "geojson", "json"],
            output: ["json", "csv", "geojson", "gpx"],
            notes: "Pure Node.js. EDI X12, EDIFACT, GPX tracks/waypoints, GeoJSON FeatureCollections.",
          },
          devformat: {
            input: ["toml", "ini", "env", "xml", "jsonl", "json", "proto", "graphql", "gql"],
            output: ["json", "toml", "ini", "env", "jsonl"],
            notes: "Pure Node.js. Config formats, Protobuf schema extraction, GraphQL schema parsing.",
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
