import { ReadBox, Box } from './box';
import { Reader } from '../reader';
import assert from 'assert';


export interface Chunk {
	start: number;
	end: number;

	inner_start: number; /**< Offset at which the boxes start */
	inner_end: number;
}


// Parsing a decompressed chunk from the archive into file blocks
// NOTE: THis will read up to the inner start offset of the chunk 
export async function ReadChunkHeader(reader: Reader): Promise<Chunk> {

	let start = reader.pos();

	// Chunk starts with it's own size
	let chunkSize = await reader.readUint32();
	
	let inner_start = reader.pos();

	let end = reader.pos() + chunkSize;

	// TODO: Should be done only if we have the entire chunk decompressed
	/*
	// A record will only ever consist of a single chunk
	if(end !== reader.length()) {
		throw new Error('Chunk does not take up full record')
	}
	*/

	return {
		start,
		end,
		inner_start,
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


async function ReadRecordHeader(reader: Reader): Promise<{ header_size: number; flags: number }> {

	let header = Buffer.from(await reader.readBytes(RECORD_HEADER_SIZEOF));

	let flags = header[0];
	if(flags !== 0x98 && flags !== 0x68) {
		console.warn('Unknown record flags: ' + flags.toString(16));
	}

	let header_size = header.readUIntLE(1, 3); // Uint24

	return { header_size, flags };
}

async function ReadRecordTrailer(reader: Reader): Promise<{ trailer_size: number }> {
	let trailer = Buffer.from(await reader.readBytes(RECORD_TRAILER_SIZEOF));

	if(trailer[0] !== 0x78) {
		console.warn('Unknown trailer flags');
	}

	let trailer_size = trailer.readUIntLE(1, 3); // Uint24

	return { trailer_size };
}


// TODO: Need to eventually have good support for detecting going over the end of the file for the purposes of recovering from incomplete archives
export async function ReadRecord(reader: Reader, blockSize: number): Promise<Record> {

	let start = reader.pos();

	let { header_size, flags } = await ReadRecordHeader(reader);
	
	let inner_start = reader.pos();

	let end = inner_start + header_size;
	let inner_end = end - RECORD_TRAILER_SIZEOF;

	reader.seek(inner_end);

	// TODO: For efficiency, we may not want to read the trailer immediately until we read the data in the record
	let { trailer_size } = await ReadRecordTrailer(reader);
	
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
export async function ReverseReadRecord(reader: Reader, blockSize: number) {
	
	let end = reader.pos();
	let inner_end = end - RECORD_TRAILER_SIZEOF;

	reader.seek(inner_end);

	if(end % blockSize !== 0) {
		console.warn('Record does not end at a block offset');
	}

	let { trailer_size } = await ReadRecordTrailer(reader);

	let start = inner_end - trailer_size;
		
	reader.seek(start);

	let { header_size, flags } = await ReadRecordHeader(reader);

	let inner_start = reader.pos();

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
export async function ReadAllBoxes(reader: Reader, chunk: Chunk): Promise<Box[]> {
	let out = [];

	reader.seek(chunk.inner_start);
	while(reader.pos() < chunk.inner_end) {
		let box = await ReadBox(reader);
		out.push(box);
	}

	assert.strictEqual(reader.pos(), chunk.inner_end, 'Over/underrun of chunk');

	return out;
}
