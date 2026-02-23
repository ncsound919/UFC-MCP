# UFC-MCP — Universal File Converter MCP

A full-featured [Model Context Protocol](https://modelcontextprotocol.io/) server that lets Claude Desktop (or any MCP host) convert **audio, video, image, and document** files — all running locally with no cloud dependencies.

## Features

| Category | Formats | Engine |
|----------|---------|--------|
| 🎵 Audio | MP3, WAV, FLAC, AAC, OGG, M4A, AIFF, OPUS, WMA | FFmpeg |
| 🎬 Video | MP4, WebM, AVI, MOV, MKV, FLV, WMV, GIF, 3GP | FFmpeg |
| 🖼️ Image | JPEG, PNG, WebP, AVIF, GIF, TIFF, ICO, BMP, SVG | Sharp |
| 📄 Document | Markdown, JSON, YAML, HTML, CSV, TXT | Node.js |

## MCP Tools

- `convert_audio` — bitrate, sample rate, channel control
- `convert_video` — trim, resize, fps, bitrate, audio extraction
- `convert_image` — resize, compress, rotate, grayscale, icon set generation
- `convert_document` — bidirectional: MD ↔ JSON ↔ YAML ↔ HTML ↔ CSV
- `batch_convert` — parallel multi-file conversion
- `get_supported_formats` — list all formats by category
- `get_conversion_history` — session conversion log

## Requirements

- Node.js ≥ 18
- [FFmpeg](https://ffmpeg.org/) on `PATH` (required for audio/video)

```sh
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
winget install Gyan.FFmpeg
```

## Installation

```sh
npm install
npm run build
```

## Claude Desktop Setup

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "file-converter": {
      "command": "node",
      "args": ["/path/to/UFC-MCP/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop and start converting!

## Example Prompts

```
"Convert /music/beat.mp3 to WAV at 48000Hz stereo"
"Batch convert all MP3s in /stems/ to FLAC"
"Convert broll.mov to WebM, trim to first 30 seconds"
"Extract audio from interview.mp4 as a WAV file"
"Convert logo.png to WebP at quality 90, 800px wide"
"Generate a full icon set from app-icon.png"
"Convert README.md to JSON for my API response"
"Transform data.csv to JSON, then to Markdown table"
```

## Project Structure

```
src/
  index.ts                     # MCP server entry point
  state/
    ConversionState.ts         # Conversion history & status tracking
  processors/
    AudioProcessor.ts          # FFmpeg-based audio conversion
    VideoProcessor.ts          # FFmpeg-based video conversion
    ImageProcessor.ts          # Sharp-based image conversion
    DocProcessor.ts            # Pure Node.js document conversion
dashboard/
  index.html                   # Visual overview dashboard
```
