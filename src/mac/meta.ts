import fs from 'fs-extra';
import { ReadCompressedStream } from '../compression';
import { ParseRecord, ParseChunk, ParseAllBoxes } from './record';
import { Box } from './box';


export interface MacVolumeMetaFile {
	boxes: Box[];
}


export async function ParseMacVolumeMetaFile(file: number): Promise<MacVolumeMetaFile> {
	let stat = await fs.fstat(file);

	let allBoxes: Box[] = [];

	let blockSize = 128;

	let pos = 0;
	while(pos < stat.size) {
		let metaHeader = Buffer.allocUnsafe(16);
		await fs.read(file, metaHeader, 0, metaHeader.length, pos); // TODO: Must start checking the return value of commands like this
		pos += metaHeader.length;

		if(metaHeader[0] !== 0x77 || metaHeader[1] !== 0x14) {
			console.warn('Strange looking meta header:', metaHeader);
		}


		let record = ParseRecord(file, blockSize, pos);

		if(record.flags === 0x88) {
			let { data: chunkData } = await ReadCompressedStream(
				file, record.inner_start, record.inner_end
			);

			let chunk = ParseChunk(chunkData);

			let boxes = ParseAllBoxes(chunkData, chunk);

			allBoxes.push.apply(allBoxes, boxes);
		}
		else if(record.flags === 0x80) {
			// Usually is the first record and i don't know what it means
		}
		else {
			console.warn('Unknown record flags:', record.flags);
		}

		pos = record.end;
	}

	if(pos !== stat.size) {
		throw new Error('Did not correctly consume entire metafile');
	}


	return { boxes: allBoxes };
}
