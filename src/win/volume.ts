import Volume, { VolumeVersion } from "../volume";
import fs from 'fs-extra';
import path from 'path';
import { ReadCompressedStream } from '../compression';
import assert from 'assert';

/*
	TODO: For every single file/directory entry, we also see a set of 102, 1, 2, 5 records which we don't know the meaning of yet
*/

// This seems to always be the first 8 bytes of RecordIndexes
const RECORD_INDEX_MAGIC = Buffer.from('0102001001000000', 'hex');


enum RecordType {
	Config = 101, /**< Contains xml configuration data key-value pairs */
	Listing = 103, /**< Contains a list of all files/directories in the archive */
	RecordIndex = 108, /**< For regular files, this contains the index of where each record holding data for it is located */
	Blob = 109, /**< Contains file data */
	BlobTrailer = 110, /**< This is inserted after every single blob for a file has been written (usaully empty but may contain metadata?) */

	// TODO: I am currently unsure of this, but it does make sense for this to be like this (either it is an EOS indicator or an indicator for the trailer bytes for the file)
	EndOfRecords = 124
}

interface ConfigAttribute {
	key: string;
	value: string;
}

interface FileEntry {
	path: string;
	name: string;
	shortName: string;

	time: Date;

	fileSize: number; // NOTE: If there are zeros at the end of the file, then i think that it will clip them and assume that everything overflowing the available data is zeros
	fileSize2: number;

	metaOffset: number; /**< Offset relative to after the header of the '102' record type for this entry */

}


interface RecordHandle {
	startOffset: number; /**< Offset relative to the start of the uncompressed file at which this record stores data (should be used along with the end offset for fast seeking) */

	recordOffset: number; /**< Offset in the archive relative to the end of the header at which this record starts */

	hash: Buffer; /**< 16byte MD5 hash of the decompressed block */
}


export class Windows2015Volume extends Volume {

	static _generator() {
		return new Windows2015Volume();
	}


	async read(outputFolder: string) {

		let stat = await fs.fstat(this.fd);

		// First at 0x1e9d
		// Next at 0x208c
	
		let pos = 32; // 7836; //32 // 32; //7675; //32; //2309965;  //32;
	
		let buf = Buffer.allocUnsafe(128);
	
	
		while(pos < stat.size) {
			console.log('');

			let startPos = pos;

			console.log('POS', pos);
			
			fs.readSync(this.fd, buf, 0, 1, pos); pos += 1;
	
			let type = buf[0];
			console.log('TYPE', type);
		

			let data: Buffer;

			// Zlib stream encoded
			if(type === 109 || type === 110 || type === 108) {
				let res = await ReadCompressedStream(this.fd, pos, -1);
				data = res.data;
				pos += res.length;
			}
			// Raw deflate encoded
			else if(type === 101 || type === 102 || type === 103 || type === 104 || type === 1 || type === 2 || type === 5) {
				let res = await ReadCompressedStream(this.fd, pos, -1, true);
				data = res.data;
				pos += res.length;

				/*
				let targetSum = ComputeAdler32(buf);
	
				fs.readSync(file, buf, 0, 4, pos);
				let checkSum = buf.readUInt32LE(0);
	
				console.log(targetSum, checkSum);
				*/
	
				// 4 byte checksum of something?
				pos += 4;
			}
			else if(type === RecordType.EndOfRecords) {
				break;
			}
			else {
				// NOTE: We currently don't know of any record types that aren't compressed 
				throw new Error('Unknown item type');
			}


			await fs.writeFile(path.join(outputFolder, startPos.toString().padStart(8, '0') + '-' + type.toString()), data);


			let dataPos = 0;
	
			function readU16(len: number) {
				let str = data.slice(dataPos, dataPos + (len*2)).toString('utf16le');
				dataPos += len*2;
				return str;	
			}

			if(type === RecordType.Config) {

				// XXX: No idea yet what the first 169 bytes do
				dataPos = 165;

				// TODO: Double check that we read exactly this many
				let numAttribs = data.readUInt32LE(dataPos); dataPos += 4;

				let n = 0;

				// NOTE: Usually there seems to be one extra byte at the end all the time
				while(dataPos < data.length - 1) {
					let keyLength = data.readUInt32LE(dataPos); dataPos += 4;
					let key = readU16(keyLength);

					let valLength = data.readUInt32LE(dataPos); dataPos += 4;
					let val = readU16(valLength);// NOTE: the first 2 bytes of this buffer are usually the 0xfffe byte order marker


					let attr : ConfigAttribute = {
						key: key,
						value: val
					}

					console.log(++n);
					console.log(attr);
				}

			}
			else if(type === RecordType.Listing) {

				dataPos = 0;


				let numEntries = data.readUInt32LE(dataPos); dataPos += 4;

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

					console.log(entry);
				}




			}
			else if(type === RecordType.RecordIndex) {

				dataPos = 0;

				assert(RECORD_INDEX_MAGIC.equals(data.slice(0, 8)), 'Bad record index magic');
				dataPos += 8;

				// Uncompressed of all data records in this index (should be the same as the file size)
				let totalSize = data.readUIntLE(dataPos, 6); dataPos += 8;

				let numHandles = data.readUInt32LE(dataPos); dataPos += 4;

				for(var i = 0; i < numHandles; i++) {

					let startOffset = data.readUIntLE(dataPos, 6); dataPos += 8;
					let recordOffset = data.readUIntLE(dataPos, 6); dataPos += 8;
					let hash = data.slice(dataPos, dataPos + 16); dataPos += 16;				

					let handle: RecordHandle = {
						startOffset,
						recordOffset,
						hash
					};
				}


				// TODO: There are usually 204 bytes after the handles which still don't have any known meaning
				// ^ Last 24 bytes of these are always the exact same as the first 24 bytes of the index
				// The rest of the bytes before these seem to always be constant across indexes in the same archive at the least

				//console.log('END POS', dataPos, data.length);
			}

		}


	}




}


Volume._AddType(VolumeVersion.Windows, Windows2015Volume._generator);
