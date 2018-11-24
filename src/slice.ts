import Volume from './volume';

/**
 * NOTE: Each version of the format will have a subclass of this that caches volume specific details on the slice
 */
abstract class Slice {

	public abstract get id(): Buffer;
	public abstract get creationTime(): Date;
	public parent: Slice|null;
	public volumes: Volume[];

	// TODO: We should also get data like task-ids, computer ids, compression levels, etc.
}

export default Slice;


