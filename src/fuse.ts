
import fs from 'fs-extra';
import fuse from 'fuse-bindings';
import Archive from './archive';
import MacVolume from './mac/volume';
import { MetaDataBox, BoxType, BlobBox } from './mac/box';
import { FileEntry, FileType } from './mac/file_entry';


export class FuseHandler implements fuse.MountOptions {
	// TODO: Must wrap all of this stuff in good error checking logic

	// TODO: Return EROFS for all write-operations for now

	// A cached version of the files array in the first MetaData box in the volume
	files: FileEntry[];

	// Index of each open file in the files array
	openFileTable: Map<number, number> = new Map();
	
	// File descriptor given to the last opened file
	lastFileOpen = 0;


	// TODO: Actually we should mount on an archive in a specific slice
	constructor(public archive: Archive) {

		let vol = this.archive.volumes[0] as MacVolume;

		let metaBox = vol.metaFile.boxes.find((box) => {
			return box.type === BoxType.MetaData;
		}) as MetaDataBox|undefined;

		if(!metaBox) {
			throw new Error('No metabox found');
		}

		this.files = metaBox.files;

	}

	mount() {
		var mountPath = process.platform !== 'win32' ? './mnt' : 'M:\\'

		fuse.mount(mountPath, this, function(err) {
			if(err) {
				throw err;
			}
			console.log('filesystem mounted on ' + mountPath)
		});

		// TODO:
		/*
		process.on('SIGINT', function () {
			fuse.unmount(mountPath, function (err) {
				if (err) {
					console.log('filesystem at ' + mountPath + ' not unmounted', err)
				} else {
					console.log('filesystem at ' + mountPath + ' unmounted')
				}
			})
		})
		*/
	}

	// TODO: Eventually we would like to implement this directly on time of the metadata file(s) so that we don't have to keep them all in memory all the time
	/**
	 * Looks up the index of a file entry in the files array
	 * 
	 * Returns -1 if it does not exist
	 */
	findFileEntryIndex(path: string): number {
		
		// NOTE: In one way or another, we need to support running getattr on the root of the filesystem

		// NOTE: We assume that the path given starts with a '/'
		path = '/root:' + path;

		if(path[0] === '/') {
			path = path.slice(1);
		}

		if(path[path.length - 1] === '/') {
			path = path.slice(0, path.length - 1);
		}

		let parts = path.split('/');

		let endIndex = this.files.length;

		for(var i = 0; i < endIndex; i++) {
			let f = this.files[i];
			if(f.name === parts[0]) {
				if(parts.length === 1) {
					return i;
				}
				else {
					if(f.type !== FileType.Directory) { // TODO: May eventually need to distinguish the root type as well
						// In this case, it is an ENOTDIR error because at least one non-terminate path segment was not a directory
						return fuse.ENOTDIR;
					}

					parts.shift();

					endIndex = i + 1 + f.numEntries;
					continue;
				}
			}

			// Otherwise, just keep moing along as usual
			if(f.type === FileType.Directory) {
				i += f.numEntries;
			}
		}

		return fuse.ENOENT;
	}


	init = (callback: (code: number) => void) => {
		console.log('CALL INIT');
		callback(0);
	}

	destroy = (callback: (code: number) => void) => {
		callback(0);
	}

	/*
	statfs = (path: string, callback: (code: number, fsStat: fuse.FSStat) => void) => {

	}
	*/

	getattr = (path: string, callback: (code: number, stats?: fuse.Stats) => void) => {

		let idx = this.findFileEntryIndex(path);
		if(idx < 0) {
			callback(idx);
			return;
		}
		
		let file = this.files[idx];


		let mode: number;
		let nlink: number;
		if(file.type === FileType.Directory) {
			nlink = 2;
			mode = fs.constants.S_IFDIR | 0o777;
		}
		else {
			nlink = 1;
			mode = fs.constants.S_IFREG | 0o777;
		}



		callback(0, {
			// All don't really apply in fuse?
			dev: 0,
			ino: 0,
			rdev: 0,
			// TODO: These may be useful to implement?
			blksize: 0,
			blocks: 0,
			
			nlink,
			
			mtime: file.mtime,
			atime: file.mtime,
			ctime: file.ctime,
			birthtime: file.ctime,
			size: file.size,
			mode,

			// TODO: These are interesting as we do need to read the boxes for this 
			uid: process.getuid(),
			gid: process.getgid()
		})
	}

