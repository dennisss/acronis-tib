import fs from 'fs-extra';
import Volume, { VolumeVersion } from './volume';
import Slice from './slice';
import { ParseMacVolumeMetaFile } from './mac/meta';
import MacVolume from './mac/volume';
import path from 'path';
import { FileReader } from './reader';

/**
 * 
 */
export default class Archive {

	/**
	 * Opens an archive given the name of any file in the archive
	 */
	static async Open(fileName: string): Promise<Archive> {

		// TODO: Also extract the archive name from the filename?
		let arch = new Archive(path.dirname(fileName));

		// Normalize in case the name of a Mac metadata file was given
		fileName = fileName.replace(/\.tib\.metadata$/, '.tib');

		if(!(await fs.existsSync(fileName))) {
			throw new Error('Missing volume file');
		}

		// TODO: Don't forget to close this if any errors occur
		let initialVolume = await Volume.Open(fileName);

		if(initialVolume.header.version === VolumeVersion.Mac) {

			let macVolume = initialVolume as MacVolume;

			// In this mode, we will have multiple slices represented by a single volume 
			let metaFileName = fileName + '.metadata';

			if(!(await fs.existsSync(metaFileName))) {
				throw new Error('Missing metafile');
			}

			let reader = await FileReader.Create(metaFileName); // TODO: Close this on failures (and after we are done parsing it entirely)

			let meta = await ParseMacVolumeMetaFile(reader);

			await reader.close();

			macVolume.metaFile = meta;

			arch.volumes = [macVolume];
			
			// TODO: Now reason about slices

		}
		else if(initialVolume.header.version === VolumeVersion.Windows) {

			// Need to find all other files for this archive as well in the current folder (matching on the identifiers in the header)

			arch.volumes = [initialVolume];


		}


		return arch;
	}

	async close() {
		for(let v of this.volumes) {
			await v.close();
		}
	}

	private constructor(directory: string) {
		this.dir = directory;
	} 

	dir: string;

	volumes: Volume[];
	slices: Slice[];




}
