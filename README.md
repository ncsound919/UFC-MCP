# UFC-MCP — Universal File Converter MCP

A full-featured [Model Context Protocol](https://modelcontextprotocol.io/) server that lets Claude Desktop (or any MCP host) convert **audio, video, image, document, and specialized scientific/business** files — all running locally with no cloud dependencies.

## Features

| Category | Formats | Engine |
|----------|---------|--------|
| 🎵 Audio | MP3, WAV, FLAC, AAC, OGG, M4A, AIFF, OPUS, WMA | FFmpeg |
| 🎬 Video | MP4, WebM, AVI, MOV, MKV, FLV, WMV, GIF, 3GP | FFmpeg |
| 🖼️ Image | JPEG, PNG, WebP, AVIF, GIF, TIFF, ICO, BMP, SVG | Sharp |
| 📄 Document | Markdown, JSON, YAML, HTML, CSV, TXT | Node.js |
| 📊 Spreadsheet | CSV, TSV, XLSX, JSON, HTML, Markdown | Node.js |
| 🗜️ Archive | ZIP, GZIP, BZIP2, TAR, 7Z, RAR | Node.js + CLI |
| 🔤 Font | TTF, OTF, WOFF, WOFF2 | fonttools |
| 🎨 3D Models | OBJ, STL, PLY, GLTF, GLB | Node.js + assimp |
| 📧 Email | EML, MBOX → JSON/HTML/TXT | Node.js |
| 🎼 Music Notation | MIDI, ABC, MusicXML → JSON | Node.js |
| 🧬 Biotech | FASTA, FASTQ, VCF, GFF, PDB → JSON/CSV | Node.js |
| 💰 Fintech | OFX, QFX, QIF, MT940 → JSON/CSV | Node.js |
| 📦 Logistics | EDI, EDIFACT, GPX → JSON/GeoJSON | Node.js |
| ⚙️ Dev Formats | TOML, INI, ENV, XML, Protobuf → JSON | Node.js |
| 📈 Statistics | R, MATLAB, SPSS, Stata → JSON/CSV | Node.js + Python* |
| 🧪 Chemistry | MOL, SDF, XYZ, SMILES, PDB → JSON/CSV | Node.js + RDKit* |
| 🔭 Astronomy | FITS → JSON/CSV (header) | Node.js + astropy* |
| 🌍 Geoscience | KML, GeoJSON, NetCDF*, HDF5* → JSON | Node.js + Python* |

\* Some advanced features require optional Python libraries

## MCP Tools

- `convert_audio` — bitrate, sample rate, channel control
- `convert_video` — trim, resize, fps, bitrate, audio extraction
- `convert_image` — resize, compress, rotate, grayscale, icon set generation
- `convert_document` — bidirectional: MD ↔ JSON ↔ YAML ↔ HTML ↔ CSV
- `convert_spreadsheet` — CSV, TSV, XLSX ↔ JSON, HTML, Markdown
- `convert_archive` — compress/decompress archives with various formats
- `convert_font` — convert between font formats
- `convert_3d` — convert 3D model formats
- `convert_email` — parse email files to JSON/HTML/TXT
- `convert_music` — music notation to structured JSON
- `convert_biotech` — bioinformatics file conversions
- `convert_fintech` — financial data format conversions
- `convert_logistics` — supply chain & geospatial conversions
- `convert_dev_format` — config/schema format conversions
- `convert_statistics` — statistical data formats (R, MATLAB, SPSS, Stata)
- `convert_chemistry` — molecular file formats (MOL, SDF, XYZ, SMILES)
- `convert_astronomy` — astronomy data (FITS files)
- `convert_geoscience` — geoscience formats (KML, NetCDF, HDF5)
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
"Convert molecule.mol to JSON with atom coordinates"
"Parse FITS astronomy file header to JSON"
"Convert protein.pdb to structured JSON"
"Transform financial_data.ofx to CSV"
"Convert research_data.mat MATLAB file to JSON"
"Parse KML map data to GeoJSON format"
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
    SpreadsheetProcessor.ts    # Spreadsheet/tabular data conversion
    ArchiveProcessor.ts        # Archive compression/decompression
    FontProcessor.ts           # Font format conversion
    3DProcessor.ts             # 3D model conversion
    EmailProcessor.ts          # Email file parsing
    MusicProcessor.ts          # Music notation conversion
    BiotechProcessor.ts        # Bioinformatics file conversion
    FintechProcessor.ts        # Financial data conversion
    LogisticsProcessor.ts      # Supply chain & geospatial conversion
    DevFormatProcessor.ts      # Developer config/schema conversion
    StatisticsProcessor.ts     # Statistical data format conversion
    ChemistryProcessor.ts      # Molecular/chemistry file conversion
    AstronomyProcessor.ts      # Astronomy data conversion
    GeoscienceProcessor.ts     # Geoscience data conversion
dashboard/
  index.html                   # Visual overview dashboard
```
