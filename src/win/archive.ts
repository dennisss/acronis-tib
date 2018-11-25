import fs from 'fs-extra';
import Archive from '../archive';
import { VolumeVersion } from '../volume';
import Volume from '../volume';
import path from 'path';
import { Windows2015Volume } from './volume';
import Slice from '../slice';
import WindowsSlice from './slice';


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

export default class WindowsArchive extends Archive {

	static async OpenImpl(initialVolume: Volume) {
		if(!(initialVolume instanceof Windows2015Volume)) {
			throw new Error('Called with wrong volume type');
		}

		// TODO: This could be a lot more robust to improper filenames as we have plenty of data that is checksummed in the volume headers to completely reconstruct the slice/backup indexes

		let desc = parseWinFilename(path.basename(initialVolume.fileName));
		if(!desc) {
			throw new Error('Invalid filename format: ' + initialVolume.fileName);
		}

		let name = desc.name;
		let dir = path.dirname(initialVolume.fileName);


		let parts: Array<{ desc: WinFilenameDesc; volume: Windows2015Volume }> = [];
		parts.push({
			volume: initialVolume as Windows2015Volume,
			desc
		});

		// First we will retrieve all volumes based on filenames
		let allFiles = await fs.readdir(dir);
		for(let fname of allFiles) {

			// Skip the initial volume 
			if(fname === path.basename(initialVolume.fileName)) {
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

			let v = await Volume.Open(path.join(dir, fname));
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

			let s = await WindowsSlice.Open(vols, slices[slices.length - 1] || null);
			slices.push(s);
		}


		return new WindowsArchive(
			name, slices, parts.map((p) => p.volume)
		);
	}

	constructor(name: string, slices: Slice[], volumes: Volume[]) {
		super(name, slices, volumes);
	}



}

Archive.AddType(VolumeVersion.Windows, WindowsArchive.OpenImpl);
