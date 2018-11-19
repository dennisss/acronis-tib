import fs from 'fs-extra';
import Volume, { VolumeVersion } from '../volume';
import { Box } from './box';
import { ParseRecord, ParseChunk, ParseAllBoxes } from './record';
import { ReadCompressedStream } from '../compression';
import { MacVolumeMetaFile } from './meta';


/**
 * 
 */
export default class MacVolume extends Volume {
	
	static _generator() { return new MacVolume(); }


	public metaFile: MacVolumeMetaFile;


	async read(): Promise<Box[]> {

		let pos = this.header.blockSize * 3; // All the real data seems to always start at the third block

		let stat = await fs.fstat(this.fd);
	
		if(stat.size % this.header.blockSize !== 0) {
			console.warn('File not aligned to block multiples');
		}
	
	
		let allBoxes: Box[] = [];

		while(pos < stat.size) {
		
			let record = ParseRecord(this.fd, this.header.blockSize, pos);
	
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


