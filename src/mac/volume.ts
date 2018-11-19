import fs from 'fs-extra';
import Volume, { VolumeVersion } from '../volume';
import { Box, BoxHandle, ParseBox } from './box';
import { ParseRecord, ParseChunk, ParseAllBoxes } from './record';
import { ReadCompressedStream } from '../compression';
import { MacVolumeMetaFile } from './meta';
import assert from 'assert';


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

		// TODO: Deduplicate this code with the code in readAll

		let record = await ParseRecord(this.fd, this.header.blockSize, this.startOffset() + handle.record_start);

		if(record.end - record.start !== handle.record_size) {
			throw new Error('Handle record size mismatch with file');
		}

		let { data: chunkData } = await ReadCompressedStream(
			this.fd, record.inner_start, record.inner_end
		);

		let chunk = ParseChunk(chunkData);


		// TODO: This also implies that my size calculations are wrong
		let box = ParseBox(chunkData, handle.start - 5);

		// TODO: Will need to refactor type extraction now
		//assert.strictEqual(box.type & 0xff, handle.type & 0xff, 'Box read does not have the expected handle type');

		return box;
	}


	/**
	 * Reads every single record/box in the file from the beginning to the end
	 * NOTE: Not advisable for large archives as this will store it all in memory
	 */
	async readAll(): Promise<Box[]> {

		let pos = this.startOffset();

		let stat = await fs.fstat(this.fd);
	
		if(stat.size % this.header.blockSize !== 0) {
			console.warn('File not aligned to block multiples');
		}
	
	
		let allBoxes: Box[] = [];

		while(pos < stat.size) {
		
			let record = await ParseRecord(this.fd, this.header.blockSize, pos);
	
			let { data: chunkData } = await ReadCompressedStream(
				this.fd, record.inner_start, record.inner_end
			);
			let chunk = ParseChunk(chunkData);
	
			let boxes = ParseAllBoxes(chunkData, chunk);
			allBoxes.push.apply(allBoxes, boxes);

			pos = record.end;
		}
	
		if(pos !== stat.size) {
			throw new Error('Over/underrun of file');
		}

		return allBoxes;
	}
	

}

Volume._AddType(VolumeVersion.Mac, MacVolume._generator);


