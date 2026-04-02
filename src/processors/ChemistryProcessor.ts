import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type ChemFormat = 'mol' | 'sdf' | 'mol2' | 'pdb' | 'cml' | 'smiles' | 'inchi' | 'xyz' | 'json' | 'csv';

export interface ChemConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: ChemFormat;
  outputFormat?: ChemFormat;
}

export class ChemistryProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): ChemFormat {
    const map: Record<string, ChemFormat> = {
      mol: 'mol', sdf: 'sdf', mol2: 'mol2', pdb: 'pdb',
      cml: 'cml', xml: 'cml',
      smi: 'smiles', smiles: 'smiles',
      inchi: 'inchi',
      xyz: 'xyz',
      json: 'json', csv: 'csv',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: ChemConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord('chemistry', inputPath, outputPath, opts);
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

  private transform(input: string, inFmt: ChemFormat, outFmt: ChemFormat): string {
    switch (`${inFmt}->${outFmt}`) {
      case 'mol->json': return this.molToJson(input);
      case 'sdf->json': return this.sdfToJson(input);
      case 'xyz->json': return this.xyzToJson(input);
      case 'smiles->json': return this.smilesToJson(input);
      case 'mol->csv': return this.molToCsv(input);
      case 'sdf->csv': return this.sdfToCsv(input);
      default: throw new Error(`Chemistry conversion ${inFmt} -> ${outFmt} requires Open Babel or RDKit. Install: conda install -c conda-forge rdkit`);
    }
  }

  private molToJson(src: string): string {
    const lines = src.split(/\r?\n/);
    const molecule: any = {
      name: lines[0]?.trim() ?? '',
      program: lines[1]?.trim() ?? '',
      comment: lines[2]?.trim() ?? '',
    };

    // Parse counts line (line 3)
    if (lines[3]) {
      const counts = lines[3].trim().split(/\s+/);
      const atomCount = parseInt(counts[0]) || 0;
      const bondCount = parseInt(counts[1]) || 0;

      molecule.atomCount = atomCount;
      molecule.bondCount = bondCount;
      molecule.atoms = [];
      molecule.bonds = [];

      // Parse atoms (starting at line 4)
      for (let i = 4; i < 4 + atomCount && i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        molecule.atoms.push({
          x: parseFloat(parts[0]) || 0,
          y: parseFloat(parts[1]) || 0,
          z: parseFloat(parts[2]) || 0,
          symbol: parts[3] || '',
          massDiff: parseInt(parts[4]) || 0,
          charge: parseInt(parts[5]) || 0,
        });
      }

      // Parse bonds
      for (let i = 4 + atomCount; i < 4 + atomCount + bondCount && i < lines.length; i++) {
        const parts = lines[i].trim().split(/\s+/);
        molecule.bonds.push({
          atom1: parseInt(parts[0]) || 0,
          atom2: parseInt(parts[1]) || 0,
          type: parseInt(parts[2]) || 1,
          stereo: parseInt(parts[3]) || 0,
        });
      }
    }

    // Parse properties (SDF data fields typically appear after 'M  END')
    molecule.properties = {};
    const baseIndex = 4 + (molecule.atomCount || 0) + (molecule.bondCount || 0);
    let startIndex = baseIndex;

    // Find 'M  END' starting from the end of the bond block, then begin parsing
    // properties from the line immediately after it. If not found, fall back to
    // starting at the end of the bond block.
    for (let i = baseIndex; i < lines.length; i++) {
      if (lines[i].trim().startsWith('M  END')) {
        startIndex = i + 1;
        break;
      }
    }

    for (let i = startIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }

      if (line.startsWith('>')) {
        // Expected format: >  <FIELDNAME>
        const match = line.match(/^>\s*<([^>]+)>/);
        if (!match) {
          continue;
        }
        const propName = match[1].trim();

        // Collect all subsequent non-empty lines as the property value until a
        // blank line or end-of-block. Join multiple lines with '\n'.
        const valueLines: string[] = [];
        let j = i + 1;
        for (; j < lines.length; j++) {
          const valueLine = lines[j];
          if (valueLine.trim() === '') {
            break;
          }
          valueLines.push(valueLine);
        }

        molecule.properties[propName] = valueLines.join('\n').trim();
        i = j;
      }
    }

    return JSON.stringify(molecule, null, 2);
  }

  private sdfToJson(src: string): string {
    // SDF is multi-molecule MOL format
    const molecules: any[] = [];
    const molBlocks = src.split(/\$\$\$\$/);

    for (const block of molBlocks) {
      if (block.trim()) {
        try {
          const molJson = this.molToJson(block);
          molecules.push(JSON.parse(molJson));
        } catch (e) {
          // Skip invalid blocks
        }
      }
    }

    return JSON.stringify({
      format: 'SDF',
      moleculeCount: molecules.length,
      molecules
    }, null, 2);
  }

  private xyzToJson(src: string): string {
    const lines = src.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('Invalid XYZ format');

    const atomCount = parseInt(lines[0]) || 0;
    const comment = lines[1];
    const atoms: any[] = [];

    for (let i = 2; i < 2 + atomCount && i < lines.length; i++) {
      const parts = lines[i].trim().split(/\s+/);
      atoms.push({
        symbol: parts[0],
        x: parseFloat(parts[1]) || 0,
        y: parseFloat(parts[2]) || 0,
        z: parseFloat(parts[3]) || 0,
      });
    }

    return JSON.stringify({
      format: 'XYZ',
      atomCount,
      comment,
      atoms,
    }, null, 2);
  }

  private smilesToJson(src: string): string {
    const lines = src.split(/\r?\n/).filter(l => l.trim());
    const molecules: any[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      molecules.push({
        smiles: parts[0],
        name: parts.slice(1).join(' ') || undefined,
      });
    }

    return JSON.stringify({
      format: 'SMILES',
      moleculeCount: molecules.length,
      molecules,
      note: 'For structure calculation, use RDKit: from rdkit import Chem',
    }, null, 2);
  }

  private molToCsv(src: string): string {
    const mol = JSON.parse(this.molToJson(src));
    const rows = ['symbol,x,y,z,charge'];
    for (const atom of mol.atoms || []) {
      rows.push(`${atom.symbol},${atom.x},${atom.y},${atom.z},${atom.charge}`);
    }
    return rows.join('\n');
  }

  private sdfToCsv(src: string): string {
    const data = JSON.parse(this.sdfToJson(src));
    const rows = ['molecule_index,name,atom_count,bond_count'];
    (data.molecules || []).forEach((mol: any, idx: number) => {
      rows.push(`${idx},${mol.name || ''},${mol.atomCount || 0},${mol.bondCount || 0}`);
    });
    return rows.join('\n');
  }
}
