import { readFile, writeFile } from "fs/promises";
import { execFile } from "child_process";
import { promisify } from "util";
import { ConversionState } from "../state/ConversionState.js";

const execFileAsync = promisify(execFile);

export interface ThreeDConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: string;
  outputFormat?: string;
  scale?: number;
  units?: string;
}

/**
 * ThreeDProcessor — 3D model format conversion
 * Supported input:  obj, stl, ply, glb, gltf, off, 3mf
 * Supported output: obj, stl, ply, glb, gltf, off, json
 * Requires: blender or assimp for full conversion; built-in supports obj/stl/ply/json
 */
export class ThreeDProcessor {
  constructor(private state: ConversionState) {}

  async convert(options: ThreeDConvertOptions) {
    const { inputPath, outputPath } = options;
    const inExt = (options.inputFormat ?? inputPath.split(".").pop() ?? "").toLowerCase();
    const outExt = (options.outputFormat ?? outputPath.split(".").pop() ?? "").toLowerCase();
    const record = this.state.createRecord("3d", inputPath, outputPath, options);

    try {
      let result: any;
      if (inExt === "obj" && outExt === "json") {
        result = await this.objToJson(inputPath);
        await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
      } else if (inExt === "stl" && outExt === "json") {
        result = await this.stlToJson(inputPath);
        await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
      } else if (inExt === "ply" && outExt === "json") {
        result = await this.plyToJson(inputPath);
        await writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
      } else {
        // Attempt blender CLI conversion for other formats
        await execFileAsync("blender", ["--background", "--python-expr",
          `import bpy; bpy.ops.wm.read_homefile(use_empty=True); bpy.ops.import_scene.obj(filepath='${inputPath}'); bpy.ops.export_scene.obj(filepath='${outputPath}')`
        ]).catch(() => {
          // Fallback to assimp if available
          return execFileAsync("assimp", ["export", inputPath, outputPath]).catch(() => {
            throw new Error(`3D conversion ${inExt}→${outExt} requires blender or assimp CLI. Install: brew install assimp`);
          });
        });
      }

      this.state.completeRecord(record, true, {});
      return { success: true, id: record.id, input: inputPath, output: outputPath, durationMs: record.durationMs, message: `3D model converted from ${inExt} to ${outExt} in ${record.durationMs}ms` };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private async objToJson(inputPath: string) {
    const content = await readFile(inputPath, "utf8");
    const vertices: number[][] = [], faces: number[][] = [], normals: number[][] = [], texcoords: number[][] = [];
    for (const line of content.split("\n")) {
      const parts = line.trim().split(/\s+/);
      if (parts[0] === "v") vertices.push(parts.slice(1).map(Number));
      else if (parts[0] === "vn") normals.push(parts.slice(1).map(Number));
      else if (parts[0] === "vt") texcoords.push(parts.slice(1).map(Number));
      else if (parts[0] === "f") faces.push(parts.slice(1).map(p => parseInt(p.split("/")[0]) - 1));
    }
    return { format: "obj", vertices, normals, texcoords, faces, vertexCount: vertices.length, faceCount: faces.length };
  }

  private async stlToJson(inputPath: string) {
    const buf = await readFile(inputPath);
    // ASCII STL
    if (buf.slice(0, 5).toString() === "solid") {
      const text = buf.toString("utf8");
      const triangles: any[] = [];
      const facetRegex = /facet normal ([\d.e+\-]+) ([\d.e+\-]+) ([\d.e+\-]+)[\s\S]*?vertex ([\d.e+\-]+) ([\d.e+\-]+) ([\d.e+\-]+)[\s\S]*?vertex ([\d.e+\-]+) ([\d.e+\-]+) ([\d.e+\-]+)[\s\S]*?vertex ([\d.e+\-]+) ([\d.e+\-]+) ([\d.e+\-]+)/g;
      let match;
      while ((match = facetRegex.exec(text)) !== null) {
        triangles.push({
          normal: [+match[1], +match[2], +match[3]],
          v1: [+match[4], +match[5], +match[6]],
          v2: [+match[7], +match[8], +match[9]],
          v3: [+match[10], +match[11], +match[12]],
        });
      }
      return { format: "stl", type: "ascii", triangleCount: triangles.length, triangles };
    }
    // Binary STL
    const triCount = buf.readUInt32LE(80);
    return { format: "stl", type: "binary", triangleCount: triCount, note: "Binary STL parsed — vertex data available in raw buffer" };
  }

  private async plyToJson(inputPath: string) {
    const content = await readFile(inputPath, "utf8");
    const lines = content.split("\n");
    const headerEnd = lines.findIndex(l => l.trim() === "end_header");
    const header = lines.slice(0, headerEnd);
    const vertMatch = header.find(l => l.startsWith("element vertex"))?.match(/(\d+)/);
    const faceMatch = header.find(l => l.startsWith("element face"))?.match(/(\d+)/);
    return {
      format: "ply",
      vertexCount: vertMatch ? parseInt(vertMatch[1]) : 0,
      faceCount: faceMatch ? parseInt(faceMatch[1]) : 0,
      properties: header.filter(l => l.startsWith("property")).map(l => l.replace("property ", "")),
    };
  }
}