	// TODO: fgetattr

	readdir = (path: string, callback: (code: number, lst: string[]) => void) => {

		let startIndex: number;
		let endIndex: number;

		// NOTE: This case would be if we wanted to allow listing the top-level usually hidden root: folder (usually this would be more applicable if if multiple partitions in windows are concerned)
		//if(path === '/') {
		//	startIndex = 0;
		//	endIndex = this.files.length;
		//}
		{
			let idx = this.findFileEntryIndex(path);
			if(idx < 0) {
				callback(idx, []);
				return;
			}

			let dir = this.files[idx];
			if(dir.type !== FileType.Directory) {
				callback(fuse.ENOTDIR, []);
				return;
			}

			startIndex = idx + 1;
			endIndex = startIndex + dir.numEntries
		}


		let names: string[] = [];
		for(let i = startIndex; i < endIndex; i++) {
			let f = this.files[i];
			names.push(f.name);

			if(f.type === FileType.Directory) {
				i += f.numEntries;
			}
		}

		callback(0, names);
	}


	// TODO: readlink

	/*
	getxattr = (path: string, name: string, buffer: Buffer, length: number, offset: number, cb: (code: number) => void) => {

	}

	listxattr = (path: string, buffer: Buffer, length: number, callback: (code: number, reqBufSize: number) => void) => {

	}
	*/

	open = (path: string, flags: number, callback: (code: number, fd: number) => void) => {
		return this._openType(FileType.Regular, path, flags, callback);
	}

	opendir = (path: string, flags: number, callback: (code: number, fd: number) => void) => {
		return this._openType(FileType.Directory, path, flags, callback);
	}

	_openType(type: FileType, path: string, flags: number, callback: (code: number, fd: number) => void) {
		// TODO: Check that write permissions were not requested
		let idx = this.findFileEntryIndex(path);
		if(idx < 0) {
			callback(idx, 0);
			return;
		}

		let file = this.files[idx];
		if(file.type !== type) {
			callback(type === FileType.Regular? fuse.EISDIR : fuse.ENOTDIR, 0);
			return;
		}

		let fd = ++this.lastFileOpen;
		this.openFileTable.set(fd, idx);

		callback(0, fd);
	}

	read = (path: string, fd: number, buffer: Buffer, length: number, position: number, callback: (bytesReadOrErr: number) => void) => {
		if(!this.openFileTable.has(fd)) {
			callback(fuse.EBADFD);
			return;
		}

		console.log('Try to read ', length, '@', position);

		(async () => {

			let file = this.files[this.openFileTable.get(fd)!];
		
			let vol = this.archive.volumes[0] as MacVolume;
	
			let pos = 0;
			let nread = 0;
	
			let bufferPos = 0;


			for(var i = 0; i < file.handles.length; i++) {
				let h = file.handles[i];
				if(h.type !== 4 /* (BoxType.Blob & 0xff) */) { // TODO: Get rid of the need to do the "& 0xff"
					continue;
				}
	
	
				if(position >= pos && pos < pos + h.size) {
					let start = position - pos;
					let n = Math.min(length, h.size - start);
	
					let box = (await vol.readBoxHandle(h)) as BlobBox;
	
					let chunk = box.data.slice(start, start + n);
					if(chunk.length !== n) {
						throw new Error('Bad chunk length obtained'); // XXX: In most cases, we do want to pad with zeros? (I think Acronis does that as an optimizatio)
					}
	
					chunk.copy(buffer, bufferPos, 0, n);
	
					nread += n;
					bufferPos += n;
					position += n;
					length -= n;
				}
	
	
				pos += h.size;
			}
	
			callback(nread);

		})().catch((err) => {
			console.error(err);
			
			callback(fuse.EIO);
		});

	}

	release = (path: string, fd: number, callback: (code: number) => void) => {
		if(!this.openFileTable.has(fd)) {
			callback(fuse.EBADFD);
			return;
		}

		// TODO: Eventually may also need to clear cached data if all references to the file have been closed
		this.openFileTable.delete(fd);
		callback(0);
	}

	releasedir = (path: string, fd: number, callback: (code: number) => void) => {
		return this.release(path, fd, callback);
	}

}
