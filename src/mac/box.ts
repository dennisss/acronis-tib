import { ParseFileEntry, FileEntry } from './file_entry';
import assert from 'assert';


// TODO: Start validating this again for all of the boxes instead of records
const BOX_MAGIC = 0xB0;


// These match the box type byte in the file
export enum BoxType {
	// In the main file
	Unknown = 0, // < NOTE: This is the only one that doesn't correspond to an actual byte of data
	Container = 0x01C0,
	Blob = 0x04C0, // NOTE: For blobs, this there will 9bytes before the actual data in the box
	StatTime = 0x05C0,
	StatUser = 0x06C0,
	Attributes = 0x07C0,

	// In the metadata file
	MetaIndex = 0x0070,
	MetaData = 0x0040
}

/**
 * This is a reference to a specific box in the main volume file
 * 
 * NOTE: These are stored in the metafile (so see that information for more information)
 */
export interface BoxHandle {
	type: number; /**< Type of the box */

	record_start: number; /**< In the main archive, this is the offset of the starting block for the record containing this data. This is relative to the first data block (so 0 is usually at 3*4096 in the file) */

	record_size: number; /**< Total number of bytes taken up in the main archive (typically will be a multiple of the block size) */

	start: number; /**< Start offset of box in the decompressed data */

	size: number; /**< Size of the box starting at the above start offset */
}

export interface OpaqueBox {
	start: number; /**< Offset of the beginning of the header */
	end: number; /**< Offset immediately after the end of the box */

}

export interface UnknownBox extends OpaqueBox {
	type: BoxType.Unknown;
	byte: number; /**< This will be the original type byte from the file */
}

export interface ContainerBox extends OpaqueBox {
	type: BoxType.Container;
}

export interface BlobBox extends OpaqueBox {
	type: BoxType.Blob;
	data: Buffer;
}

export interface StatTimeBox extends OpaqueBox {
	type: BoxType.StatTime;
	mtime: Date;
}

export interface StatUserBox extends OpaqueBox {
	type: BoxType.StatUser;
	group_id: number;
	user_id: number;
}

export interface Attrib {
	key: Buffer;
	value: Buffer;
}

export interface AttributesBox extends OpaqueBox {
	type: BoxType.Attributes;
	list: Attrib[];
}

export interface MetaDataBox extends OpaqueBox {
	type: BoxType.MetaData;
	xml: string;
	files: FileEntry[]; // TODO: Eventually we will require that these be parsed separately after reading the initial outer box
}


export type Box = UnknownBox | ContainerBox | BlobBox | StatTimeBox | StatUserBox | AttributesBox | MetaDataBox;



export function ParseBox(data: Buffer, pos: number): Box {

	let start = pos;

	let magic = data[pos]; pos += 1;
	
	/*
	if(magic !== BOX_MAGIC) { // XXX: Magic will be different depending on the file type
		throw new Error('Invalid box');
	}
	*/

	let size = data.readUIntLE(pos, 3); pos += 3; // Uint24
	if(size < 2) {
		throw new Error('Unexpected small box');
	}


	// TODO: Actually there is a 1 byte 0xC0 and then 4 bytes of actual type information (so the type is a uint32)
	let rawType = data.readUInt16LE(pos); pos += 2; size -= 2;

	let type = rawType;

	/*
	if(something !== 0xC0) {
		type = BoxType.Unknown;
		console.warn('Unknown something: ' + something);
	}
	*/

	let bodyStart = pos;
	let bodySize = size;
	let bodyEnd = bodyStart + bodySize;
	pos += bodySize;
	if(data.length < bodyEnd) {
		// This will happen if the buffer given doesn't have enough bytes to satisfy the full box
		throw new Error('Underrunning box');
	}

	let end = pos;


	let box: Box;

	if(type === BoxType.Container) {
		assert(bodySize === 7);

		box = {
			start, end,
			type: BoxType.Container
		};
	}
	else if(type === BoxType.Blob) {
		box = {
			start, end,
			type: BoxType.Blob,
			data: data.slice(bodyStart + 3)
		};
	}
	else if(type === BoxType.StatTime) {
		assert(bodySize === 19)

		// TODO: Not working?
		let mtime = data.readUIntLE(bodyStart + 3, 6); // NOTE: Takes up all 8 bytes?

		box = {
			start, end,
			type: BoxType.StatTime,
			mtime: new Date(mtime)
		};
	}
	else if(type === BoxType.StatUser) {
		assert.equal(bodySize, 23);

		let user_id = data.readUInt32LE(bodyStart + 11);
		let group_id = data.readUInt32LE(bodyStart + 11 + 4);

		box = {
			start, end,
			type: BoxType.StatUser,
			group_id: group_id,
			user_id: user_id	
		};
	}
	else if(type === BoxType.Attributes) {
		let bodyPos = bodyStart + 3;

		let list: Attrib[] = [];

		while(bodyPos < bodyEnd) {

			let keySize = data.readUInt16LE(bodyPos); bodyPos += 2;
			let valSize = data.readUIntLE(bodyPos, 6); bodyPos += 8;

			// TODO: For small buffers like this, we want to copy them out so that we can garbage collect the outer chunk memory
			let key = data.slice(bodyPos, bodyPos + keySize); bodyPos += keySize;
			let val = data.slice(bodyPos, bodyPos + valSize); bodyPos += valSize;

			assert.strictEqual(key.length, keySize);
			assert.strictEqual(val.length, valSize);

			list.push({
				key, value: val
			});
		}

		box = {
			start, end,
			type: BoxType.Attributes,
			list: list
		};

		assert.strictEqual(bodyPos, bodyEnd, 'Not all attribute data consumed'); 
	}
	else if(type === BoxType.MetaData) {

		// TODO: We should use absolute file positions for this as body offsets are really annoying to deal with

		let inner_size = data.readUIntLE(bodyStart + 0, 3); // Uint24

		let inner_start = bodyStart + 3;
		let inner_end = inner_start + inner_size;
		// TODO: There is still a lot of info after this as well

		let bodyPos = inner_start + 159;
		function readU16String(eos = 0x00) {
			let start = bodyPos;
			while(data[bodyPos] !== eos) {
				bodyPos += 2;
			}

			let end = bodyPos;

			let str = data.slice(start, end).toString('utf16le');
			bodyPos += 2; // Skip EOS marker

			return str;
		}

		let xml = readU16String();

		bodyPos += 6;




		// TODO: Ideally slice to the size of the maximum size we can handle based on the current directory

		let files: FileEntry[] = []

		while(bodyPos < inner_end - 3) {
			// TODO: Instead these should be called directory entries (or fs entries?)
			let file = ParseFileEntry(data, bodyPos);
			files.push(file);
			bodyPos = file.end;
		}
		
		box = {
			start, end,
			type: BoxType.MetaData,
			xml: xml,
			files: files
		};
	}
	else {
		box = {
			start, end,
			type: BoxType.Unknown,
			byte: rawType
		};
	}

	return box;
}
