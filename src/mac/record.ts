import { ParseBox, Box } from './box';
import fs from 'fs-extra';


export interface Chunk {
	start: number;
	end: number;

	inner_start: number; /**< Offset at which the boxes start */
	inner_end: number;
}


// Parsing a decompressed chunk from the archive into file blocks
export function ParseChunk(data: Buffer): Chunk {

	// Chunk starts with it's own size
	let chunkSize = data.readUInt32LE(0);
	
	let end = 4 + chunkSize;

	// A record will only ever consist of a single chunk
	if(end !== data.length) {
		throw new Error('Chunk does not take up full record')
	}

	return {
		start: 0,
		end: end,
		inner_start: 4,
		inner_end: end // No data after the inner stuff, so it is the same as the normal end
	};
}


/**
 * A top-level datastructure which seems to always be a container of compressed data
 * The size of a record is always aligned to multiples of the current files block size
 * (or at least, the record ends at a multiple of the block size)
 * 
 * It consists of a single compressed chunk
 */
export interface Record {
	flags: number;
	start: number; /**< Start position in the file of this chunk (beginning of the header) */
	end: number; /**< End position in the file of this chunk */

	inner_start: number; /**< Start of the compressed block (usually 4 bytes after start) */
	inner_end: number; /**< End of the compressed block (usually 4 bytes before end) */
}

const RECORD_HEADER_SIZEOF = 4;
const RECORD_TRAILER_SIZEOF = 4;


async function ParseRecordHeader(file: number, pos: number): Promise<{ header_size: number; flags: number }> {

	let header = Buffer.allocUnsafe(4);
	await fs.read(file, header, 0, 4, pos); pos += 4;

	let flags = header[0];
	if(flags !== 0x98 && flags !== 0x68) {
		console.warn('Unknown record flags: ' + flags.toString(16));
	}

	let header_size = header.readUIntLE(1, 3); // Uint24

	return { header_size, flags };
}

async function ParseRecordTrailer(file: number, pos: number): Promise<{ trailer_size: number }> {
	let trailer = Buffer.allocUnsafe(4);
	await fs.read(file, trailer, 0, 4, pos);

	if(trailer[0] !== 0x78) {
		console.warn('Unknown trailer flags');
	}

	let trailer_size = trailer.readUIntLE(1, 3); // Uint24

	return { trailer_size };
}


// TODO: Need to eventually have good support for detecting going over the end of the file for the purposes of recovering from incomplete archives
export async function ParseRecord(file: number, blockSize: number, pos: number): Promise<Record> {

	let start = pos;
	let inner_start = start + RECORD_HEADER_SIZEOF;

	let { header_size, flags } = await ParseRecordHeader(file, start);
	
	let end = inner_start + header_size;
	let inner_end = end - RECORD_TRAILER_SIZEOF;

	let { trailer_size } = await ParseRecordTrailer(file, inner_end);
	
	if(header_size !== trailer_size) {
		throw new Error('Invalid header/trailer')
	}

	if(end % blockSize !== 0) {
		console.warn('Record does not end at a block offset');
	}

	return {
		flags,
		start, end,
		inner_start, inner_end
	};
}

/**
 * Given the end offset of a record, this will parse it backwards starting at the trailer and deriving the start of the record
 * 
 * This is basically an opposite version of the above ParseRecord function
 */
export async function ParseReverseRecord(file: number, blockSize: number, pos: number) {
	
	let end = pos;
	let inner_end = end - RECORD_TRAILER_SIZEOF;

	if(end % blockSize !== 0) {
		console.warn('Record does not end at a block offset');
	}

	let { trailer_size } = await ParseRecordTrailer(file, inner_end);

	let start = inner_end - trailer_size;
	let inner_start = start + RECORD_HEADER_SIZEOF;
		
	let { header_size, flags } = await ParseRecordHeader(file, start);

	if(header_size !== trailer_size) {
		throw new Error('Invalid header/trailer')
	}
	
	return {
		flags,
		start, end,
		inner_start, inner_end
	};
}



// Gets all boxes from inside a chunk
export function ParseAllBoxes(chunkData: Buffer, chunk: Chunk): Box[] {
	let out = [];

	let pos = chunk.inner_start;
	while(pos < chunk.inner_end) {
		let box = ParseBox(chunkData, pos);
		out.push(box);
		pos = box.end;
	}

	if(pos !== chunk.inner_end) {
		throw new Error('Over/underrun of chunk');
	}

	return out;
}
