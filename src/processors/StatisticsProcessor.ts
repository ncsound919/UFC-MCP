import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type StatFormat = 'rdata' | 'rds' | 'sav' | 'dta' | 'mat' | 'sas7bdat' | 'json' | 'csv';

export interface StatConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: StatFormat;
  outputFormat?: StatFormat;
}

export class StatisticsProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): StatFormat {
    const map: Record<string, StatFormat> = {
      rdata: 'rdata', rds: 'rds', r: 'rdata',
      sav: 'sav', spss: 'sav',
      dta: 'dta', stata: 'dta',
      mat: 'mat', matlab: 'mat',
      sas7bdat: 'sas7bdat',
      json: 'json', csv: 'csv',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: StatConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord('statistics', inputPath, outputPath, opts);
    try {
      const input = readFileSync(inputPath, 'utf8');
      mkdirSync(dirname(outputPath), { recursive: true });
      const output = this.transform(input, inFmt, outFmt);
      writeFileSync(outputPath, output);
      const inStat = statSync(inputPath);
      const outStat = statSync(outputPath);
      this.state.completeRecord(record, true, { inputSize: inStat.size, outputSize: outStat.size });
      return { success: true, inputPath, outputPath, inputFormat: inFmt, outputFormat: outFmt, inputSize: inStat.size, outputSize: outStat.size };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });
      throw err;
    }
  }

  private transform(input: string, inFmt: StatFormat, outFmt: StatFormat): string {
    // For now, we'll support basic R script parsing and simple MATLAB matrix notation
    switch (`${inFmt}->${outFmt}`) {
      case 'mat->json': return this.matToJson(input);
      case 'rdata->json':
      case 'rds->json':
        throw new Error(`R binary format ${inFmt} cannot be parsed as text. Use rpy2 or R directly: pip install rpy2`);
      default: throw new Error(`Statistical format conversion ${inFmt} -> ${outFmt} requires external tools like pyreadstat, scipy, or rpy2. Install: pip install pyreadstat scipy`);
    }
  }

  private matToJson(src: string): string {
    // Basic MATLAB .mat text format parser (for ASCII .mat files)
    // Binary .mat files require scipy.io in Python
    const variables: any = {};
    const lines = src.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%')) continue;

      // Simple matrix assignment: varname = [1 2 3; 4 5 6]
      const assignMatch = trimmed.match(/^(\w+)\s*=\s*\[(.*)\]$/);
      if (assignMatch) {
        const [, varName, matrixStr] = assignMatch;
        const rows = matrixStr.split(';').map(row =>
          row.trim().split(/\s+/).map(n => parseFloat(n)).filter(n => !isNaN(n))
        );
        variables[varName] = { type: 'matrix', dimensions: [rows.length, rows[0]?.length ?? 0], data: rows };
        continue;
      }

      // Scalar assignment
      const scalarMatch = trimmed.match(/^(\w+)\s*=\s*([0-9.e+-]+)$/);
      if (scalarMatch) {
        const [, varName, value] = scalarMatch;
        variables[varName] = { type: 'scalar', value: parseFloat(value) };
      }
    }

    return JSON.stringify({
      format: 'MATLAB',
      note: 'Text-format .mat only. Binary .mat requires: scipy.io.loadmat (Python)',
      variableCount: Object.keys(variables).length,
      variables
    }, null, 2);
  }

  private rToJson(src: string): string {
    // Basic R data structure parser (very simplified)
    const data: any = {
      format: 'R',
      note: 'Basic R parsing only. Complex R objects require rpy2: pip install rpy2',
      objects: []
    };

    const lines = src.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Vector assignment: x <- c(1, 2, 3)
      const vectorMatch = trimmed.match(/^(\w+)\s*<-\s*c\((.*)\)$/);
      if (vectorMatch) {
        const [, varName, values] = vectorMatch;
        const vector = values.split(',').map(v => {
          const n = parseFloat(v.trim().replace(/['"]/g, ''));
          return isNaN(n) ? v.trim().replace(/['"]/g, '') : n;
        });
        data.objects.push({ name: varName, type: 'vector', length: vector.length, data: vector });
        continue;
      }

      // Data frame (simplified)
      const dfMatch = trimmed.match(/^(\w+)\s*<-\s*data\.frame\((.*)\)$/);
      if (dfMatch) {
        const [, varName, content] = dfMatch;
        data.objects.push({ name: varName, type: 'data.frame', note: 'Requires full R parser', raw: content });
      }
    }

    return JSON.stringify(data, null, 2);
  }
}
