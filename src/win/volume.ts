import Volume, { VolumeVersion, VolumeHeader } from "../volume";
import { ReadAllRecords } from './record';
import { Reader } from '../reader';



/**
 * Present in the last volume of a slice and describes the size of the slice it is in
 */
export interface VolumeFooter {
	isValid: boolean;
	length: number; /**< Number of bytes at the end of the file that this footer takes up */
	sliceSize: number; /**< Number of bytes in this slice (this number is counted as every byte after the headers up to the last meaninful byte in this last file) */
}




export class Windows2015Volume extends Volume {
	
	static async OpenImpl(fileName: string, reader: Reader, header: VolumeHeader) {
		return new Windows2015Volume(fileName, reader, header);
	}


	/**
	 * Offset at which data begins
	 */
	startOffset() {
		return this.header.length; // Should always be 32
	}

	async readAll(outputFolder: string) {

		let reader = this.reader.slice();

		reader.seek(this.startOffset());

		// TODO: We will need to extract this for the sake of being able to do random access
	
		let recs = await ReadAllRecords(reader);
		
		await reader.close();
	}


	async readFooter(): Promise<VolumeFooter> {

		let reader = this.reader.slice();

		let size = await reader.length();
		if(size < 90) {
			// Shouldn't be possible for this to be meaninfully possible
			console.warn('Extremely small file');
		}

		if(size % this.header.blockSize !== 0) {
			// Most likely an invalid file (did not finish being written)
			console.warn('Non-aligned file (incomplete?)')
		}


		reader.seek(size - 48);

		let buf = Buffer.from(await reader.readBytes(48));

		let isValid = true;

		// The end of the file should contain an exact mirror image of the header
		for(var i = 0; i < this.header.length; i++) {
			if(this.header.rawBytes[i] !== buf[buf.length - i - 1]) {
				isValid = false;
				break;
			}
		}

		// NOTE: This is a 64bit number (possibly shorter, maybe safer to only read up-to the first zero)
		// NOTE: This offset is relative to end of the header in the file in which it was read
		let sliceSize = buf.readUIntLE(buf.length - this.header.length - 8, 6);

		await this.reader.close();

		return {
			isValid,
			sliceSize,
			length: 48
		};
	}

}

Volume.AddType(VolumeVersion.Windows, Windows2015Volume.OpenImpl);
