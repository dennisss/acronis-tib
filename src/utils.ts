import adler32 from 'adler-32';


export function ComputeAdler32(data: Buffer): number {
	let num = adler32.buf(data);

	// This is also just to make the number into an unsigned number
	let tmp = Buffer.alloc(4);
	tmp.writeInt32LE(num, 0);
	return tmp.readUInt32LE(0); 
}
