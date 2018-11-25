import { ReadCompressedStream } from '../compression';
import assert from 'assert';
import { Reader } from '../reader';


// This seems to always be the first 8 bytes of RecordIndexes
const RECORD_INDEX_MAGIC = Buffer.from('0102001001000000', 'hex');

export enum RecordType {
	Config = 101, /**< Contains xml configuration data key-value pairs */
	FirstFileMetaRecord = 102, /**< I don't know what this record contains but it is referenced by a single FileEntry and is followed by the rest fo the relevant  */
	FileMetaA = 1, /**< Typically will follow the FirstFileMetaRecord */
	FileMetaB = 2, /**< Typically will follow the FileMetaA */
	FileMetaC = 5, /**< Typically will follow the FileMetaB */
	Listing = 103, /**< Contains a list of all files/directories in the archive */
	EndTrailer = 104, /**< Indicates the start of the end index that is referenced by the footer and holds a summary of where the important metadata blocks are located in the list (this means nothing else meaninful is left in the file. Generally we don't need to parse this if we are going forward as this should have been referenced already if we had loaded the footer of the file) */
	RecordIndex = 108, /**< For regular files, this contains the index of where each record holding data for it is located */
	Blob = 109, /**< Contains file data */
	BlobSuffix = 110, /**< This is inserted after every single blob for a file has been written (usually empty but may contain metadata?) */
}

// Everything we have no serious parser for yet
const UnparsedRecordTypes: UnparsedRecordTypesType[] = [
	RecordType.FirstFileMetaRecord,
	RecordType.FileMetaA, RecordType.FileMetaB, RecordType.FileMetaC,
	RecordType.BlobSuffix
];

export { UnparsedRecordTypes };

// The above array in typescript form
type UnparsedRecordTypesType = RecordType.FirstFileMetaRecord |
RecordType.FileMetaA | RecordType.FileMetaB | RecordType.FileMetaC |
RecordType.BlobSuffix;

export interface ConfigAttribute {
	key: string;
	value: string;
}

export interface FileEntry {
	path: string;
	name: string;
	shortName: string;

	time: Date;

	fileSize: number; // NOTE: If there are zeros at the end of the file, then i think that it will clip them and assume that everything overflowing the available data is zeros
	fileSize2: number;

	metaOffset: number; /**< Offset relative to after the header of the RecordType.FirstFileMetaRecord for this entry. Reading sequential  */

}


export interface RecordHandle {
	startOffset: number; /**< Offset relative to the start of the uncompressed file at which this record stores data (should be used along with the end offset for fast seeking) */

	recordOffset: number; /**< Offset in the archive relative to the end of the header at which this record starts */

	hash: Buffer; /**< 16byte MD5 hash of the decompressed block */
}

interface OpaqueRecord {
	// Absolute file extends of this record
	start: number;
	end: number;
}

export interface ConfigRecord extends OpaqueRecord {
	type: RecordType.Config;
	attrs: ConfigAttribute[];
}

export interface IndexRecord extends OpaqueRecord {
	type: RecordType.RecordIndex;
	totalSize: number;
	handles: RecordHandle[];
}

export interface EndTrailerRecord extends OpaqueRecord {
	type: RecordType.EndTrailer;
}

export interface ListingRecord extends OpaqueRecord {
	type: RecordType.Listing;
	files: FileEntry[];
}

export interface UnparsedRecord extends OpaqueRecord {
	type: UnparsedRecordTypesType;
}

export interface BlobRecord extends OpaqueRecord {
	type: RecordType.Blob;
	data: Buffer;
}

export type Record = ConfigRecord | IndexRecord | EndTrailerRecord | ListingRecord | BlobRecord | UnparsedRecord;


/**
 * Read all records in a stream until we hit the end of that stream or we hit the end marker
 */
export async function ReadAllRecords(reader: Reader): Promise<Record[]> {
	let recs: Record[] = []
	let size = await reader.length();

	while(reader.pos() < size) {
		let rec = await ReadRecord(reader);
		recs.push(rec);
		if(rec.type === RecordType.EndTrailer) {
			break;
		}
	}

	return recs;
}

