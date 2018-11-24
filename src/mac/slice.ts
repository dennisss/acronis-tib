import Slice from '../slice';
import { MetaDataBox } from './box';


export default class MacSlice extends Slice {
	
	// A reference to the box for this slice
	box: MetaDataBox;

	public get creationTime() {
		return this.box.sliceCreationTime;
	}

	public get id() {
		return this.box.sliceId;
	}

}
