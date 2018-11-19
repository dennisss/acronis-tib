import fs from 'fs';
import zlib from 'zlib';

const BUFFER_SIZE = 4096; // The increment for reading from the file


interface CompressedStreamResult {
	data: Buffer; /**< Decompressed data */
	length: number; /**< Length of the compressed stream (number of bytes consumed in raw file) */
}

/**
 * Reads a zlib/raw deflate stream from a file
 * 
 * TODO: Eventually this should output a stream instead of a buffer
 * TODO: Make the 'end' parameter imply a limit rather than an ended position and throw an error if the parsed length doesn't match a well-known given length
 * 
 * @param file an open file handle
 * @param start starting offset into the file of the stream
 * @param end ending offset of the stream. if not given or -1, then we will read until the end of the stream
 * @param raw if true, then a raw deflate stream will be read instead of a full header'ed and checksumed zlib stream
 */
export async function ReadCompressedStream(file: number, start: number, end: number, raw = false): Promise<CompressedStreamResult> {

	let decompressed = Buffer.from([]); // TODO: Need a smarter auto-resizing thing if we want to keep it in memory

	let inflater = raw? zlib.createInflateRaw() : zlib.createInflate();


	// NOTE: When we switch this to incrementally reading from the file, it is also possible to detect the end of the stream by constantly flushing the stream on each write and seeing if all of the given bytes were consumed

	// TODO: Should we also bind the 'close' event?

	inflater.on('data', (data) => {
		decompressed = Buffer.concat([ decompressed, data ]);
	});

	await Promise.race([
		new Promise((res, rej) => {
			inflater.on('error', (err) => {
				// TODO: Verify that this works
				// Generally, if the stream is incomplete, then hopefully this will error out
				rej('Zlib Error: ' + err);
			});

			// TODO: This is no longer applicable if we never call .end() on the stream?
			inflater.on('end', () => {
				res();
			});
		}),
		(async () => {
			if(end > 0) {
				// TODO: Eventually just read one block at a time
				let buffer = Buffer.allocUnsafe(end - start);
				let ret = fs.readSync(file, buffer, 0, end - start, start);
				if(ret !== end - start) {
					throw new Error('Did not get all the bytes we expected');
				}

				inflater.write(buffer);
				inflater.end();

				// Wait for the 'end' event
				await new Promise(() => {});
			}
			else {
				let buffer = Buffer.allocUnsafe(BUFFER_SIZE);
				
				let pos = start;
				while(true) {
					fs.readSync(file, buffer, 0, buffer.length, pos);
					pos += buffer.length;
			
					inflater.write(buffer);
			
					await new Promise((res) => {
						inflater.flush(zlib.constants.Z_FULL_FLUSH, res);
					});
				
					// TODO: This is a really hacked together way to detect Z_STREAM_END. Annoyingly, node.js doesn't seem to expose that return code in any of the calls
					let nwritten = pos - start;
					if(inflater.bytesRead < nwritten) {
						break;
					}
				}
			}
		})()
	]);


	// Cleanup
	await new Promise((res) => {
		inflater.close(res);
	})

	// TODO: Reimplement this (applicable at least for the record/chunk compressed data)
	/*
	if(end > 0) {
		// Because the blocks are sector aligned, there will usually be padding
		// NOTE: These indexes are relative to start of the stream (not the start of the file)
		let padding_start = inflater.bytesRead;
		for(let i = padding_start; i < compressed.length; i++) {
			if(compressed[i] !== 0) {
				console.warn('Detected unknown data in padding after compressed stream');
				break;
			}
		}
	}
	*/

	return {
		data: decompressed,
		length: inflater.bytesRead
	};
}