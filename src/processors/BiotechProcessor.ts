import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type BioFormat = 'fasta' | 'fastq' | 'vcf' | 'gff' | 'gff3' | 'gtf' | 'pdb' | 'json' | 'csv';

export interface BioConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: BioFormat;
  outputFormat?: BioFormat;
}

export class BiotechProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): BioFormat {
    const map: Record<string, BioFormat> = {
      fasta: 'fasta', fa: 'fasta', fna: 'fasta', faa: 'fasta',
      fastq: 'fastq', fq: 'fastq',
      vcf: 'vcf', gff: 'gff', gff3: 'gff3', gtf: 'gtf',
      pdb: 'pdb', json: 'json', csv: 'csv',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: BioConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord('biotech', inputPath, outputPath, opts);    try {
      const input = readFileSync(inputPath, 'utf8');
      mkdirSync(dirname(outputPath), { recursive: true });
      const output = this.transform(input, inFmt, outFmt);
      writeFileSync(outputPath, output);
      const inStat = statSync(inputPath);
      const outStat = statSync(outputPath);
      this.state.completeRecord(record, true, { inputSize: inStat.size, outputSize: outStat.size });      return { success: true, inputPath, outputPath, inputFormat: inFmt, outputFormat: outFmt, inputSize: inStat.size, outputSize: outStat.size };
    } catch (err: any) {
      this.state.completeRecord(record, false, { error: err.message });      throw err;
    }
  }

  private transform(input: string, inFmt: BioFormat, outFmt: BioFormat): string {
    switch (`${inFmt}->${outFmt}`) {
      case 'fasta->json': return this.fastaToJson(input);
      case 'fasta->csv': return this.fastaToCsv(input);
      case 'fastq->json': return this.fastqToJson(input);
      case 'fastq->fasta': return this.fastqToFasta(input);
      case 'vcf->json': return this.vcfToJson(input);
      case 'vcf->csv': return this.vcfToCsv(input);
      case 'gff->json': case 'gff3->json': case 'gtf->json': return this.gffToJson(input, inFmt);
      case 'gff->csv': case 'gff3->csv': case 'gtf->csv': return this.gffToCsv(input);
      case 'pdb->json': return this.pdbToJson(input);
      default: throw new Error(`Unsupported bio conversion: ${inFmt} -> ${outFmt}`);
    }
  }

  private fastaToJson(src: string): string {
    const records: any[] = [];
    let current: any = null;
    for (const line of src.split(/\r?\n/)) {
      if (line.startsWith('>')) {
        if (current) records.push(current);
        const [id, ...rest] = line.slice(1).split(' ');
        current = { id, description: rest.join(' '), sequence: '' };
      } else if (current) {
        current.sequence += line.trim();
      }
    }
    if (current) records.push(current);
    const enriched = records.map(r => ({
      ...r,
      length: r.sequence.length,
      gcContent: r.sequence.length ? +((r.sequence.split('').filter((c: string) => 'GCgc'.includes(c)).length / r.sequence.length) * 100).toFixed(2) : 0,
    }));
    return JSON.stringify({ count: enriched.length, records: enriched }, null, 2);
  }

  private fastaToCsv(src: string): string {
    const data = JSON.parse(this.fastaToJson(src));
    const rows = ['id,description,length,gcContent,sequence'];
    for (const r of data.records) rows.push(`${r.id},"${r.description}",${r.length},${r.gcContent},${r.sequence}`);
    return rows.join('\n');
  }

  private fastqToJson(src: string): string {
    const lines = src.split(/\r?\n/).filter(l => l.trim());
    const records: any[] = [];
    for (let i = 0; i + 3 < lines.length; i += 4) {
      const [id, ...rest] = lines[i].slice(1).split(' ');
      records.push({ id, description: rest.join(' '), sequence: lines[i + 1], quality: lines[i + 3], readLength: lines[i + 1].length });
    }
    return JSON.stringify({ count: records.length, records }, null, 2);
  }

  private fastqToFasta(src: string): string {
    const lines = src.split(/\r?\n/).filter(l => l.trim());
    const out: string[] = [];
    for (let i = 0; i + 3 < lines.length; i += 4) {
      out.push('>' + lines[i].slice(1));
      out.push(lines[i + 1]);
    }
    return out.join('\n');
  }

  private vcfToJson(src: string): string {
    const lines = src.split(/\r?\n/);
    const meta: string[] = [];
    let header: string[] = [];
    const variants: any[] = [];
    for (const line of lines) {
      if (line.startsWith('##')) { meta.push(line); continue; }
      if (line.startsWith('#')) { header = line.slice(1).split('\t'); continue; }
      if (!line.trim()) continue;
      const cols = line.split('\t');
      const entry: any = {};
      header.forEach((h, i) => entry[h] = cols[i] ?? '');
      if (entry.INFO) {
        const info: any = {};
        entry.INFO.split(';').forEach((kv: string) => {
          const [k, v] = kv.split('=');
          info[k] = v ?? true;
        });
        entry.INFO_PARSED = info;
      }
      variants.push(entry);
    }
    return JSON.stringify({ metaLines: meta.length, header, variantCount: variants.length, variants }, null, 2);
  }

