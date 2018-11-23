Sample .tib files
=================

This folder contains sample tib files along with the exact well-known payloads archived into them. As the parsing code is fairly offset driven, use these as references for understanding why certain offsets in the code are what they are.

Normalization
-------------

Acronis will include absolute paths in some of the backup types. In order to make the .tib files more reproducible, we will attempt to control the original location of the files and other parameters.


Mac
---

- Payload files should be extracted to `/opt/archive/` and backed up from there
- True Image for Mac doesn't have many settings to deal with, but we mainly stick to the default ones except we disable scheduling in the settings menu.


Windows
-------


Index
-----

TODO: Create a sample with file exclusions added (they are probably stored as a list in the archive file)

NOTE: If you want to regenerate these files, delete the old .tib files dirst so that acronis doesn't create a second version on top of the original ones

- `mac/chess` archive
	- Run `extract_data.sh` in this directory as the working directory
	- Create a 
	-  // Created using True Image 2018 23.3.14170 on macOS
	- Created using True Image 2019 
	- Make sure the backup is called 

- Payload 1: `data/chess-*.zip`
	- A clone of this repository https://github.com/dennisss/chess at commit 675ab918 without the `.git` repo
	- Can be redownloaded from https://github.com/dennisss/chess/archive/675ab91843499aa0b7e18293f1bbe7464b05a9c1.tar.gz
	- Permissions when extracted should be:
		- 775 for directories
		- 664 for files



