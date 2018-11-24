import fs from 'fs-extra';
import Volume, { VolumeVersion } from './volume';
import Slice from './slice';
import { ParseMacVolumeMetaFile } from './mac/meta';
import MacVolume from './mac/volume';
import path from 'path';
import { FileReader } from './reader';
import { BoxType } from './mac/box';
import MacSlice from './mac/slice';
import { Windows2015Volume } from './win/volume';
import WindowsSlice from './win/slice';

let WINDOWS_FILE_REGEX = /^(.*)_(full|inc|[a-z]+)_b([0-9]+)_s([0-9]+)_v([0-9]+)\.tib$/;

type BackupStrategy = 'full'|'inc';

interface WinFilenameDesc {
	name: string;
	type: BackupStrategy;
	backupNum: number;
	sliceNum: number;
	volumeNum: number;
}

function parseWinFilename(fname: string): WinFilenameDesc|null {
	let m = WINDOWS_FILE_REGEX.exec(fname);
	if(!m) {
		return null;
	}

	return {
		name: m[1],
		type: m[2] as BackupStrategy,
		backupNum: parseInt(m[3]),
		sliceNum: parseInt(m[4]),
		volumeNum: parseInt(m[5])
	};
}


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

		// TODO: Ensure proper checksum in all file headers and run the whole verification process consistently

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

			arch.name = path.basename(fileName, '.tib');
			arch.volumes = [macVolume];
			
			arch.slices = [];

			for(let b of meta.boxes) {
				if(b.type === BoxType.MetaData) {
					let s = new MacSlice();
					s.box = b;
					s.volumes = [macVolume];
					s.parent = arch.slices[arch.slices.length - 1] || null;
					arch.slices.push(s);
				}
			}

		}
		else if(initialVolume.header.version === VolumeVersion.Windows) {

			// TODO: This could be a lot more robust to improper filenames as we have plenty of data that is checksummed in the volume headers to completely reconstruct the slice/backup indexes

			let desc = parseWinFilename(path.basename(fileName));
			if(!desc) {
				throw new Error('Invalid filename format: ' + fileName);
			}

			arch.name = desc.name;


			let parts: Array<{ desc: WinFilenameDesc; volume: Windows2015Volume }> = [];
			parts.push({
				volume: initialVolume as Windows2015Volume,
				desc
			});

			// First we will retrieve all volumes based on filenames
			let allFiles = await fs.readdir(arch.dir);
			for(let fname of allFiles) {

				// Skip the initial volume 
				if(fname === path.basename(fileName)) {
					continue;
				}

				let d = parseWinFilename(fname);
				if(!d) {
					continue;
				}

				// Ensure part of same archive
				// NOTE: Acronis allows different ones to have the same 'name' by incrementing the backupNum in the filenames
				if(d.name !== desc.name || d.backupNum !== desc.backupNum) {
					continue;
				}

				let v = await Volume.Open(path.join(arch.dir, fname));
				if(v.header.version !== VolumeVersion.Windows) {
					throw new Error('Expected file ' + fname + ' to be a windows archive');
				}

				parts.push({
					desc: d,
					volume: v as Windows2015Volume
				});
			}


			// Sort them
			parts.sort((a, b) => {
				return a.volume.header.sequence - b.volume.header.sequence;
			});

			// Double check general sequencing stuff
			for(var i = 0; i < parts.length; i++) {
				if(parts[i].volume.header.sequence !== i + 1) {
					throw new Error('Invalid sequence chain');
				}

				if(!parts[i].volume.header.archiveKey.equals(initialVolume.header.archiveKey)) {
					throw new Error('Mismatching archive keys');
				}
			}


			let slices: WindowsSlice[] = [];

			// TODO: Eventually support missing slices a long as have at least one full slice that we can base all the sequential incremental slices in the chain on

			// Read out slices
			for(var i = 0; i < parts.length; i++) {
				let vols: Windows2015Volume[] = [];
				
				let j = i;
				for(; j < parts.length; j++) {
					if(parts[j].desc.sliceNum !== slices.length + 1) {
						break;
					}

					if(parts[j].desc.volumeNum !== vols.length + 1) {
						throw new Error('Gap in volume numbering');
					}

					vols.push(parts[j].volume);
				}

				if(vols.length === 0) {
					throw new Error('Gap in slice numbering');
				}

				let s = new WindowsSlice();
				s.volumes = vols;
				s.parent = slices[slices.length - 1] || null;
				slices.push(s);
			}


			// Finally grab the metadata boxes for each slice
			for(let s of slices) {
				// TODO: We can also detect which files are the end of a slice without the filenames by looking for which one has a valid footer (which combined with having valid footer offsets could be a rebost check)

				// TODO: Read footer of last volume
			}




			arch.slices = slices;
			arch.volumes = parts.map((p) => p.volume);
		}

		// TODO: Verify headers/trailers in every single volume (in terms of checksums and the fact that they match in bytes)


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

	/**
	 * Name of this archive, as it would appear in acronis upon being opened
	 */
	public name: string;

	/**
	 * Directory on disk where all the files for this archive reside
	 */
	public dir: string;

	public slices: Slice[];
	public volumes: Volume[];




}