  private vcfToCsv(src: string): string {
    const data = JSON.parse(this.vcfToJson(src));
    if (!data.header.length) return '';
    const rows = [data.header.join(',')];
    for (const v of data.variants) rows.push(data.header.map((h: string) => `"${(v[h] ?? '').replace(/"/g, '""')}"`).join(','));
    return rows.join('\n');
  }

  private gffToJson(src: string, fmt: BioFormat): string {
    const lines = src.split(/\r?\n/);
    const features: any[] = [];
    const comments: string[] = [];
    for (const line of lines) {
      if (line.startsWith('#')) { comments.push(line); continue; }
      if (!line.trim()) continue;
      const [seqid, source, type, start, end, score, strand, phase, attributes] = line.split('\t');
      const attrs: any = {};
      if (attributes) {
        if (fmt === 'gtf') {
          [...attributes.matchAll(/(\w+)\s+"([^"]+)"/g)].forEach(m => attrs[m[1]] = m[2]);
        } else {
          attributes.split(';').forEach((kv: string) => {
            const [k, v] = kv.trim().split('=');
            if (k) attrs[k] = v ? decodeURIComponent(v) : true;
          });
        }
      }
      features.push({ seqid, source, type, start: +start, end: +end, score: score === '.' ? null : +score, strand, phase: phase === '.' ? null : +phase, attributes: attrs });
    }
    return JSON.stringify({ format: fmt, commentCount: comments.length, featureCount: features.length, features }, null, 2);
  }

  private gffToCsv(src: string): string {
    const data = JSON.parse(this.gffToJson(src, 'gff'));
    const cols = ['seqid', 'source', 'type', 'start', 'end', 'score', 'strand', 'phase'];
    const rows = [cols.join(',')];
    for (const f of data.features) rows.push(cols.map(c => f[c] ?? '').join(','));
    return rows.join('\n');
  }

  private pdbToJson(src: string): string {
    const atoms: any[] = [];
    const helices: any[] = [];
    const sheets: any[] = [];
    let title = '';
    let header = '';
    for (const line of src.split(/\r?\n/)) {
      const rec = line.slice(0, 6).trim();
      if (rec === 'HEADER') header = line.slice(10, 50).trim();
      else if (rec === 'TITLE') title += line.slice(10).trim() + ' ';
      else if (rec === 'ATOM' || rec === 'HETATM') {
        atoms.push({
          serial: +line.slice(6, 11).trim(),
          name: line.slice(12, 16).trim(),
          resName: line.slice(17, 20).trim(),
          chainId: line.slice(21, 22).trim(),
          resSeq: +line.slice(22, 26).trim(),
          x: +line.slice(30, 38).trim(),
          y: +line.slice(38, 46).trim(),
          z: +line.slice(46, 54).trim(),
          occupancy: +line.slice(54, 60).trim(),
          tempFactor: +line.slice(60, 66).trim(),
          element: line.slice(76, 78).trim(),
          hetAtm: rec === 'HETATM',
        });
      } else if (rec === 'HELIX') {
        helices.push({ helixId: line.slice(11, 14).trim(), initChain: line.slice(19, 20).trim(), initSeq: +line.slice(21, 25).trim(), endChain: line.slice(31, 32).trim(), endSeq: +line.slice(33, 37).trim(), helixClass: +line.slice(38, 40).trim(), length: +line.slice(71, 76).trim() });
      } else if (rec === 'SHEET') {
        sheets.push({ strand: +line.slice(7, 10).trim(), sheetId: line.slice(11, 14).trim(), numStrands: +line.slice(14, 16).trim(), initChain: line.slice(21, 22).trim(), initSeq: +line.slice(22, 26).trim(), endChain: line.slice(32, 33).trim(), endSeq: +line.slice(33, 37).trim() });
      }
    }
    const chainMap: Record<string, any[]> = {};
    for (const a of atoms) {
      if (!chainMap[a.chainId]) chainMap[a.chainId] = [];
      chainMap[a.chainId].push(a);
    }
    const chains = Object.entries(chainMap).map(([id, chainAtoms]) => ({ chainId: id, atomCount: chainAtoms.length }));
    return JSON.stringify({ header, title: title.trim(), atomCount: atoms.length, helixCount: helices.length, sheetCount: sheets.length, chains, atoms, helices, sheets }, null, 2);
  }
}
