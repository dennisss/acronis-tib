import fs from 'fs-extra';
import { ComputeAdler32 } from './utils';


const VOLUME_MAGIC = 0xA2B924CE;


export enum VolumeVersion {
	Windows = 0,
	Mac = 1
}

export interface VolumeHeader {
	length: number; /**< Length in bytes of the header */
	version: VolumeVersion;
	sequence: number; /**< The index of the volume in the slice */
	
	archiveId: Buffer; /**< Random 4byte identifier common to all files in this volume */
	sliceId: Buffer; /**< Random 4bytes to identify this slice */
	// NOTE: This
	volumeId: Buffer; /**< Random 4bytes to identify this volume (NOTE: this is the only id I am fairly vertain about. the other two above I know are usually the same, but I am still unsure) */

	checkSumValid: boolean; /**< Whether or the checksum of the header is valid */
	
	blockSize: number;
}


type VolumneGenerator = () => Volume;
const VolumeImpls: { [v: number]: VolumneGenerator } = {};


export default abstract class Volume {
	/**
	 * Given a .tib file, this will open it and load basic information on it
	 */
	public static async Open(fileName: string) {
		let fd = await fs.open(fileName, 'r');

		let header: VolumeHeader;
		try {
			header = await this.LoadHeader(fd);
		}
		catch(e) {
			// TODO: It is annoying that this is redundant with the volume's close() function 
			await fs.close(fd);

			throw e;
		}

		let Gen = VolumeImpls[header.version];
		if(!Gen) {
			throw new Error('New implementation for volume type: ' + header.version);
		}

		var vol = Gen();
		vol.fd = fd;
		vol.header = header;

		return vol;
	}

	private static async LoadHeader(fd: number): Promise<VolumeHeader> {

		let headerBlock = Buffer.allocUnsafe(256); // < Just to be safe this is way more than the 36 bytes that the usual Mac header would take up
		await fs.read(fd, headerBlock, 0, headerBlock.length, 0);
	
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
	
		// Remove checksume from buffer for computing checksum
		headerBlock.writeUInt32LE(0, 0x18);
	
		let sumNum: number = ComputeAdler32(headerBlock.slice(0, headerLength));

		let isSumValid = sumNum === headerSum;
	
	
		// Should usually be 4096
		// NOTE: True Imae supports a max block size of 0x10000
		let blockSize = headerBlock.readUInt32LE(0x1c);
	
		return {
			length: headerLength,
			version: version,
			archiveId: identifiers.slice(0, 4),
			sliceId: identifiers.slice(4, 8),
			volumeId: identifiers.slice(8, 12),
			sequence: sequence,
			checkSumValid: isSumValid,
			blockSize: blockSize
		};
	}

	/**
	 * NOTE: Don't use this externally. This is mainly for internal usage
	 */
	public static _AddType(v: VolumeVersion, fn: VolumneGenerator) {
		if(VolumeImpls[v]) {
			throw new Error('Duplicate implementation of volume type: ' + v);
		}

		VolumeImpls[v] = fn;
	}


	public header: VolumeHeader;

	protected constructor() {}

	async close() {
		await fs.close(this.fd);
	}

	protected fd: number;



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
			if(this.header.length !== 0x24 || this.header.blockSize !== 4096) {
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
