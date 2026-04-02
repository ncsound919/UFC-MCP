import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { statSync } from 'fs';
import { dirname } from 'path';
import { ConversionState } from '../state/ConversionState.js';

export type GeoSciFormat = 'nc' | 'hdf5' | 'h5' | 'he5' | 'tiff' | 'geotiff' | 'shp' | 'kml' | 'geojson' | 'json' | 'csv';

export interface GeoSciConvertOptions {
  inputPath: string;
  outputPath: string;
  inputFormat?: GeoSciFormat;
  outputFormat?: GeoSciFormat;
  variable?: string; // For NetCDF/HDF5 - specific variable to extract
}

export class GeoscienceProcessor {
  constructor(private state: ConversionState) {}

  private extToFormat(ext: string): GeoSciFormat {
    const map: Record<string, GeoSciFormat> = {
      nc: 'nc', netcdf: 'nc', nc4: 'nc',
      hdf5: 'hdf5', h5: 'h5', he5: 'he5',
      tif: 'tiff', tiff: 'tiff', geotiff: 'geotiff',
      shp: 'shp', shapefile: 'shp',
      kml: 'kml', kmz: 'kml',
      geojson: 'geojson',
      json: 'json', csv: 'csv',
    };
    return map[ext.toLowerCase()] ?? 'json';
  }

  async convert(opts: GeoSciConvertOptions) {
    const { inputPath, outputPath, inputFormat, outputFormat, variable } = opts;
    const inExt = inputPath.split('.').pop() ?? '';
    const outExt = outputPath.split('.').pop() ?? '';
    const inFmt = inputFormat ?? this.extToFormat(inExt);
    const outFmt = outputFormat ?? this.extToFormat(outExt);
    const record = this.state.createRecord('geoscience', inputPath, outputPath, opts);
    try {
      // Most geoscience formats are binary
      const input = readFileSync(inputPath);
      mkdirSync(dirname(outputPath), { recursive: true });
      const output = this.transform(input, inputPath, inFmt, outFmt, variable);
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

  private transform(input: Buffer, inputPath: string, inFmt: GeoSciFormat, outFmt: GeoSciFormat, variable?: string): string {
    // These formats require specialized libraries
    switch (`${inFmt}->${outFmt}`) {
      case 'kml->geojson': return this.kmlToGeoJSON(input.toString('utf8'));
      case 'kml->json': return this.kmlToJson(input.toString('utf8'));
      case 'geojson->json': return input.toString('utf8'); // Already JSON
      default:
        throw new Error(
          `Geoscience format conversion ${inFmt} -> ${outFmt} requires specialized libraries. ` +
          'Use appropriate tooling (for example: netCDF4/xarray/h5py for nc/hdf5; ' +
          'GDAL/rasterio for GeoTIFF; geopandas for shapefiles; fastkml for KML) ' +
          `to read the source file ("${inputPath}", size ${input.length} bytes) and export to JSON/CSV.`
        );
    }
  }

  private kmlToGeoJSON(src: string): string {
    // Basic KML to GeoJSON converter (simplified)
    const features: any[] = [];

    // Extract Placemarks
    const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    let match;

    while ((match = placemarkRegex.exec(src)) !== null) {
      const placemarkContent = match[1];
      const name = placemarkContent.match(/<name>(.*?)<\/name>/)?.[1] || '';
      const desc = placemarkContent.match(/<description>(.*?)<\/description>/)?.[1] || '';

      // Extract coordinates
      const coordMatch = placemarkContent.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/);
      if (coordMatch) {
        const coordStr = coordMatch[1].trim();
        const coords = coordStr.split(/\s+/).map(c => {
          const [lon, lat, alt] = c.split(',').map(parseFloat);
          if (!isFinite(lon) || !isFinite(lat)) return null;
          return isFinite(alt) ? [lon, lat, alt] : [lon, lat];
        }).filter(Boolean);

        const geometry: any = coords.length === 1
          ? { type: 'Point', coordinates: coords[0] }
          : { type: 'LineString', coordinates: coords };

        features.push({
          type: 'Feature',
          properties: { name, description: desc },
          geometry,
        });
      }
    }

    return JSON.stringify({
      type: 'FeatureCollection',
      features,
    }, null, 2);
  }

  private kmlToJson(src: string): string {
    // Basic KML parser to structured JSON
    const data: any = {
      format: 'KML',
      placemarks: [],
    };

    const documentName = src.match(/<Document>[\s\S]*?<name>(.*?)<\/name>/)?.[1];
    if (documentName) data.documentName = documentName;

    const placemarkRegex = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    let match;

    while ((match = placemarkRegex.exec(src)) !== null) {
      const content = match[1];
      const placemark: any = {
        name: content.match(/<name>(.*?)<\/name>/)?.[1] || '',
        description: content.match(/<description>(.*?)<\/description>/)?.[1] || '',
      };

      const coordMatch = content.match(/<coordinates>\s*([\s\S]*?)\s*<\/coordinates>/);
      if (coordMatch) {
        placemark.coordinates = coordMatch[1].trim().split(/\s+/).map(c => {
          const [lon, lat, alt] = c.split(',').map(parseFloat);
          return { longitude: lon, latitude: lat, altitude: alt };
        });
      }

      data.placemarks.push(placemark);
    }

    return JSON.stringify(data, null, 2);
  }
}
