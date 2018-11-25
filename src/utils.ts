import adler32 from 'adler-32';
import { Reader } from './reader';
import xml2js from 'xml2js';


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



export async function ParseXML(str: string): Promise<any> {

	let obj = await new Promise((res, rej) => {
		xml2js.parseString(str, (err, r) => {
			if(err) { rej(err); }
			else { res(r); }
		})
	})

	return obj;
}

/**
 * Ensures that an object only has exactly the given keys and no more/no-less
 */
export function AssertKeys(obj: any, targetKeys: string[], allOptional?: boolean) {
	let curKeys = Object.keys(obj);
	curKeys.sort();
	
	targetKeys = targetKeys.slice();
	targetKeys.sort();

	let i = 0;
	let j = 0;

	let unknown = [];
	let missing = [];

	while(i < curKeys.length && j < targetKeys.length) {
		if(curKeys[i] === targetKeys[j]) {
			i++;
			j++;
		}
		else if(curKeys[i] < targetKeys[j]) {
			unknown.push(curKeys[i]);
			i++;
		}
		else { // if(curKeys[i] > targetKeys[j]) {
			missing.push(targetKeys[j]);
			j++;
		}
	}

	if(i < curKeys.length || unknown.length > 0) {
		throw new Error('Unknown keys in object: ' + JSON.stringify(curKeys.slice(i).concat(unknown)));
	}

	if(j < targetKeys.length || missing.length > 0 && !allOptional) {
		throw new Error('Missing keys in object: ' + JSON.stringify(targetKeys.slice(j).concat(missing)));
	}

}


const UUID_REGEX = /^([0-9A-z]{8})-([0-9A-z]{4})-([0-9A-z]{4})-([0-9A-z]{4})-([0-9A-z]{12})$/;


export function AssertValidUUID(str: string) {
	if(!UUID_REGEX.exec(str)) {
		throw new Error('Not a valid uuid: ' + str);
	}
}

export function AssertValidNumber(str: string) {
	if(!(/^[0-9]+$/).exec(str)) {
		throw new Error('Not a valid number');
	}
}