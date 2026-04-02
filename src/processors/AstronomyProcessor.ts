import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type AstroFormat = 'fits' | 'json' | 'csv';

export interface AstroConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: AstroFormat;
  outputFormat?: AstroFormat;
  hdu?: number; // Header Data Unit index
}

export class AstronomyProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): AstroFormat {
    const map: Record<string, AstroFormat> = {
      fits: 'fits', fit: 'fits', fts: 'fits',
      json: 'json', csv: 'csv',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: AstroConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat, hdu } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const rawInFmt = inputFormat ?? this.extToFormat(inExt);
    // Normalize fit/fts → fits
    const inFmt: AstroFormat = (['fits', 'json', 'csv'] as AstroFormat[]).includes(rawInFmt) ? rawInFmt : 'fits';
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord('astronomy', inputPath, outputPath, opts);
    try {
      // FITS files are binary, so we read as buffer for header extraction
      const input = readFileSync(inputPath);
      mkdirSync(dirname(outputPath), { recursive: true });
      const output = this.transform(input, inFmt, outFmt, hdu);
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

  private transform(input: Buffer, inFmt: AstroFormat, outFmt: AstroFormat, hdu?: number): string {
    switch (`${inFmt}->${outFmt}`) {
      case 'fits->json': return this.fitsToJson(input, hdu);
      case 'fits->csv': return this.fitsToCsv(input, hdu);
      default: throw new Error(`Astronomy conversion ${inFmt} -> ${outFmt} requires astropy. Install: pip install astropy`);
    }
  }

  private fitsToJson(buffer: Buffer, hdu?: number): string {
    // Basic FITS header parser
    // Full FITS parsing requires astropy or similar
    // FITS headers are composed of 2880-byte blocks of 80-character cards and
    // can span multiple blocks until an END card is encountered.
    const headerStr = buffer.toString('ascii');
    const cards: any[] = [];

    // Parse header cards (80-char each) across all header blocks until END
    for (let i = 0; i + 80 <= headerStr.length; i += 80) {
      const card = headerStr.slice(i, i + 80);
      const trimmed = card.trim();
      // Stop when we reach the END card, which marks the end of the header
      if (trimmed === 'END' || trimmed.startsWith('END ')) {
        break;
      }
      const match = card.match(/^(\w+)\s*=\s*([^/]+)\s*(?:\/\s*(.*))?$/);
      if (match) {
        const [, keyword, valueStr, comment] = match;
        let value: any = valueStr.trim();
        // Try to parse as number or boolean
        if (value === 'T') value = true;
        else if (value === 'F') value = false;
        else if (value.match(/^[+-]?\d+$/)) value = parseInt(value);
        else if (value.match(/^[+-]?\d*\.\d+([eE][+-]?\d+)?$/)) value = parseFloat(value);
        else value = value.replace(/^'|'$/g, '').trim();

        cards.push({
          keyword: keyword.trim(),
          value,
          comment: comment?.trim(),
        });
      } else if (card.startsWith('COMMENT') || card.startsWith('HISTORY')) {
        cards.push({ type: card.slice(0, 7).trim(), text: card.slice(8).trim() });
      }
    }

    return JSON.stringify({
      format: 'FITS',
      note: 'Header only. Full FITS data extraction requires: from astropy.io import fits',
      headerCards: cards.length,
      header: cards,
      fileSize: buffer.length,
      hdu: hdu ?? 0,
    }, null, 2);
  }

  private fitsToCsv(buffer: Buffer, hdu?: number): string {
    const json = JSON.parse(this.fitsToJson(buffer, hdu));
    const rows = ['keyword,value,comment'];
    for (const card of json.header) {
      if (card.keyword) {
        const val = typeof card.value === 'string' ? `"${card.value.replace(/"/g, '""')}"` : card.value;
        const cmt = card.comment ? `"${card.comment.replace(/"/g, '""')}"` : '';
        rows.push(`${card.keyword},${val},${cmt}`);
      }
    }
    return rows.join('\n');
  }
}
