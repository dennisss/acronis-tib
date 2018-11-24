import assert from 'assert';
import { BoxHandle } from './box';
import { Reader } from '../reader';


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
	atime: Date;
	mtime: Date;

	handles: BoxHandle[];
}

export interface DirectoryFileEntry extends AbstractFileEntry {
	type: FileType.Directory;
	numEntries: number; /**< Number of entries inside this directory */
}

export interface RegularFileEntry extends AbstractFileEntry {
	type: FileType.Regular;
}

export type FileEntry = RegularFileEntry | DirectoryFileEntry;


async function readBoxHandles(reader: Reader, size: number): Promise<BoxHandle[]> {

	let start = reader.pos();

	let handles: BoxHandle[] = [];

	while(reader.pos() < start + size) {
		let type = await reader.readUint32();

		let len = await reader.readUint32();

		let innerStart = reader.pos();

		// NOTE: One type of box can be split across multiple records (usually only for Blob boxes for large files)
		while(reader.pos() < innerStart + len) {
			let record_start = await reader.readUint64();
			let start = await reader.readUint32();
			let size = await reader.readUint32();
			let record_size = await reader.readUint32();

			handles.push({
				type: type,
				record_start,
				record_size,
				start,
				size
			});
		}

		assert.equal(reader.pos(), innerStart + len);

		// Each handle ends with 4 bytes that are usually 0 but i'm not sure what they do
		reader.skip(4);
	}

	// Making sure we consumed the right number of bytes
	assert.equal(reader.pos(), start + size);

	return handles;
}

// Reads a file entry that must start at the given position and end before some other position
export async function ReadFileEntry(reader: Reader): Promise<FileEntry> {

	let start = reader.pos();

	// Each file starts with some type of prefix. This is a uint32 defining the length of the prefix followed by the actual prefix data
	let prefixSize = await reader.readUint32();

	reader.skip(prefixSize);

	// Next is the size of the entire entry (inclusive of all entries inside of it and inclusive of these 4 bytes)  
	let restSize = await reader.readUint32();
	// Jumping to this offset could be used for skipping this file/directory in the fs tree
	let extent = reader.pos() - 4 + restSize;

	// Number of extra bytes at the end of this entry which we don't know the purpose of yet
	//let trailerSize = data.readUInt32LE(pos); pos += 4;

	// Peeking ahead 5 bytes
	reader.skip(4);
	let someMagicByte = await reader.readUint8();
	reader.skip(-5);

	if(someMagicByte === 0x40) {
		// XXX: Only seems to occur for the first block

		reader.skip(10);

		let stringSize = await reader.readUint16();

		reader.skip(6); // TODO: 0x06 is also right before the 0x40 we observed above

		reader.skip(stringSize*2);

		reader.skip(4); // Unknown 32bit number?
	}
	else {
		reader.skip(8);
	}

	// The length after the current position to the end of the filename
	// This can be useful for skipping decoding of the filename
	let firstPartSize = await reader.readUint16();
	let afterFileName = reader.pos() + firstPartSize;

	// Length of the filename in number of characters
	let filenameSize = await reader.readUint16();
	
	// Unknown 16bit field
	reader.skip(2);

	// 128 for folders, otherwise this is 0 for regular files
	let fileType = await reader.readUint8();

	let isDirectory = fileType === FileType.Directory || fileType === FileType.Root;
	let isFile = fileType === FileType.Regular;
	if(!isFile && !isDirectory) {
		// TODO: In this case, we should just skip the file entirely instead of guessing the struct sizes
		console.warn('Unknown file type:', fileType);
	}

	reader.skip(3);

	// Decompressed size in bytes for regular files
	let fileSize = await reader.readUint64();
	
	reader.skip(8);

	let mtime = await reader.readUint64();
	let atime = await reader.readUint64();

	// Usually this is 4 0xFF byte
	reader.skip(4);

	// TODO: Currently this assumes that no rune ever takes up more than 2 bytes
	let filename = await reader.readStringU16(filenameSize);
	
	assert.equal(afterFileName, reader.pos())

	// TODO: The number 27 bytes after the file name gets incremented with each dirent?

	let numEntries = -1;
	if(isDirectory) {

		reader.skip(45);
		numEntries = await reader.readUint32();
		reader.skip(-1*(45 + 4)); // Back to start

		if(fileType === FileType.Root) {
			reader.skip(41);
		}
		else {
			reader.skip(85);
		}
	}
	else if(isFile) {
		reader.skip(35);
	}


	let handlesSize = await reader.readUint32();
	let handles: BoxHandle[] = [];
	if(isFile) {
		// TODO: Some directories should be able to have boxes too right? (for attributes)
		handles = await readBoxHandles(reader, handlesSize);
	}
	else {
		reader.skip(handlesSize);
	}

	// TODO: Sometimes there is extra data after the references
	// - sometimes there is none, other times there are 4 FF End-Of-Entry bytes, sometimes 

	// Skip 4 FF bytes (end of entry indicator)
	// NOTE: These are sometimes not included
	// TODO: Verify that we got the right bytes
	await reader.skip(4);

	let end = isFile? extent : reader.pos();

	// Make sure we are at the very end of the current entry
	reader.seek(end);

	let baseEntry: AbstractFileEntry = {
		start, end, extent,
		name: filename,
		size: fileSize,
		atime: new Date(atime),
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


