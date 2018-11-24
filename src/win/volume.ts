import Volume, { VolumeVersion } from "../volume";
import { ReadRecord, RecordType } from './record';



interface VolumeFooter {
	isValid: boolean;
	metaDataOffset: number; /**< This will be the offset of the RecordType.Config block relative to end of the file header */
}




export class Windows2015Volume extends Volume {

	static _generator() {
		return new Windows2015Volume();
	}

	footer: VolumeFooter;

	// TODO: This is still largely a work in progress
	/**
	 * Volumes will be a footer that can be used to verify that the volume is completely written and allows for seeking directly to the metadata without needing to read the entire file
	 */
	async loadFooter() {
		let reader = this.reader.slice();

		let size = await reader.length();
		if(size < 90) {
			// Shouldn't be possible for this to be meaninfully possible
		}

		if(size % this.header.blockSize !== 0) {
			// Most likely an invalid file (did not finish being written)
		}



		reader.seek(size - 48);

		let buf = Buffer.from(await reader.readBytes(48));

		let isValid = true;

		// The end of the file should contain an exact mirror image of the header
		for(var i = 0; i < this.header.length; i++) {
			if(this.header.rawBytes[i] !== buf[buf.length - i]) {
				isValid = false;
				break;
			}
		}

		let isValidOffset = (v: number) => {
			return v >= this.header.length && v < (size - this.header.length);
		}

		// NOTE: This is a 64bit number (possibly shorter, maybe safer to only read up-to the first zero)
		let off = buf.readUIntLE(buf.length - this.header.length - 8, 6);

		// This is the absolute position of the very-very end of the file's meaningful data
		let endOfFile = off + this.header.length;
		
		
		reader.seek(endOfFile - 4);

		let lastFour = Buffer.from(await reader.readBytes(4));

		// Usually this case is for file/directory-based backups
		if(lastFour.equals(Buffer.from('2C8AE194', 'hex'))) {

			reader.seek(endOfFile - 12);

			let metaOffset = await reader.readUint64();


		}
		// For sector-by-sector backups
		else if(lastFour.equals(Buffer.from('2B8AE194', 'hex'))) {

			// TODO: Refigure this out

			reader.seek(endOfFile - 8);

			let trailerSize = await reader.readUint32();


			let startOfTrailer = endOfFile - 8 - trailerSize;

			reader.seek(startOfTrailer);

			let trailer = Buffer.from(await reader.readBytes(trailerSize));

			let pos = 0;

			// First two bytes of the trailer are always zero
			pos += 2;
			
			// Offset of the metadata entry
			let metaDataOffLen = trailer[pos]; pos += 1;
			let metaDataOff = trailer.readUIntLE(pos, metaDataOffLen); pos += metaDataOffLen;

			pos += 7;

			// This is the total fully uncompressed size of the main partition?
			let fullSizeLen = trailer[pos]; pos += 1;
			let fullSize = trailer.readUIntLE(pos, fullSizeLen); pos += fullSizeLen;

			pos += 2;

			let metaDataOff2Len = trailer[pos]; pos += 1;
			let metaDataOff2 = trailer.readUIntLE(pos, metaDataOffLen); pos += metaDataOffLen;


		}



		// For whatever reason, the value we actually want is 20 bytes after the previous value
		off += 20;

		let metaDataOffset = -1;

		// Check the offset is in the file
		// TODO: This is definately wrong
		if(isValidOffset(8) && ((off + 8) < size - this.header.length)) {

			reader.seek(off);

			let metaDataOffset = await reader.readUint64();

			if(!isValidOffset(metaDataOffset)) {
				isValid = false;
			}
		}
		else {
			isValid = false;
		}

		this.footer = {
			isValid,
			metaDataOffset
		};

		await reader.close();
	}
	

	async readAll(outputFolder: string) {

		let reader = this.reader.slice();

		let size = await reader.length();

		reader.seek(32);

		// TODO: We will need to extract this for the sake of being able to do random access
	
		while(reader.pos() < size) {

			let rec = await ReadRecord(reader);

			if(rec.type === RecordType.EndTrailer) {
				break;
			}
		}

		/*
			XXX: Need to validate that the last bytes of the file are the same as the first 32bytes of header (to validate integrity)

		*/
		

		await reader.close();
	}

}


Volume._AddType(VolumeVersion.Windows, Windows2015Volume._generator);
