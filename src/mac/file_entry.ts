import assert from 'assert';


/** Amount of space the handle struct takes up when serialized in the metadata */
const BOX_HANDLE_SIZEOF = 32;

export enum FileType {
	Regular = 0,
	Directory = 128,
	Root = 131
}

export interface AbstractFileEntry {
	start: number; /**< Start offset of the entry */
	end: number; /**< End of the self description of this file */
	extent: number; /**< Offset '>= end' located after all entries inside this entry (different than the regular 'end' field mainly for directories) */

	name: string;
	size: number;
	ctime: Date;
	mtime: Date;

	handles: BoxHandle[];
}


/**
 * This is a reference to a specific box in the main archive
 */
export interface BoxHandle {
	type: number; /**< Type of the box */

	record_start: number; /**< In the main archive, this is the offset of the starting block for the record containing this data. This is relative to the first data block (so 0 is usually at 3*4096 in the file) */

	record_size: number; /**< Total number of bytes taken up in the main archive (typically will be a multiple of the block size) */

	start: number; /**< Start offset of box in the decompressed data */

	size: number; /**< Size of the box starting at the above start offset */
}

export interface DirectoryFileEntry extends AbstractFileEntry {
	type: FileType.Directory;
	numEntries: number; /**< Number of entries inside this directory */
}

export interface RegularFileEntry extends AbstractFileEntry {
	type: FileType.Regular;
}

export type FileEntry = RegularFileEntry | DirectoryFileEntry;


function parseBoxHandles(data: Buffer, start: number, size: number): BoxHandle[] {
	let pos = start;

	let handles: BoxHandle[] = [];

	while(pos < start + size) {
		let type = data.readUInt32LE(pos); pos += 4;

		let len = data.readUInt32LE(pos); pos += 4;

		// NOTE: One type of box can be split across multiple records (usually only for Blob boxes for large files)
		let innerPos = pos;
		while(innerPos < pos + len) {
			let record_start = data.readUIntLE(innerPos, 6); innerPos += 8;
			let start = data.readUInt32LE(innerPos); innerPos += 4;
			let size = data.readUInt32LE(innerPos); innerPos += 4;
			let record_size = data.readUInt32LE(innerPos); innerPos += 4;

			handles.push({
				type: type,
				record_start,
				record_size,
				start,
				size
			});
		}

		assert.equal(innerPos, pos + len);
		pos = innerPos;

		// Each handle ends with 4 bytes that are usually 0 but i'm not sure what they do
		pos += 4;
	}

	// Making sure we consumed the right number of bytes
	assert.equal(pos, start + size);

	return handles;
}

// Reads a file entry that must start at the given position and end before some other position
export function ParseFileEntry(data: Buffer, pos: number): FileEntry {

	let start = pos;

	// Each file starts with some type of prefix. This is a uint32 defining the length of the prefix followed by the actual prefix data
	let prefixSize = data.readUInt32LE(pos); pos += 4;
	pos += prefixSize;

	// Next is the size of the entire entry (inclusive of all entries inside of it and inclusive of these 4 bytes)  
	let restSize = data.readUInt32LE(pos); pos += 4;
	// Jumping to this offset could be used for skipping this file/directory in the fs tree
	let extent = pos - 4 + restSize;

	// Number of extra bytes at the end of this entry which we don't know the purpose of yet
	//let trailerSize = data.readUInt32LE(pos); pos += 4;

	if(data[pos + 4] === 0x40) {
		// XXX: Only seems to occur for the first block
		pos += 32;
	}
	else {
		pos += 8;
	}

	// The length after the current position to the end of the filename
	// This can be useful for skipping decoding of the filename
	let firstPartSize = data.readUInt16LE(pos); pos += 2;

	// Length of the filename in number of characters
	let filenameSize = data.readUInt16LE(pos); pos += 2;
	
	// Unknown 16bit field
	pos += 2;

	// 128 for folders, otherwise this is 0 for regular files
	let fileType = data[pos]; pos += 1;

	let isDirectory = fileType === FileType.Directory || fileType === FileType.Root;
	let isFile = fileType === FileType.Regular;
	if(!isFile && !isDirectory) {
		// TODO: In this case, we should just skip the file entirely instead of guessing the struct sizes
		console.warn('Unknown file type:', fileType);
	}

	pos += 3;

	// Decompressed size in bytes for regular files
	let fileSize = data.readUIntLE(pos, 6); pos += 8; // Uint64
	
	pos += 8;

	let ctime = data.readUIntLE(pos, 6); pos += 8; // Uint64
	let mtime = data.readUIntLE(pos, 6); pos += 8; // Uint64

	// Usually this is 4 0xFF byte
	pos += 4;

	// TODO: Currently this assumes that no rune ever takes up more than 2 bytes
	let filename = data.slice(pos, pos + (2*filenameSize)).toString('utf16le');
	pos += 2*filenameSize;
	
	// TODO: The number 27 bytes after the file name gets incremented with each dirent?

	let numEntries = -1;
	if(isDirectory) {
		numEntries = data.readUInt32LE(pos + 45);

		if(fileType === FileType.Root) {
			pos += 41;
		}
		else {
			pos += 85;
		}
	}
	else if(isFile) {
		pos += 35;
	}


	let handlesSize = data.readUInt32LE(pos); pos += 4;
	let handles: BoxHandle[] = [];
	if(isFile) {
		// TODO: Some directories should be able to have boxes too right? (for attributes)
		handles = parseBoxHandles(data, pos, handlesSize);	
	}
	
	pos += handlesSize;


	// TODO: Sometimes there is extra data after the references
	// - sometimes there is none, other times there are 4 FF End-Of-Entry bytes, sometimes 

	// Skip 4 FF bytes (end of entry indicator)
	// NOTE: These are sometimes not included
	// TODO: Verify that we got the right bytes
	pos += 4;

	let end = isFile? extent : pos;

	let baseEntry: AbstractFileEntry = {
		start, end, extent,
		name: filename,
		size: fileSize,
		ctime: new Date(ctime),
		mtime: new Date(mtime),
		handles
	};

	if(isFile) {
		let e: RegularFileEntry = {
			...baseEntry,
			type: FileType.Regular
		};

		return e;
	}
	else if(isDirectory) {
		let e: DirectoryFileEntry = {
			...baseEntry,
			type: FileType.Directory,
			numEntries
		};

		return e;
	}

	throw new Error('Failed to create entry: Unknown type');
}


