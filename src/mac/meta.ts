import { ReadCompressedStream } from '../compression';
import { ReadRecord, ReadChunkHeader, ReadAllBoxes } from './record';
import { Box } from './box';
import { Reader, DataViewReader, ReaderEndian } from '../reader';
import { CheckAllZeros } from '../utils';


export interface MacVolumeMetaFile {
	boxes: Box[];
}

export async function ParseMacVolumeMetaFile(reader: Reader): Promise<MacVolumeMetaFile> {

	reader.seek(0);
	let size = await reader.length();

	let allBoxes: Box[] = [];

	let blockSize = 128;

	while(reader.pos() < size) {
		let metaHeader = Buffer.from(await reader.readBytes(16));

		if(metaHeader[0] !== 0x77 || metaHeader[1] !== 0x14) {
			console.warn('Strange looking meta header:', metaHeader);
		}


		let record = await ReadRecord(reader, blockSize);
		reader.seek(record.inner_start);

		if(record.flags === 0x88) {
			let chunkData = await ReadCompressedStream(
				reader, record.inner_end - record.inner_start
			);

			if(!(await CheckAllZeros(reader, record.inner_end - reader.pos()))) {
				console.warn('Detected unknown data in padding after compressed stream');
			}

			let chunkReader = new DataViewReader(chunkData, ReaderEndian.LittleEndian);

			let chunk = await ReadChunkHeader(chunkReader);
			
			let boxes = await ReadAllBoxes(chunkReader, chunk);

			allBoxes.push.apply(allBoxes, boxes);
		}
		else if(record.flags === 0x80) {
			// Usually is the first record and i don't know what it means
		}
		else {
			console.warn('(META) Unknown record flags:', record.flags);
		}

		reader.seek(record.end);
	}

	if(reader.pos() !== size) {
		throw new Error('Did not correctly consume entire metafile');
	}


	return { boxes: allBoxes };
}
