import adler32 from 'adler-32';
import { Reader } from './reader';


export function ComputeAdler32(data: Buffer): number {
	let num = adler32.buf(data);

	// This is also just to make the number into an unsigned number
	let tmp = Buffer.alloc(4);
	tmp.writeInt32LE(num, 0);
	return tmp.readUInt32LE(0); 
}


export async function CheckAllZeros(reader: Reader, count: number): Promise<boolean> {
	let bytes = Buffer.from(await reader.readBytes(count));
	for(let i = 0; i < bytes.length; i++) {
		if(bytes[i] !== 0) {
			return false;
		}
	}

	return true;
}

/**
 * Getting the ArrayBuffer slice backing a Node.js style buffer
 */
export function ToArrayBuffer(buf: Buffer): ArrayBuffer {
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
