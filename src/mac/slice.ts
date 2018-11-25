import Slice from '../slice';
import { MetaDataBox } from './box';
import MacVolume from './volume';
import { SliceConfig } from '../slice';


export default class MacSlice extends Slice {
	
	// A reference to the box for this slice
	box: MetaDataBox;
	config: SliceConfig;

	public constructor(volumes: MacVolume[], parent: MacSlice|null, box: MetaDataBox) {
		super(volumes, parent);
		this.box = box;
	}

	public get creationTime() {
		return this.box.sliceCreationTime;
	}

	public get id() {
		return this.box.sliceId;
	}

	public async close() {

	}

}
