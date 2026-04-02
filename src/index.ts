#!/usr/bin/env node
/**
 * File Converter MCP Server v2.2
 * Handles audio, video, image, document, spreadsheet, archive, font, 3D, email,
 * music, biotech, fintech, logistics, dev format, statistics, chemistry, astronomy,
 * and geoscience conversions.
 * Compatible with Claude Desktop / any MCP-compatible host.
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
import { SpreadsheetProcessor } from "./processors/SpreadsheetProcessor.js";
import { ArchiveProcessor } from "./processors/ArchiveProcessor.js";
import { FontProcessor } from "./processors/FontProcessor.js";
import { ThreeDProcessor } from "./processors/3DProcessor.js";
import { EmailProcessor } from "./processors/EmailProcessor.js";
import { StatisticsProcessor } from "./processors/StatisticsProcessor.js";
import { ChemistryProcessor } from "./processors/ChemistryProcessor.js";
import { AstronomyProcessor } from "./processors/AstronomyProcessor.js";
import { GeoscienceProcessor } from "./processors/GeoscienceProcessor.js";
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
const spreadsheet = new SpreadsheetProcessor(state);
const archive = new ArchiveProcessor(state);
const font = new FontProcessor(state);
const threed = new ThreeDProcessor(state);
const email = new EmailProcessor(state);
const statistics = new StatisticsProcessor(state);
const chemistry = new ChemistryProcessor(state);
const astronomy = new AstronomyProcessor(state);
const geoscience = new GeoscienceProcessor(state);

const server = new Server(
  { name: "file-converter-mcp", version: "2.2.0" },
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
      description: "Convert audio files. Input: mp3, wav, flac, aac, ogg, m4a, aiff, opus, wma, ac3, dts, amr, ra, wv, ape, tta, mka. Output: mp3, wav, flac, aac, ogg, m4a, aiff, opus, wma, ac3, amr, wv, mka. Supports: trim, fade in/out, normalize, volume adjust.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input audio file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          bitrate: { type: "string", description: "Output bitrate e.g. '320k', '192k' (optional)" },
          sampleRate: { type: "number", description: "Sample rate in Hz e.g. 44100, 48000 (optional)" },
          channels: { type: "number", description: "1=mono, 2=stereo (optional)" },
          normalize: { type: "boolean", description: "Apply loudnorm normalization (optional)" },
          volume: { type: "number", description: "Volume adjustment in dB e.g. 3 or -6 (optional)" },
          startTime: { type: "string", description: "Trim start e.g. '00:01:30' (optional)" },
          duration: { type: "string", description: "Trim duration e.g. '00:02:00' (optional)" },
          fadeIn: { type: "number", description: "Fade in duration in seconds (optional)" },
          fadeOut: { type: "number", description: "Fade out duration in seconds (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_video",
      description: "Convert video files. Input: mp4, webm, avi, mov, mkv, flv, wmv, m4v, 3gp, ts, m2ts, vob, ogv, hevc/h265. Output: mp4, webm, avi, mov, mkv, gif, ts, ogv, flv, hevc. Supports: trim, resize, fps, bitrate, CRF, preset, hardware acceleration, subtitle burn-in, frame extraction.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input video file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          resolution: { type: "string", description: "Output resolution e.g. '1920x1080' (optional)" },
          fps: { type: "number", description: "Frames per second (optional)" },
          videoBitrate: { type: "string", description: "Video bitrate e.g. '2000k' (optional)" },
          audioBitrate: { type: "string", description: "Audio bitrate e.g. '128k' (optional)" },
          noAudio: { type: "boolean", description: "Strip audio (optional)" },
          startTime: { type: "string", description: "Trim start e.g. '00:01:30' (optional)" },
          duration: { type: "string", description: "Trim duration e.g. '00:02:00' (optional)" },
          crf: { type: "number", description: "Constant Rate Factor 0-51 (optional, lower=better quality)" },
          preset: { type: "string", description: "Encoding preset: ultrafast, fast, medium, slow (optional)" },
          hwAccel: { type: "boolean", description: "Enable hardware acceleration (optional)" },
          videoCodec: { type: "string", description: "Force video codec e.g. libx264, libx265, libvpx-vp9 (optional)" },
          audioCodec: { type: "string", description: "Force audio codec e.g. aac, libopus (optional)" },
          subtitlePath: { type: "string", description: "Path to .srt or .ass subtitle file to burn in (optional)" },
          extractFrames: { type: "boolean", description: "Extract frames as images (optional)" },
          frameRate: { type: "number", description: "Frames per second to extract (optional, default 1)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_image",
      description: "Convert/process images. Input: jpg, jpeg, png, webp, gif, avif, tiff, bmp, svg, heic, heif, raw, jp2, jxl. Output: jpg, jpeg, png, webp, gif, avif, tiff, ico, jxl. Supports: resize, compress, rotate, flip, blur, sharpen, normalize, tint, trim, strip metadata, progressive, lossless.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input image" },
          outputPath: { type: "string", description: "Absolute path for output image (include extension)" },
          width: { type: "number", description: "Resize width in pixels (optional)" },
          height: { type: "number", description: "Resize height in pixels (optional)" },
          quality: { type: "number", description: "Quality 1-100 (optional, default 85)" },
          fit: { type: "string", enum: ["cover", "contain", "fill", "inside", "outside"], description: "Resize fit mode (optional)" },
          grayscale: { type: "boolean", description: "Convert to grayscale (optional)" },
          rotate: { type: "number", description: "Rotate degrees clockwise (optional)" },
          flip: { type: "boolean", description: "Flip vertically (optional)" },
          flop: { type: "boolean", description: "Flop horizontally (optional)" },
          blur: { type: "number", description: "Blur sigma e.g. 1.5 (optional)" },
          sharpen: { type: "boolean", description: "Apply sharpening (optional)" },
          normalize: { type: "boolean", description: "Stretch contrast to full range (optional)" },
          tint: { type: "string", description: "Hex color tint e.g. '#ff0000' (optional)" },
          trim: { type: "boolean", description: "Trim whitespace/borders (optional)" },
          background: { type: "string", description: "Background color e.g. '#ffffff' (optional)" },
          strip: { type: "boolean", description: "Strip EXIF metadata (optional)" },
          progressive: { type: "boolean", description: "Progressive JPEG/PNG (optional)" },
          lossless: { type: "boolean", description: "Lossless WebP/AVIF/JXL (optional)" },
          density: { type: "number", description: "DPI for SVG rasterization (optional, default 72)" },
          generateIcons: { type: "boolean", description: "Generate icon set 16-512px (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_document",
      description: "Convert documents. Input/Output: md, json, yaml, yml, html, csv, txt, jsonl, ndjson.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input document" },
          outputPath: { type: "string", description: "Absolute path for output document (include extension)" },
          inputFormat: { type: "string", enum: ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt", "rst", "jsonl", "ndjson"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["md", "markdown", "json", "yaml", "yml", "html", "csv", "txt", "jsonl", "ndjson"], description: "Output format (auto-detected if not provided)" },
          pretty: { type: "boolean", description: "Pretty-print output (optional, default true)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_spreadsheet",
      description: "Convert spreadsheet and tabular data. Input: csv, tsv, json, jsonl, ndjson, xlsx (requires xlsx package). Output: csv, tsv, json, jsonl, html, markdown, xlsx.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input spreadsheet file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["csv", "tsv", "json", "jsonl", "ndjson", "xlsx", "ods", "xlsb"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["csv", "tsv", "json", "jsonl", "html", "md", "xlsx"], description: "Output format (auto-detected if not provided)" },
          sheet: { type: "string", description: "Sheet name or index for xlsx input (optional)" },
          delimiter: { type: "string", description: "CSV delimiter (optional, default ',')" },
          header: { type: "boolean", description: "First row is header (optional, default true)" },
          skipRows: { type: "number", description: "Skip N rows before header (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_archive",
      description: "Compress/decompress archives. Input: gz, bz2, br, zip, tgz/tar.gz, tar.bz2, tar.xz, 7z, rar. Output: gz, br, zip, tgz. Supports listing contents.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input file or directory" },
          outputPath: { type: "string", description: "Absolute path for output archive or extract directory" },
          inputFormat: { type: "string", enum: ["gz", "bz2", "br", "zip", "tgz", "tar.gz", "tar.bz2", "tar.xz", "7z", "rar", "zst"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["gz", "br", "zip", "tgz", "tar.gz", "zst"], description: "Output format (auto-detected if not provided)" },
          compressionLevel: { type: "number", description: "Compression level 1-9 (optional, default 6)" },
          extractDir: { type: "string", description: "Directory to extract to (optional)" },
          listOnly: { type: "boolean", description: "Only list archive contents without extracting (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_font",
      description: "Convert font files. Input: ttf, otf, woff, woff2. Output: ttf, otf, woff, woff2, css (@font-face snippet). Requires fonttools: pip install fonttools brotli.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input font file" },
          outputPath: { type: "string", description: "Absolute path for output font file (include extension)" },
          inputFormat: { type: "string", enum: ["ttf", "otf", "woff", "woff2"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["ttf", "otf", "woff", "woff2", "css"], description: "Output format (auto-detected if not provided)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_3d",
      description: "Convert 3D model files. Input: obj, stl, ply, glb, gltf, off, 3mf. Output: obj, stl, ply, glb, gltf, json. Built-in obj/stl/ply→json; other formats require blender or assimp CLI.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input 3D model file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["obj", "stl", "ply", "glb", "gltf", "off", "3mf"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["obj", "stl", "ply", "glb", "gltf", "json"], description: "Output format (auto-detected if not provided)" },
          scale: { type: "number", description: "Scale factor (optional)" },
          units: { type: "string", description: "Target units: mm, cm, m, in (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_email",
      description: "Convert email files. Input: eml, mbox. Output: json, html, txt, md. Extracts headers, subject, body.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input email file (.eml or .mbox)" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["eml", "mbox"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "html", "txt", "md"], description: "Output format (auto-detected if not provided)" },
          bodyOnly: { type: "boolean", description: "Only include subject, from, to, date, body (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_music",
      description: "Convert music notation and MIDI files: MIDI (.mid/.midi)→JSON, ABC notation (.abc)→JSON, MusicXML (.musicxml/.mxl)→JSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input music file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["midi", "mid", "abc", "musicxml", "mxl", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json"], description: "Output format" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_biotech",
      description: "Convert bioinformatics files: FASTA↔JSON/CSV, FASTQ→JSON/FASTA, VCF→JSON/CSV, GFF/GTF→JSON/CSV, PDB→JSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input biotech file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["fasta", "fastq", "vcf", "gff", "gff3", "gtf", "pdb", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "csv", "fasta"], description: "Output format" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_fintech",
      description: "Convert financial data: OFX/QFX (banking)→JSON/CSV, QIF (Quicken)→JSON/CSV, MT940 (SWIFT)→JSON/CSV",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input financial data file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["ofx", "qfx", "qif", "mt940", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "csv"], description: "Output format" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_logistics",
      description: "Convert supply chain formats: EDI X12→JSON/CSV, EDIFACT→JSON, GPX↔GeoJSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input logistics file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["edi", "edifact", "gpx", "geojson", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "csv", "geojson", "gpx"], description: "Output format" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_dev_format",
      description: "Convert developer config/schema formats: TOML↔JSON, INI↔JSON, ENV↔JSON, XML→JSON, JSONL↔JSON, Protobuf schema→JSON, GraphQL schema→JSON",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input config/schema file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["toml", "ini", "env", "xml", "jsonl", "json", "proto", "graphql", "gql"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "toml", "ini", "env", "jsonl"], description: "Output format" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_statistics",
      description: "Convert statistical data formats: R data (.rdata, .rds)→JSON, MATLAB (.mat)→JSON, SPSS (.sav)→JSON, Stata (.dta)→JSON. Note: Binary formats require Python libraries (pyreadstat, scipy).",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input statistical file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["rdata", "rds", "sav", "dta", "mat", "sas7bdat", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "csv"], description: "Output format" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_chemistry",
      description: "Convert chemistry/molecular file formats: MOL→JSON/CSV, SDF→JSON/CSV, XYZ→JSON, SMILES→JSON, PDB (molecular)→JSON. For advanced conversions, requires RDKit or Open Babel.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input chemistry file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["mol", "sdf", "mol2", "pdb", "cml", "smi", "smiles", "inchi", "xyz", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "csv"], description: "Output format" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_astronomy",
      description: "Convert astronomy data formats: FITS→JSON (header extraction). For full FITS data extraction, requires astropy.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input astronomy file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["fits", "fit", "fts", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "csv"], description: "Output format" },
          hdu: { type: "number", description: "Header Data Unit index (optional, default 0)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "convert_geoscience",
      description: "Convert geoscience formats: KML→GeoJSON/JSON, GeoJSON→JSON. For advanced formats like NetCDF/HDF5/GeoTIFF/Shapefile, additional tooling is required and not currently handled by this server.",
      inputSchema: {
        type: "object",
        properties: {
          inputPath: { type: "string", description: "Absolute path to input geoscience file" },
          outputPath: { type: "string", description: "Absolute path for output file (include extension)" },
          inputFormat: { type: "string", enum: ["nc", "hdf5", "h5", "he5", "tiff", "geotiff", "shp", "kml", "geojson", "json"], description: "Input format (auto-detected if not provided)" },
          outputFormat: { type: "string", enum: ["json", "geojson"], description: "Output format" },
          variable: { type: "string", description: "Variable name to extract from NetCDF/HDF5 (optional)" },
        },
        required: ["inputPath", "outputPath"],
      },
    },
    {
      name: "batch_convert",
      description: "Convert multiple files at once with the same settings",
      inputSchema: {
        type: "object",
        properties: {
          inputPaths: { type: "array", items: { type: "string" }, description: "Array of absolute input file paths" },
          outputDir: { type: "string", description: "Directory for all output files" },
          outputFormat: { type: "string", description: "Target format extension e.g. 'wav', 'webp', 'json', 'csv'" },
          options: { type: "object", description: "Format-specific options (same as individual converters)" },
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
          status: { type: "string", enum: ["all", "success", "error", "processing"], description: "Filter by status (default 'all')" },
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
            enum: ["audio", "video", "image", "document", "spreadsheet", "archive", "font", "3d", "email", "music", "biotech", "fintech", "logistics", "devformat", "statistics", "chemistry", "astronomy", "geoscience", "all"],
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
      case "convert_audio": return { content: [{ type: "text", text: JSON.stringify(await audio.convert(args as any), null, 2) }] };
      case "convert_video": return { content: [{ type: "text", text: JSON.stringify(await video.convert(args as any), null, 2) }] };
      case "convert_image": return { content: [{ type: "text", text: JSON.stringify(await image.convert(args as any), null, 2) }] };
      case "convert_document": return { content: [{ type: "text", text: JSON.stringify(await doc.convert(args as any), null, 2) }] };
      case "convert_music": return { content: [{ type: "text", text: JSON.stringify(await music.convert(args as any), null, 2) }] };
      case "convert_biotech": return { content: [{ type: "text", text: JSON.stringify(await biotech.convert(args as any), null, 2) }] };
      case "convert_fintech": return { content: [{ type: "text", text: JSON.stringify(await fintech.convert(args as any), null, 2) }] };
      case "convert_logistics": return { content: [{ type: "text", text: JSON.stringify(await logistics.convert(args as any), null, 2) }] };
      case "convert_dev_format": return { content: [{ type: "text", text: JSON.stringify(await devfmt.convert(args as any), null, 2) }] };
      case "convert_spreadsheet": return { content: [{ type: "text", text: JSON.stringify(await spreadsheet.convert(args as any), null, 2) }] };
      case "convert_archive": return { content: [{ type: "text", text: JSON.stringify(await archive.convert(args as any), null, 2) }] };
      case "convert_font": return { content: [{ type: "text", text: JSON.stringify(await font.convert(args as any), null, 2) }] };
      case "convert_3d": return { content: [{ type: "text", text: JSON.stringify(await threed.convert(args as any), null, 2) }] };
      case "convert_email": return { content: [{ type: "text", text: JSON.stringify(await email.convert(args as any), null, 2) }] };
      case "convert_statistics": return { content: [{ type: "text", text: JSON.stringify(await statistics.convert(args as any), null, 2) }] };
      case "convert_chemistry": return { content: [{ type: "text", text: JSON.stringify(await chemistry.convert(args as any), null, 2) }] };
      case "convert_astronomy": return { content: [{ type: "text", text: JSON.stringify(await astronomy.convert(args as any), null, 2) }] };
      case "convert_geoscience": return { content: [{ type: "text", text: JSON.stringify(await geoscience.convert(args as any), null, 2) }] };

      case "batch_convert": {
        const { inputPaths, outputDir, outputFormat, options = {} } = args as any;
        const catMap: Record<string, string[]> = {
          audio: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "opus", "wma", "ac3", "amr", "wv", "mka"],
          video: ["mp4", "webm", "avi", "mov", "mkv", "gif", "ts", "ogv", "flv", "hevc"],
          image: ["jpg", "jpeg", "png", "webp", "avif", "tiff", "ico", "bmp", "jxl"],
          music: ["mid", "midi", "abc", "musicxml", "mxl"],
          biotech: ["fasta", "fa", "fna", "faa", "fastq", "fq", "vcf", "gff", "gff3", "gtf", "pdb"],
          fintech: ["ofx", "qfx", "qif", "mt940"],
          logistics: ["edi", "x12", "edifact", "gpx", "geojson"],
          dev: ["toml", "ini", "env", "xml", "jsonl", "proto", "graphql", "gql"],
          spreadsheet: ["csv", "tsv", "xlsx", "ods", "xlsb"],
          archive: ["gz", "bz2", "br", "zip", "tgz", "7z", "rar"],
          font: ["ttf", "otf", "woff", "woff2"],
          threed: ["obj", "stl", "ply", "glb", "gltf", "off", "3mf"],
          email: ["eml", "mbox"],
          document: ["md", "markdown", "json", "yaml", "yml", "html", "txt"],
          statistics: ["rdata", "rds", "sav", "dta", "mat", "sas7bdat"],
          chemistry: ["mol", "sdf", "mol2", "pdb", "cml", "smi", "smiles", "inchi", "xyz"],
          astronomy: ["fits", "fit", "fts"],
          geoscience: ["nc", "hdf5", "h5", "he5", "kml", "geojson", "shp", "tif", "tiff", "geotiff"],
        };
        const ext = (outputFormat as string).toLowerCase();
        const results = await Promise.allSettled(
          inputPaths.map(async (inputPath: string) => {
            const fileBaseName = basename(inputPath).replace(/\.[^.]+$/, "");
            const outputPath = `${outputDir}/${fileBaseName}.${ext}`;
            const inExt = inputPath.split(".").pop()?.toLowerCase() ?? "";
            if (catMap.audio.includes(inExt) || catMap.audio.includes(ext)) return audio.convert({ inputPath, outputPath, ...options });
            if (catMap.video.includes(inExt) || catMap.video.includes(ext)) return video.convert({ inputPath, outputPath, ...options });
            if (catMap.image.includes(inExt) || catMap.image.includes(ext)) return image.convert({ inputPath, outputPath, ...options });
            if (catMap.music.includes(inExt)) return music.convert({ inputPath, outputPath, ...options });
            if (catMap.biotech.includes(inExt)) return biotech.convert({ inputPath, outputPath, ...options });
            if (catMap.fintech.includes(inExt)) return fintech.convert({ inputPath, outputPath, ...options });
            if (catMap.logistics.includes(inExt)) return logistics.convert({ inputPath, outputPath, ...options });
            if (catMap.dev.includes(inExt)) return devfmt.convert({ inputPath, outputPath, ...options });
            if (catMap.spreadsheet.includes(inExt)) return spreadsheet.convert({ inputPath, outputPath, ...options });
            if (catMap.archive.includes(inExt)) return archive.convert({ inputPath, outputPath, ...options });
            if (catMap.font.includes(inExt)) return font.convert({ inputPath, outputPath, ...options });
            if (catMap.threed.includes(inExt)) return threed.convert({ inputPath, outputPath, ...options });
            if (catMap.email.includes(inExt)) return email.convert({ inputPath, outputPath, ...options });
            if (catMap.statistics.includes(inExt)) return statistics.convert({ inputPath, outputPath, ...options });
            if (catMap.chemistry.includes(inExt)) return chemistry.convert({ inputPath, outputPath, ...options });
            if (catMap.astronomy.includes(inExt)) return astronomy.convert({ inputPath, outputPath, ...options });
            if (catMap.geoscience.includes(inExt)) return geoscience.convert({ inputPath, outputPath, ...options });
            return doc.convert({ inputPath, outputPath, ...options });
          })
        );
        const summary = results.map((r, i) => {
          const file = inputPaths[i];
          if (r.status === "fulfilled") return { file, status: r.status, result: r.value };
          const reason: unknown = (r as PromiseRejectedResult).reason;
          const message = reason instanceof Error ? reason.message : String(reason);
          return { file, status: r.status, error: { message } };
        });
        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }

      case "get_conversion_history": {
        const { limit = 20, status = "all" } = args as any;
        return { content: [{ type: "text", text: JSON.stringify(state.getHistory(limit, status), null, 2) }] };
      }

      case "get_supported_formats": {
        const { category = "all" } = args as any;
        const formats: Record<string, any> = {
          audio: { input: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "opus", "wma", "ac3", "dts", "amr", "ra", "wv", "ape", "tta", "mka"], output: ["mp3", "wav", "flac", "aac", "ogg", "m4a", "aiff", "opus", "wma", "ac3", "amr", "wv", "mka"], notes: "FFmpeg. Supports trim, fade, normalize, volume, bitrate, sample rate." },
          video: { input: ["mp4", "webm", "avi", "mov", "mkv", "flv", "wmv", "m4v", "3gp", "ts", "m2ts", "vob", "ogv", "hevc", "h265"], output: ["mp4", "webm", "avi", "mov", "mkv", "gif", "ts", "ogv", "flv", "hevc"], notes: "FFmpeg. Trim, resize, fps, CRF, preset, hw accel, subtitle burn-in, frame extraction." },
          image: { input: ["jpg", "jpeg", "png", "webp", "gif", "avif", "tiff", "bmp", "svg", "heic", "heif", "raw", "jp2", "jxl"], output: ["jpg", "jpeg", "png", "webp", "gif", "avif", "tiff", "ico", "jxl"], notes: "Sharp. Resize, compress, rotate, flip, blur, sharpen, normalize, tint, trim, metadata strip, progressive, lossless." },
          document: { input: ["md", "json", "yaml", "yml", "html", "csv", "txt", "rst", "jsonl", "ndjson"], output: ["md", "json", "yaml", "yml", "html", "csv", "txt", "jsonl", "ndjson"], notes: "Pure Node.js." },
          spreadsheet: { input: ["csv", "tsv", "json", "jsonl", "ndjson", "xlsx", "ods", "xlsb"], output: ["csv", "tsv", "json", "jsonl", "html", "md", "xlsx"], notes: "Pure Node.js. xlsx i/o requires: npm install xlsx" },
          archive: { input: ["gz", "bz2", "br", "zip", "tgz", "tar.gz", "tar.bz2", "tar.xz", "7z", "rar", "zst"], output: ["gz", "br", "zip", "tgz", "tar.gz", "zst"], notes: "Built-in zlib for gz/br. zip/tar via system CLI. 7z/rar requires: brew install p7zip" },
          font: { input: ["ttf", "otf", "woff", "woff2"], output: ["ttf", "otf", "woff", "woff2", "css"], notes: "Requires fonttools: pip install fonttools brotli" },
          "3d": { input: ["obj", "stl", "ply", "glb", "gltf", "off", "3mf"], output: ["obj", "stl", "ply", "glb", "gltf", "json"], notes: "obj/stl/ply→json built-in. Other conversions require: brew install assimp" },
          email: { input: ["eml", "mbox"], output: ["json", "html", "txt", "md"], notes: "Pure Node.js." },
          music: { input: ["mid", "midi", "abc", "musicxml", "mxl"], output: ["json"], notes: "Pure Node.js." },
          biotech: { input: ["fasta", "fa", "fna", "faa", "fastq", "fq", "vcf", "gff", "gff3", "gtf", "pdb"], output: ["json", "csv", "fasta"], notes: "Pure Node.js." },
          fintech: { input: ["ofx", "qfx", "qif", "mt940"], output: ["json", "csv"], notes: "Pure Node.js." },
          logistics: { input: ["edi", "x12", "edifact", "gpx", "geojson", "json"], output: ["json", "csv", "geojson", "gpx"], notes: "Pure Node.js." },
          devformat: { input: ["toml", "ini", "env", "xml", "jsonl", "json", "proto", "graphql", "gql"], output: ["json", "toml", "ini", "env", "jsonl"], notes: "Pure Node.js." },
          statistics: { input: ["rdata", "rds", "mat", "sav", "dta", "sas7bdat"], output: ["json", "csv"], notes: "Pure Node.js for text formats. Binary formats require: pip install pyreadstat scipy" },
          chemistry: { input: ["mol", "sdf", "mol2", "pdb", "cml", "smiles", "inchi", "xyz"], output: ["json", "csv"], notes: "Pure Node.js for basic formats. Advanced conversions require: conda install -c conda-forge rdkit" },
          astronomy: { input: ["fits", "fit", "fts"], output: ["json", "csv"], notes: "Header extraction only. Full data requires: pip install astropy" },
          geoscience: { input: ["nc", "hdf5", "h5", "he5", "kml", "geojson", "geotiff", "shp"], output: ["json", "csv", "geojson"], notes: "KML/GeoJSON built-in. NetCDF/HDF5/GeoTIFF/Shapefile require: pip install netcdf4 h5py rasterio geopandas" },
        };
        const result = category === "all" ? formats : { [category]: formats[category] };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err: any) {
    return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
  }
});

// ─── Resources ───────────────────────────────────────────────────────────────

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    { uri: "converter://status", name: "Converter Status", description: "Current conversion queue and session statistics", mimeType: "application/json" },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  if (request.params.uri === "converter://status") {
    return { contents: [{ uri: "converter://status", mimeType: "application/json", text: JSON.stringify(state.getStatus(), null, 2) }] };
  }
  throw new Error("Resource not found");
});

// ─── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("File Converter MCP v2.2 running on stdio");
