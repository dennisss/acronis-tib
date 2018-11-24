import { FileEntry, ReadFileEntry } from './file_entry';
import assert from 'assert';
import { Reader } from '../reader';


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
	MetaData = 0x0040, // < More specifically this is metadata for a single Slice?

	Empty = -1
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

	sliceId: Buffer; /**< 16byte UUID identifying the slice */
	sliceCreationTime: Date;

	xml: string;
	files: FileEntry[]; // TODO: Eventually we will require that these be parsed separately after reading the initial outer box
}

export interface EmptyBox extends OpaqueBox {
	type: BoxType.Empty;
}


export type Box = UnknownBox | ContainerBox | BlobBox | StatTimeBox | StatUserBox | AttributesBox | MetaDataBox | EmptyBox;



export async function ReadBox(reader: Reader): Promise<Box> {

	let start = reader.pos();

	let magic = await reader.readUint8();
	
	/*
	if(magic !== BOX_MAGIC) { // XXX: Magic will be different depending on the file type
		throw new Error('Invalid box');
	}
	*/

	let size = await reader.readUint24();
	
	// Zero-length boxes do seem to actually exist
	if(size === 0) {
		return {
			start,
			end: reader.pos(),
			type: BoxType.Empty
		};	
	}
	// But if we don't have enough bytes to represent the type of box, then it is definately wrong
	else if(size < 2) {
		throw new Error('Unexpected small box');
	}


	// TODO: Actually there is a 1 byte 0xC0 and then 4 bytes of actual type information (so the type is a uint32)
	let rawType = await reader.readUint16(); size -= 2;

	let type = rawType;

	/*
	if(something !== 0xC0) {
		type = BoxType.Unknown;
		console.warn('Unknown something: ' + something);
	}
	*/

	let bodyStart = reader.pos();
	let bodySize = size;
	let bodyEnd = bodyStart + bodySize;

	// TODO: This can't be efficiently done in the case we were given a CompressedReader which doesn't know the length
	/*
	pos += bodySize;
	if(data.length < bodyEnd) {
		// This will happen if the buffer given doesn't have enough bytes to satisfy the full box
		throw new Error('Underrunning box');
	}
	*/

	// No bytes after the body
	let end = bodyEnd;


	let box: Box;

	if(type === BoxType.Container) {
		assert(bodySize === 7);

		box = {
			start, end,
			type: BoxType.Container
		};
	}
	else if(type === BoxType.Blob) {
		reader.skip(3);

		box = {
			start, end,
			type: BoxType.Blob,
			data: Buffer.from(await reader.readBytes(bodyEnd - reader.pos()))
		};
	}
	else if(type === BoxType.StatTime) {
		reader.skip(3);
		assert(bodySize === 19)
		
		let mtime = await reader.readUint64();

		box = {
			start, end,
			type: BoxType.StatTime,
			mtime: new Date(mtime)
		};
	}
	else if(type === BoxType.StatUser) {
		assert.equal(bodySize, 23);

		reader.skip(11);
		let user_id = await reader.readUint32();
		let group_id = await reader.readUint32();

		box = {
			start, end,
			type: BoxType.StatUser,
			group_id: group_id,
			user_id: user_id	
		};
	}
	else if(type === BoxType.Attributes) {
		reader.skip(3);

		let list: Attrib[] = [];

		while(reader.pos() < bodyEnd) {

			let keySize = await reader.readUint16();
			let valSize = await reader.readUint64();

			// TODO: For small buffers like this, we want to copy them out so that we can garbage collect the outer chunk memory
			let key = Buffer.from(await reader.readBytes(keySize));
			let val = Buffer.from(await reader.readBytes(valSize));

			list.push({
				key, value: val
			});
		}

		assert.strictEqual(reader.pos(), bodyEnd, 'Not all attribute data consumed'); 

		box = {
			start, end,
			type: BoxType.Attributes,
			list: list
		};
	}
	else if(type === BoxType.MetaData) {

		// TODO: We should use absolute file positions for this as body offsets are really annoying to deal with

		let inner_size = await reader.readUint24();

		let inner_start = reader.pos();
		let inner_end = inner_start + inner_size;
		// TODO: There is still a lot of info after this as well

		/*
			Into the chunk file, at offset 38 is another uint32 representing the size 

			uint16 located at 64 byte offset -> represents a small chunk immediately after it
		*/


		reader.skip(53);

		let sliceId = Buffer.from(await reader.readBytes(16));
		let sliceCreationTime = new Date(await reader.readUint64());


		// This says '<?xml' in unicode
		const xmlMagic = Buffer.from('FFFE3C003F0078006D006C', 'hex');

		// We currently don't know how to parse everything before the xml string, so we will just try to find the xml string and then go from there
		let foundXml = false;

		let searchPos = inner_start + 100;
		while(reader.pos() <= inner_end - xmlMagic.length) {

			reader.seek(searchPos);

			let testBuf = Buffer.from(await reader.readBytes(xmlMagic.length));

			if(testBuf.equals(xmlMagic)) {
				foundXml = true;

				// Go back 2 spaces (because we do know that the length of the xml is immediately before it)
				reader.seek(searchPos - 2);

				break;
			}

			// Next time search 1 byte forward
			searchPos++;
		}

		// NOTE: For a normal backup of just plain files, 'bodyPos == inner_start + 155' right here

		if(!foundXml) {
			throw new Error('Could not find the configuration xml');
		}

		let xmlSize = await reader.readUint16(); // Size of xml in bytes

		let xml = Buffer.from(await reader.readBytes(xmlSize)).toString('utf16le');

		// I don't know why this is, but there is clearly a vector of some kind immediately after the 
		let someMagicByte = await reader.readUint8();
		reader.skip(-1);

		if(someMagicByte !== 0) {
			reader.skip(52);
		}
		else {
			reader.skip(8);
		}


		// TODO: Ideally slice to the size of the maximum size we can handle based on the current directory

		let files: FileEntry[] = []

		while(reader.pos() < inner_end - 3) {
			// TODO: Instead these should be called directory entries (or fs entries?)
			let file = await ReadFileEntry(reader);
			files.push(file);
		}
		
		box = {
			start, end,
			type: BoxType.MetaData,
			sliceId,
			sliceCreationTime,
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


	// In case we didn't parse everything, go to the end of the box
	reader.seek(bodyEnd);

	return box;
}
