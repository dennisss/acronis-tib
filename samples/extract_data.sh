#!/bin/bash

set -e

echo "Extractly version A"
./extract_data_single.sh chess bfc47df6562b2e4f0a1d0a5dc8a526d9b7c103db

echo "Done! Please create an archive from '/opt/acronis/chess' to './mac/' named 'chess'."
read -p "Press enter after complete"

echo "Saving version A"
cp mac/chess.tib mac/chess-a.tib
cp mac/chess.tib.metadata mac/chess-a.tib.metadata

echo -e "\n\nExtracting version B"
./extract_data_single.sh chess 675ab91843499aa0b7e18293f1bbe7464b05a9c1

echo "Done! Please backup a new version (just hit 'Back Up' on the same item)"
read -p "Press enter after complete"

echo "Saving version B"
cp mac/chess.tib mac/chess-b.tib
cp mac/chess.tib.metadata mac/chess-b.tib.metadata

# They will be created as root by the acronis helper
rm -f mac/chess.tib
rm -f mac/chess.tib.metadata

