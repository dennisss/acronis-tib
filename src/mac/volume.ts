import Volume, { VolumeVersion } from '../volume';
import { Box, BoxHandle, ReadBox } from './box';
import { ReadRecord, ReadChunkHeader, ReadAllBoxes } from './record';
import { ReadCompressedStream } from '../compression';
import { MacVolumeMetaFile } from './meta';
import assert from 'assert';
import { DataViewReader, ReaderEndian } from '../reader';
import { CheckAllZeros } from '../utils';


/**
 * Represents the single .tib file stored for MacOS 
 */
export default class MacVolume extends Volume {
	
	static _generator() { return new MacVolume(); }


	public metaFile: MacVolumeMetaFile;

	/**
	 * Gets the starting offset of actual records in this file
	 * Most offsets referenced in the metadata file will be relative to this offset
	 */
	startOffset() {
		return this.header.blockSize * 3;
	}

	async readBoxHandle(handle: BoxHandle): Promise<Box> {

		let reader = this.reader.slice();

		// TODO: Deduplicate this code with the code in readAll

		reader.seek(this.startOffset() + handle.record_start);

		let record = await ReadRecord(reader, this.header.blockSize);

		if(record.end - record.start !== handle.record_size) {
			throw new Error('Handle record size mismatch with file');
		}

		reader.seek(record.inner_start);

		// TODO: For efficiency, this would ideally try to obtain a cached handle to this record assumming that the majority of reads will occur sequentially
		let chunkData = await ReadCompressedStream(
			reader, record.inner_end - record.inner_start
		);

		let chunkReader = new DataViewReader(chunkData, ReaderEndian.LittleEndian);
		
		// TODO: We could use the header for safety bounding the compressed stream?
		let chunk = await ReadChunkHeader(chunkReader);

		// TODO: This also implies that my size calculations are wrong
		chunkReader.seek(handle.start - 5);

		let box = await ReadBox(chunkReader);

		// TODO: Need more robust closing even in the case of internal failures
		await reader.close();

		// TODO: Will need to refactor type extraction now
		//assert.strictEqual(box.type & 0xff, handle.type & 0xff, 'Box read does not have the expected handle type');

		return box;
	}


	/**
	 * Reads every single record/box in the file from the beginning to the end
	 * NOTE: Not advisable for large archives as this will store it all in memory
	 * 
	 * This is mostly intented for verifying an entire file from beginning to end
	 */
	async readAll(): Promise<Box[]> {

		let reader = this.reader.slice();
		reader.seek(this.startOffset());
	
		let size = await reader.length();

		if(size % this.header.blockSize !== 0) {
			console.warn('File not aligned to block multiples');
		}
	
	
		let allBoxes: Box[] = [];

		while(reader.pos() < size) {
		
			let record = await ReadRecord(reader, this.header.blockSize);
	
			reader.seek(record.inner_start);

			let chunkData = await ReadCompressedStream(
				reader, record.inner_end - record.inner_start,
			);

			if(!(await CheckAllZeros(reader, record.inner_end - reader.pos()))) {
				console.warn('Detected unknown data in padding after compressed stream');
			}

			let chunkReader = new DataViewReader(chunkData, ReaderEndian.LittleEndian);

			let chunk = await ReadChunkHeader(chunkReader);
	
			let boxes = await ReadAllBoxes(chunkReader, chunk);
			allBoxes.push.apply(allBoxes, boxes);

			reader.seek(record.end);
		}
	
		assert.strictEqual(reader.pos(), size, 'Over/underrun of file');

		await reader.close();

		return allBoxes;
	}
	

}

Volume._AddType(VolumeVersion.Mac, MacVolume._generator);


