import fs from 'fs-extra';
import Archive from '../archive';
import Volume, { VolumeVersion } from '../volume';
import MacVolume from './volume';
import { MacVolumeMetaFile, ParseMacVolumeMetaFile } from './meta';
import { FileReader } from '../reader';
import Slice from '../slice';
import MacSlice from './slice';
import { BoxType } from './box';
import path from 'path';
import { ParseConfigXML } from './config';


export class MacArchive extends Archive {

	static async OpenImpl(initialVolume: Volume) {
		if(!(initialVolume instanceof MacVolume)) {
			throw new Error('Called with wrong volume type');
		}


		// In this mode, we will have multiple slices represented by a single volume 
		let metaFileName = initialVolume.fileName + '.metadata';

		if(!(await fs.existsSync(metaFileName))) {
			throw new Error('Missing metafile');
		}

		let reader = await FileReader.Create(metaFileName); // TODO: Close this on failures (and after we are done parsing it entirely)

		let meta = await ParseMacVolumeMetaFile(reader);

		await reader.close();


		
		let name = path.basename(initialVolume.fileName, '.tib');
		let volumes = [initialVolume];
		
		let slices: MacSlice[] = [];

		for(let b of meta.boxes) {
			if(b.type === BoxType.MetaData) {
				let s = new MacSlice(
					[initialVolume],
					slices[slices.length - 1] || null,
					b
				);

				let cfg = await ParseConfigXML(b.xml);
				s.config = cfg;
				
				slices.push(s);
			}
		}

		return new MacArchive(
			name, volumes, slices, meta
		);
	}


	public metaFile: MacVolumeMetaFile;

	constructor(name: string, volumes: Volume[], slices: Slice[], meta: MacVolumeMetaFile) {
		super(name, slices, volumes);
		this.metaFile = meta;
	}

}

Archive.AddType(VolumeVersion.Mac, MacArchive.OpenImpl);
