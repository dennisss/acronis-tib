File Naming and Usage Conventions for Archives
==============================================


Mac OS Variant
--------------

Generally only two files are creates for archives:
1. `[name].tib`
	- Stores file data and some forms of metadata
2. `[name].tib.metadata`
	- Stores the full list

When new versions of a backup are created, data is for the most part strictly appended to the end of each of the files (in an append-only log style manner). 


Windows Variants
----------------

Multiple files may be created with the following format:
- `[name]_[type]_b[n]_s[m]_v[o].tib`
	- `type` is the versioning schema implemented by this slice (i.e. `full` for a full backup, incremental, etc.)
	- `n` is the index of the backup/archive (used in case multiple archives have the same name)
	- `m` is the index of the slice
	- `o` is the index of the volume

Typically for a single full backup run, one or more tib volumes will be created with a common slice index and incrementing volume index

Internally the volumes can be concatenated together (after the header) to form a single slice which is composed of many blocks of file/disk data followed by metadata at the very end of all of the last volume.

NOTE: Indexes start at `1` and not at `0`

- Older version of the windows variant will also put the timestamp in the name
	- i.e. `My-Backup-2014-11-12-1234_full_b1_s1_v1.tib`