export async function ReadRecord(reader: Reader): Promise<Record> {

	let start = reader.pos();

	let type = await reader.readUint8();

	let data: Buffer;

	if(type === RecordType.EndTrailer) {
		return {
			start,
			end: reader.pos(),
			type
		};
	}
	// Zlib stream encoded
	if(type === RecordType.Blob || type === RecordType.BlobSuffix || type === RecordType.RecordIndex) {
		data = await ReadCompressedStream(reader, -1);
	}
	// Raw deflate encoded
	else if(type === RecordType.Config || type === RecordType.FirstFileMetaRecord || type === RecordType.Listing || type === RecordType.FileMetaA || type === RecordType.FileMetaB || type === RecordType.FileMetaC) {
		data = await ReadCompressedStream(reader, -1, true);

		/*
		let targetSum = ComputeAdler32(buf);
		let checkSum = await reader.readUint32();

		console.log(targetSum, checkSum);
		*/

		// 4 byte checksum of something?
		reader.skip(4);
	}
	else {
		// NOTE: We currently don't know of any record types that aren't compressed 
		throw new Error('Unknown item type');
	}


	let dataPos = 0;

	function readU16(len: number) {
		let str = data.slice(dataPos, dataPos + (len*2)).toString('utf16le');
		dataPos += len*2;
		return str;	
	}

	if(type === RecordType.Blob) {
		return {
			start, end: reader.pos(),
			type,
			data
		};
	}
	else if(type === RecordType.Config) {

		// XXX: No idea yet what the first 169 bytes do
		dataPos = 165;

		// TODO: Double check that we read exactly this many
		let numAttribs = data.readUInt32LE(dataPos); dataPos += 4;

		let attrs: ConfigAttribute[] = [];

		// NOTE: Usually there seems to be one extra byte at the end all the time
		while(dataPos < data.length - 1) {
			let keyLength = data.readUInt32LE(dataPos); dataPos += 4;
			let key = readU16(keyLength);

			let valLength = data.readUInt32LE(dataPos); dataPos += 4;
			let val = readU16(valLength);// NOTE: the first 2 bytes of this buffer are usually the 0xfffe byte order marker

			attrs.push({
				key: key,
				value: val
			});
		}

		// TODO: What is the last byte for?
		assert.strictEqual(dataPos + 1, data.length);

		assert.strictEqual(attrs.length, numAttribs);

		return {
			start, end: reader.pos(),
			type,
			attrs,
		};
	}
	else if(type === RecordType.Listing) {

		dataPos = 0;


		let numEntries = data.readUInt32LE(dataPos); dataPos += 4;

		let files: FileEntry[] = [];

		while(dataPos < data.length) {

			let pathLength = data.readUInt32LE(dataPos); dataPos += 4;
			let path = readU16(pathLength);

			// Some uint32
			dataPos += 4;

			let nameLength = data.readUInt32LE(dataPos); dataPos += 4;
			let name = readU16(nameLength);

			let shortNameLength = data.readUInt32LE(dataPos); dataPos += 4;
			let shortName = readU16(shortNameLength);

			let timeRaw = data.readUIntLE(dataPos, 6); dataPos += 8;
			let time = new Date(timeRaw);

			dataPos += 4;


			// TODO: What is the difference between these?
			let fileSize = data.readUIntLE(dataPos, 6); dataPos += 8;
			let fileSize2 = data.readUIntLE(dataPos, 6); dataPos += 8;

			let metaOffset = data.readUIntLE(dataPos, 6); dataPos += 8;


			dataPos += 38;


			let entry: FileEntry = {
				path,
				name,
				shortName,
				time,
				fileSize,
				fileSize2,
				metaOffset
			};

			files.push(entry);
		}

		assert.strictEqual(files.length, numEntries);
		assert.strictEqual(dataPos, data.length);

		return {
			start, end: reader.pos(),
			type,
			files
		};
	}
	else if(type === RecordType.RecordIndex) {

		dataPos = 0;

		assert(RECORD_INDEX_MAGIC.equals(data.slice(0, 8)), 'Bad record index magic');
		dataPos += 8;

		// Uncompressed of all data records in this index (should be the same as the file size)
		let totalSize = data.readUIntLE(dataPos, 6); dataPos += 8;

		let numHandles = data.readUInt32LE(dataPos); dataPos += 4;

		let handles: RecordHandle[] = [];

		for(var i = 0; i < numHandles; i++) {

			let startOffset = data.readUIntLE(dataPos, 6); dataPos += 8;
			let recordOffset = data.readUIntLE(dataPos, 6); dataPos += 8;
			let hash = data.slice(dataPos, dataPos + 16); dataPos += 16;				

			let handle: RecordHandle = {
				startOffset,
				recordOffset,
				hash
			};

			handles.push(handle);
		}

		// TODO: There are usually 204 bytes after the handles which still don't have any known meaning
		// ^ Last 24 bytes of these are always the exact same as the first 24 bytes of the index
		// The rest of the bytes before these seem to always be constant across indexes in the same archive at the least

		return {
			start, end: reader.pos(),
			type,
			handles,
			totalSize
		};
	}
	// TODO: Annoyingly this doesn't reduce the type of 'type' so we can't type check that we have all members of the RecordType enum handled
	else if(UnparsedRecordTypes.indexOf(type as UnparsedRecordTypesType) >= 0) {
		return {
			start, end: reader.pos(),
			type: type as UnparsedRecordTypesType
		};
	}

	throw new Error('Unknown record type: ' + type);

}


