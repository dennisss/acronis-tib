import fuse from 'fuse-bindings';

/**
 * A single helper/mixin for explicitly covering write operations with Read-only file system warnings instead of appearing to be not implemented
 * 
 * TODO: Currently goes not cover 'open' mode checks
 */
export class FuseReadOnlyHandler implements fuse.MountOptions {

	truncate(path: string, size: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	ftruncate(path: string, fd: number, size: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}


	chown(path: string, uid: number, gid: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	chmod(path: string, mode: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	mknod(path: string, mode: number, dev: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	setxattr(path: string, name: string, buffer: Buffer, length: number, offset: number, flags: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	removexattr(path: string, name: string, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	write(path: string, fd: number, buffer: Buffer, length: number, position: number, callback: (bytesWrittenOrErr: number) => void) {
		callback(fuse.EROFS);
	}

	create(path: string, mode: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	utimens(path: string, atime: number, mtime: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	unlink(path: string, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	rename(src: string, dest: string, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	link(path: string, target: string, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	symlink(path: string, target: string, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	mkdir(path: string, mode: number, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}

	rmdir(path: string, callback: (code: number) => void) {
		callback(fuse.EROFS);
	}
}