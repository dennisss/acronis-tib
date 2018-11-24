import zlib from 'zlib';
import { Reader, BufferBasedReader } from './reader';
import { Readable } from 'stream';

// How much compressed data to read at a time
// NOTE: We currently don't support well-limiting the output block size for the stream reader implementation so we want to keep this conservative in case a 100 to 1 compression ratio doesn't pop up and eat all of our memory
const BUFFER_SIZE = 4096;



function getInflaterErrorHandler(inflater: zlib.Inflate|zlib.InflateRaw): { promise: Promise<{}>; cleanup: () => void } {

	let cleanup: (() => void)|undefined = undefined;

	let p = new Promise((res, rej) => {

		function onError(err: Error) {
			// TODO: Verify that this works
			// Generally, if the stream is incomplete, then hopefully this will error out
			rej('Zlib Error: ' + err);
		}

		inflater.on('error', onError);

		// TODO: This is no longer applicable if we never call .end() on the stream?
		function onEnd() {
			res();
		}

		inflater.on('end', onEnd);

		cleanup = () => {
			inflater.removeListener('error', onError);
			inflater.removeListener('end', onEnd);
		};
	});

	if(!cleanup) {
		throw new Error('Non-synchronous promise starter');		
	}

	return {
		promise: p,
		cleanup: cleanup
	}
}


// TODO: End could realistically be implemented as a slice on a regular reader
/**
 * Reads a zlib/raw deflate stream from a file
 * 
 * On completion the reader will be seeked to immediately after the stream
 * 
 * TODO: Eventually this should output a stream instead of a buffer
 * TODO: Make the 'end' parameter imply a limit rather than an ended position and throw an error if the parsed length doesn't match a well-known given length
 * 
 * @param reader
 * @param length size of the stream. if not given or -1, then we will read until the end of the stream
 * @param raw if true, then a raw deflate stream will be read instead of a full header'ed and checksumed zlib stream
 */
export async function ReadCompressedStream(reader: Reader, length: number, raw = false): Promise<Buffer> {

	let start = reader.pos();

	let decompressed = Buffer.from([]); // TODO: Need a smarter auto-resizing thing if we want to keep it in memory

	let inflater = raw? zlib.createInflateRaw() : zlib.createInflate();


	// NOTE: When we switch this to incrementally reading from the file, it is also possible to detect the end of the stream by constantly flushing the stream on each write and seeing if all of the given bytes were consumed

	// TODO: Should we also bind the 'close' event?

	inflater.on('data', (data) => {
		decompressed = Buffer.concat([ decompressed, data ]);
	});

	let { promise: errorPromise, cleanup: cleanupErrorHandler } = getInflaterErrorHandler(inflater);

	let size = await reader.length();

	await Promise.race([
		errorPromise,
		(async () => {
			if(length > 0) {
				// TODO: Eventually just read one block at a time (aka implementing in terms of the below mode isntead)
				let buffer = Buffer.from(await reader.readBytes(length));

				inflater.write(buffer);
				inflater.end();

				// Wait for the 'end' event
				await new Promise(() => {});
			}
			else {

				while(true) {
					let n = Math.min( size - reader.pos(), BUFFER_SIZE );

					if(n === 0) {
						throw new Error('Hit end of reader before end of compressed');
					}

					let buffer = Buffer.from(await reader.readBytes(n));
			
					inflater.write(buffer);
			
					await new Promise((res) => {
						inflater.flush(zlib.constants.Z_FULL_FLUSH, res);
					});
				
					// TODO: This is a really hacked together way to detect Z_STREAM_END. Annoyingly, node.js doesn't seem to expose that return code in any of the calls
					let nwritten = reader.pos() - start;
					if(inflater.bytesRead < nwritten) {
						break;
					}
				}
			}
		})()
	]);

	// Cleanup
	cleanupErrorHandler();
	await new Promise((res) => {
		inflater.close(res);
	});

	// Go back to the end of the stream if we ran over it
	reader.seek(start + inflater.bytesRead);

	return decompressed;
}

/**
 * An incremental reader for reading from a zlib stream without all the usual inconveniences
 * 
 * NOTE: This assumes that the base reader has a computable length
 * NOTE: This does NOT seek the original reader given (a slice is owned by this reader)
 * 
 * Generally, seeking backwards is not advisable and obtaining the length of the reader before the end is read will fail
 * 
 * Internally this will maintain up to 2 block buffers such that the last block is reverse seekable, so short distance reverse reads are fine, but random access is going to kill performance.
 */
/*
export class CompressedReader extends BufferBasedReader {

	// Current position in decompressed data
	private _pos: number = 0;

	// Raw access to the compressed data. Stream starts at offset 0
	private _reader: Reader

	private _inflater: zlib.Inflate|zlib.InflateRaw;

	private _buffersStart: number; // Uncompressed position of the first buffer
	private _buffersEnd: number; // Uncompressed offset of the end of the last buffer
	private _buffers: Buffer[];

	constructor(reader: Reader, raw?: boolean) {
		super();
		this._reader = reader.slice(reader.pos());
		this._inflater = raw? zlib.createInflateRaw() : zlib.createInflate();

		this._inflater.on('data', (chunk: Buffer) => {
			// TODO: Do not include anything way before our current cursor

			this._buffers.push(chunk);
			this._buffersEnd += chunk.byteLength;
		});
	}

	seek(pos: number) {
		this._pos = pos;
	}

	pos() {
		return this._pos;
	}

	async length() {
		// Realistically we will only implement this for the case of after the entire stream is read till completion (or we could make this dynamic and always returning a higher value until everything is read)
		throw new Error('Unimplemented');
		return 0;
	}

	async close() {
		
		await new Promise((res) => this._inflater.close(res));
		await this._reader.close();
	}


	async readBufferBytes(count: number) {

		let endTarget = this._pos + count;


		// TODO: Double check that we are not seeking backwards


		// Read until we can fulfill the request
		if(this._buffersEnd < endTarget) {

			let { promise: errorPromise, cleanup: cleanupErrorHandler } = getInflaterErrorHandler(this._inflater);

			let size = await this._reader.length();

			// TODO: Gracefully handle the end of the stream
			while(this._buffersEnd < endTarget) {
				if(this._inflater.bytesRead < this._reader.pos()) {
					throw new Error('Hit end of stream before end of reader');
				}

				let n = Math.min(BUFFER_SIZE, size - this._reader.pos());
				if(n === 0) {
					throw new Error('Hit end of reader before end of stream')
				}

				let data = Buffer.from(await this._reader.readBytes(BUFFER_SIZE));
				this._inflater.write(data);

				await Promise.race([
					errorPromise,
					new Promise((res) => {
						this._inflater.flush(zlib.constants.Z_FULL_FLUSH, res);
					})
				]);
			}

			cleanupErrorHandler();
		}

		// Get everything needed to field the request
		// NOTE: We do need to copy the data to keep the internal cache clean from modifications made by the caller
		
		let pos = this._buffersStart;
		for(let b of this._buffers) {
			if(pos <= this._pos, )

			pos += b.byteLength;
		}


		// Easier to satisfy as much as 


		// Step 1: Look at existing buffers

		// Step 2: Uncork the inflater and flush until we get enough information

		// Step 1 is to 

		// Current issue being that a small read from the file can result in explosions in decompressed sizes for stuff like long segments of zeros

		// TODO: Will need to deal with cleaning up (as long as we don't clean up over the amount we need to return)

	}










}

*/

