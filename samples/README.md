Sample .tib files
=================

This folder contains sample tib files along with the exact well-known payloads archived into them. As the parsing code is fairly offset driven, use these as references for understanding why certain offsets in the code are what they are.


Contributing
------------

If you have an interesting `.tib` file that covers a case we aren't testing or can't handle yet, we'd love to hear about it.

DO NOT commit binaries or archives to this repository. Instead submit a pull request to this repository with the documentation for the archive settings and original data, how to reproduce it, etc. and include in the description of the pull request publically accessible http links to the data/tib files. They will be separately ingested into the main Google Cloud Storage bucket when the pull request is accepted.


Normalization
-------------

Acronis will include absolute paths in some of the backup types. In order to make the .tib files more reproducible, we will attempt to control the original location of the files and other parameters.

### Mac

- When making file/folder based backups, we will always backup from `/opt/archive/[data-name]`
	- Creating the folder initially is why you need your password to run the scripts
	- NOTE: We can't extract to folders like `/tmp/` as TI is smart enough to completely ignore those folders

- Scheduling should be disabled in the per-archive options
- All backups unencrypted until we support that


### Windows

- When making file/folder based backups, we will always backup from `C:\Users\Acronis\[data-name]`
- Most sample archives should be submitted in both compressed and uncompressed form.


Sample Data
-----------

- `data/chess-*.zip`
	- A clone of this repository https://github.com/dennisss/chess at a few commit points without the `.git` repo
	- A bunch of source code files to test general directory support

- `data/gpt-efi.img`
	- Extracted from a Windows 10 VM raw disk
	- Consists of the all sectors of the disk through the GPT partition table and the first EFI partition
	- Annotated with the string `ENDEND` at the very end of the image to help locating the end of the parition in the archives
	- For sample archives of this data, incremental backups are created by overwriting bytes at offset 0xC8FFFEA (16 bytes before the beginning of the `ENDEND` string) with the ASCII characters `CHANGE` before starting the second backup
	- Only meaningful to use this for the Windows Sector-By-Sector Mode


Sample Archives
---------------

### Chess Samples

The `./extract_data.[sh|bat]` scripts are used to extract and position the data in the standard data dir. Then two backups (one full and one incremental) are taken on each OS. 

- `mac/chess-a`
	- Created with True Image 2019 for Mac
	- Based on the first of the `data/chess-*.zip` files
	- Permissions 755 (directories), 644 (files)
	- File owner: `user:staff` (uid: 501, gid: 20)
	- XAttrs: Single `com.apple.quarantine` attribute on each file 

- `mac/chess-b`
	- Same as `chess-a` but with an incremental backup appended to it with the second commit of the dataset
	- AKA: This file holds two different slices / snapshots in time

- `win/chess*`
	- Created with True Image 2019 for Windows
	- Windows version of the Mac ones above


### GPT-EFI Samples

- `win/gpt-efi-cmp`
	- Compressed (high) full disk "Sector-By-Sector" backup of a disk with the image's contents
	- Unallocated sectors also archived

- `win/gpt-efi-raw`
	- Same as the first one, but with compression disabled

