import fs from 'fs-extra';
import Volume, { VolumeVersion } from './volume';
import Slice from './slice';


type ArchiveGenerator = (initialVolume: Volume) => Promise<Archive>;
const ArchiveImpls: { [v: number]: ArchiveGenerator } = {};


/**
 * 
 */
export default abstract class Archive {

	/**
	 * Opens an archive given the name of any file in the archive
	 */
	static async Open(fileName: string): Promise<Archive> {

		// Normalize in case the name of a Mac metadata file was given
		fileName = fileName.replace(/\.tib\.metadata$/, '.tib');

		if(!(await fs.existsSync(fileName))) {
			throw new Error('Missing volume file');
		}

		// TODO: Don't forget to close this if any errors occur
		let initialVolume = await Volume.Open(fileName);


		let Gen = ArchiveImpls[initialVolume.header.version];
		if(!Gen) {
			throw new Error('No implementation for volume type: ' + initialVolume.header.version);
		}

		// TODO: Ensure proper checksum in all file headers and run the whole verification process consistently
		// TODO: Verify headers/trailers in every single volume (in terms of checksums and the fact that they match in bytes)


		try {
			var arch = await Gen(initialVolume);
		}
		finally {
			await initialVolume.close();
		}

		return arch;
	}

	public static AddType(v: VolumeVersion, fn: ArchiveGenerator) {
		if(ArchiveImpls[v]) {
			throw new Error('Duplicate implementation of archive type: ' + v);
		}

		ArchiveImpls[v] = fn;
	}


	async close() {
		for(let v of this.volumes) {
			await v.close();
		}

		for(let s of this.slices) {
			await s.close();
		}
	}

	protected constructor(name: string, slices: Slice[], volumes: Volume[]) {
		this.name = name;
		this.slices = slices;
		this.volumes = volumes;
		//this.dir = directory;
	} 

	/**
	 * Name of this archive, as it would appear in acronis upon being opened
	 */
	public name: string;

	/**
	 * Directory on disk where all the files for this archive reside
	 */
	//public dir: string;

	public slices: Slice[];
	public volumes: Volume[];




}
