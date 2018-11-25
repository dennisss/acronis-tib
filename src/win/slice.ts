import Slice, { SliceConfig } from '../slice';
import { ListingRecord, ReadAllRecords, RecordType } from './record';
import { VolumeFooter, Windows2015Volume } from './volume';
import { ConcatenatedReader, Reader } from '../reader';
import { ParseConfigRecord } from './config';


// TODO: windows slices will need to store the type 'inc'/'full'

export enum SliceForm {
	Unknown = 0,
	FileSystem = 1,
	SectorBySector = 2
}

/**
 * Always located at the very end of each slice and indicates where in the archive the metadata for this slice starts 
 */
export interface SliceTrailer {
	isValid: boolean;
	form: SliceForm; /**< TODO: Check that this is consistent across all slices in a single archive */
	metaDataOffset: number; /**< This will be the offset of the RecordType.Config block relative to the start of the archive (skipping all headers) such that each this slice starts at the sum of all sliceSizes before this one */
}



export default class WindowsSlice extends Slice {

	static async Open(volumes: Windows2015Volume[], parent: WindowsSlice|null): Promise<WindowsSlice> {
		
		// TODO: We can also detect which files are the end of a slice without the filenames by looking for which one has a valid footer (which combined with having valid footer offsets could be a rebost check)

		let footer = await volumes[volumes.length - 1].readFooter();
		if(!footer.isValid) {
			throw new Error('Invalid slice footer');
		}

		let n = footer.sliceSize;
		let innerReaders: Reader[] = [];
		for(let i = 0; i < volumes.length; i++) {
			let v = volumes[i];

			// TODO: For the last volume, we also can't 
			let maxSize = (await v.reader.length()) - v.startOffset();

			// For the last volume, we also can't count any of the footer
			if(i === volumes.length - 1) {
				maxSize -= footer.length;
			}


			let size = Math.min(maxSize, n);

			if(size === 0) {
				throw new Error('Extra data beyond slice size!');
			}

			n -= size;

			innerReaders.push(
				v.reader.slice(v.startOffset(), v.startOffset() + size)
			);
		}

		let reader = await ConcatenatedReader.Create(innerReaders);

		if(n !== 0) {
			throw new Error('Not all slice data could be found');
		}


		let absoluteReader = await (
			parent? parent.absoluteReader.append(reader) : ConcatenatedReader.Create([ reader ])
		);


		let s = new WindowsSlice(volumes, parent);

		s.reader = reader;
		s.absoluteReader = absoluteReader;
		s.trailer = await this.ReadTrailer(reader);
		s.config = {};

		if(!s.trailer.isValid) {
			throw new Error('Could not validate slice trailer');
		}


		// Finally grab the metadata
		absoluteReader.seek(s.trailer.metaDataOffset);
		let recs = await ReadAllRecords(absoluteReader);

		let foundSomeConfig = false;

		for(var r of recs) {
			if(r.type === RecordType.Listing) {
				if(s.listing) {
					throw new Error('Got multiple listings in one slice!');
				}

				s.listing = r;
			}
			// NOTE: slices do seem to sometimes legitatemely have duplicate configurations, but we will ignore them and just take the last one in the file
			else if(r.type === RecordType.Config) {
				await ParseConfigRecord(r, s.config);
				foundSomeConfig = true;
			}
		}

		if(!s.listing) {
			throw new Error('Slice missing listing');
		}

		if(!foundSomeConfig) {
			throw new Error('Slice missing any configuration info');
		}

		return s;

	}

	/**
	 * Given a reader that ends on at the end of a slice, this will read it's trailer
	 */
	private static async ReadTrailer(reader: Reader): Promise<SliceTrailer> {

		reader = reader.slice();

		let end = await reader.length()

		reader.seek(end - 4);

		let lastFour = Buffer.from(await reader.readBytes(4));


		// TODO: Validate all of the offsets we are reading are actually with-in the bounds of the slice/files
		// TODO: All offsets must also not intersect with the header/footer of the file


		let form = SliceForm.Unknown;
		let metaDataOffset = -1;
		let isValid = true;

		// Usually this case is for file/directory-based backups
		// The header for these is pretty trivial
		if(lastFour.equals(Buffer.from('2C8AE194', 'hex'))) {
			form = SliceForm.FileSystem;
			reader.seek(end - 12); // < Right before the last 4 characters
			metaDataOffset = await reader.readUint64();
		}
		// For sector-by-sector backups
		else if(lastFour.equals(Buffer.from('2B8AE194', 'hex'))) {
			form = SliceForm.SectorBySector;

			console.warn('Sector-by-sector mode not yet supported')

			// TODO: Refigure this out

			reader.seek(end - 8);

			let trailerSize = await reader.readUint32();


			let startOfTrailer = end - 8 - trailerSize;

			reader.seek(startOfTrailer);

			let trailer = Buffer.from(await reader.readBytes(trailerSize));

			let pos = 0;

			// First two bytes of the trailer are always zero
			pos += 2;
			
			// Offset of the metadata entry
			let metaDataOffLen = trailer[pos]; pos += 1;
			let metaDataOff = trailer.readUIntLE(pos, metaDataOffLen); pos += metaDataOffLen;

			pos += 7;

			// This is the total fully uncompressed size of the main partition?
			let fullSizeLen = trailer[pos]; pos += 1;
			let fullSize = trailer.readUIntLE(pos, fullSizeLen); pos += fullSizeLen;

			pos += 2;

			let metaDataOff2Len = trailer[pos]; pos += 1;
			let metaDataOff2 = trailer.readUIntLE(pos, metaDataOffLen); pos += metaDataOffLen;


		}
		else {
			console.warn(lastFour);
			isValid = false;
		}


		await reader.close();

		return {
			isValid,
			metaDataOffset,
			form
		};
	}


	reader: Reader; /**< A reader over this single slice */
	absoluteReader: ConcatenatedReader; /**< A reader over the entire archive up to this point (We don't need to use a full archive reader as we don't expect a slice to contain data from future not-yet created child slices). The totalReader of the final slice can be considering to completely cover the entire archive */

	footer: VolumeFooter;
	trailer: SliceTrailer;
	config: SliceConfig;
	listing: ListingRecord;

	get id() {
		// TODO
		return Buffer.from([]);
	}

	get creationTime() {
		// TODO
		return new Date()
	}

	async close() {

	}

}