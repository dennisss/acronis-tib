import Volume from './volume';


export interface ProductInfo {
	name: string;
	version: {
		major: number;
		minor: number;
	}
	build_number: number;
}


export interface SliceConfig {
	machine_id?: string; /**< Known in windows as a 'computer_id' */

	// Mainly present on Mac backups
	includePaths?: string[];
	excludePaths?: string[];

	// Mainly present on Windows backups
	productinfo?: ProductInfo;
	task_id?: string;
	compression?: string; /**< NOTE: A missing value will be present on Mac implying compression is present but not configurable */
	encryption?: string;
}


/**
 * NOTE: Each version of the format will have a subclass of this that caches volume specific details on the slice
 */
abstract class Slice {

	public parent: Slice|null;
	public volumes: Volume[];
	
	public abstract get id(): Buffer;
	public abstract get creationTime(): Date;

	// TODO: We also want to verify that the xml configuration description matches the sniffed settings (in terms of include paths, compression, and encryption which must all be known before we could ever read the xml)
	public abstract get config(): SliceConfig;

	protected constructor(volumes: Volume[], parent: Slice|null) {
		this.volumes = volumes;
		this.parent = parent;
	}

	public abstract close() : Promise<void>;


	// TODO: Also sufficient methods to abstract away FUSE

	// TODO: Possibly also a method of getting back the path delimiter
}

export default Slice;


