import Slice from '../slice';
import { ListingRecord } from './record';


// TODO: windows slices will need to store the type 'inc'/'full'


export default class WindowsSlice extends Slice {

	listing: ListingRecord;

	get id() {
		// TODO
		return Buffer.from([]);
	}

	get creationTime() {
		// TODO
		return new Date()
	}

}