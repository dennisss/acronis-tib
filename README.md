Acronis TIB Backup Format Reader
================================

This is a set of tools for reading the contents of Acronis True Image backup files (in particular the ones with file extensions `.tib` and `.tib.metadata`)

Target features:
- Verification of backup file integrity
- FUSE file system mounter for viewing file-based backups
- Loop device style-interface for reading backups of full disks/partitions

Reversing Engineering TODOs:
- Encryption
- Most of the Windows format spec
- Some parts of the Mac spec (see the source code for gaps)


Usage
-----
TODO: Still a work in progress 


Versions
--------

The objective is to support all versions of the file format. As of right now the Mac and Windows versions produce relatively different file formats (thus likely why True Image does not natively allow for cross-os archive viewing).

Judging by the backwards compatibility information located here (https://kb.acronis.com/tib), the following distinct variants of the file format exist in the wild (each number listed below is the version year of True Image):
1. Windows `<= 2012`
2. Windows `>= 2013 and <= 2014`
3. Windows `>= 2015 to present`
4. Mac OS `all years`


Terminology
-----------

Going along with the True Image documentation here: https://kb.acronis.com/content/1772, we will use the following top-level terms to describe the containers:

1. `Archive` 
	- A complete chain/group composed of all backup files over time for a single configuration
	- Composed of `Slice`s

2. `Slice`
	- Represents a single point in time and a single set of files
	- Composed of `Volume`s  (usually just 1 unless it is being split up into smaller parts)
	- NOTE: In the case of Mac backups, multiple slices may reference the same volume 

3. `Volume`
	- A single `.tib` file. Stored the actual file and metadata information
