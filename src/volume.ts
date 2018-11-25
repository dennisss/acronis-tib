import { ComputeAdler32 } from './utils';
import { Reader, FileReader } from './reader';


const VOLUME_MAGIC = 0xA2B924CE;


export enum VolumeVersion {
	Windows = 0,
	Mac = 1
}

export interface VolumeHeader {
	rawBytes: Buffer; 

	length: number; /**< Length in bytes of the header */
	version: VolumeVersion;
	sequence: number; /**< Index of this file in the archive. Incremented every single time a new file is created whether it be a volume, slice, etc. These provide a total ordering of alla files in an archive */
	
	// NOTE: I don't call these identifiers, because TI has separate 16-byte UUIDs stored in the files to be the identifiers
	archiveKey: Buffer; /**< Random 4byte identifier common to all files in this volume */
	sliceKey: Buffer; /**< Random 4bytes to identify this slice */
	volumeKey: Buffer; /**< Random 4bytes to identify this volume */

	checkSumValid: boolean; /**< Whether or the checksum of the header is valid */
	
	blockSize: number;
}


type VolumeGenerator = (fileName: string, reader: Reader, header: VolumeHeader) => Promise<Volume>;
const VolumeImpls: { [v: number]: VolumeGenerator } = {};


export default abstract class Volume {
	/**
	 * Given a .tib file, this will open it and load basic information on it
	 */
	public static async Open(fileName: string) {
		let reader = await FileReader.Create(fileName);

		let header: VolumeHeader;
		try {
			header = await this.LoadHeader(reader);
		}
		catch(e) {
			// TODO: It is annoying that this is redundant with the volume's close() function 
			await reader.close();

			throw e;
		}

		let Gen = VolumeImpls[header.version];
		if(!Gen) {
			throw new Error('No implementation for volume type: ' + header.version);
		}

		var vol = await Gen(fileName, reader, header);

		if(!vol.validateHeader()) {
			console.warn('Volume contains suspicious header')
		}

		return vol;
	}

	private static async LoadHeader(reader: Reader): Promise<VolumeHeader> {

		reader.seek(0);

		let headerBlock = Buffer.from(await reader.readBytes(64));// < Just to be safe this is way more than the 36 bytes that the usual Mac header would take up
	
		let magic = headerBlock.readUInt32LE(0);
		if(magic !== VOLUME_MAGIC) {
			throw new Error('Wrong magic!');
		}
	
		// Should be 24 00 01 00 for Mac
		let headerLength = headerBlock.readUInt16LE(4);
		let version = headerBlock.readUInt16LE(6); // < 01 is Mac, 00 is windows?

		// I know that at offset 0x10 in the file, there are definately 4 random bytes created at the time of volume creation
		let identifiers = headerBlock.slice(8, 8 + 12);

	
		// This will start at 1 and will be incremented for every file in a backup split into multiple files (essentialyl the same as the )
		let sequence = headerBlock.readUInt32LE(20);
	
		let headerSum = headerBlock.readUInt32LE(0x18);
	
		for(let i = headerLength; i < 0x24; i++) { headerBlock[i] = 0; } // This is mainly to simulate the current version of True Image exactly
	
		// Remove checksum from buffer for computing checksum
		headerBlock.writeUInt32LE(0, 0x18);
	
		let sumNum: number = ComputeAdler32(headerBlock.slice(0, headerLength));

		// Restore the checksum so that we can store the pristine header bytes
		headerBlock.writeUInt32LE(headerSum, 0x18);

		let isSumValid = sumNum === headerSum;
	
	
		// Should usually be 4096
		// NOTE: True Imae supports a max block size of 0x10000
		let blockSize = headerBlock.readUInt32LE(0x1c);
	
		return {
			rawBytes: headerBlock.slice(0, headerLength),
			length: headerLength,
			version: version,
			archiveKey: identifiers.slice(0, 4),
			sliceKey: identifiers.slice(4, 8),
			volumeKey: identifiers.slice(8, 12),
			sequence: sequence,
			checkSumValid: isSumValid,
			blockSize: blockSize
		};
	}

	/**
	 * Registers a new implementation of a volume format
	 * 
	 * NOTE: Don't use this externally. This is mainly for internal usage
	 */
	public static AddType(v: VolumeVersion, fn: VolumeGenerator) {
		if(VolumeImpls[v]) {
			throw new Error('Duplicate implementation of volume type: ' + v);
		}

		VolumeImpls[v] = fn;
	}

	public fileName: string;
	public header: VolumeHeader;
	public reader: Reader;

	protected constructor(fileName: string, reader: Reader, header: VolumeHeader) {
		this.fileName = fileName;
		this.reader = reader;
		this.header = header;
	}

	close() {
		return this.reader.close();
	}




	/**
	 * Depending on the format version, we do expect certain values (i.e. block size, length, etc.) to be pretty predictable. This will verify that those values are what we expect them to be
	 * 
	 * NOTE: Even if you don't use this, you SHOULD STILL check that the header checksum is valid
	 * 
	 * This is essentially a soft way of sanity checking that the volume seems valid
	 * While this is not a definitive check for validitity, it is a very good sign in if returns true and we haven't seen any samples yet that would contradict these rules
	 */
	validateHeader(): boolean {
		if(!this.header.checkSumValid) {
			return false;
		}

		if(this.header.version === VolumeVersion.Mac) {
			if(this.header.length !== 0x24 || this.header.blockSize !== 4096 || this.header.sequence !== 1) {
				return false;
			}

		}
		else if(this.header.version === VolumeVersion.Windows) {
			if(this.header.length !== 0x20 || this.header.blockSize !== 32) {
				return false;
			}
		}
		else {
			// Unknown version
			return false;
		}

		return true;
	}


}
