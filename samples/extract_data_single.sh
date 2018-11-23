#!/bin/bash

set -e

NAME="$1"
HASH="$2"

# Where all the data will go
# NOTE: Acronis seems to ignore stuff in /tmp so that's why we aren't using that directory or any other obviously temporary directory
TOPDIR="/opt/acronis"
DIR="$TOPDIR/$NAME"

sudo mkdir -p $DIR
# Mainly so that the rest of the operations don't need sudo
sudo chown -R $(whoami):staff $TOPDIR

# Remove any old data (clear the folder contents, but leave the actual folder)
rm -rf $DIR/*
rm -rf /tmp/$NAME-*

# Unpack moving just the files
unzip -q data/$NAME-$HASH.zip -d /tmp/
mv /tmp/$NAME-$HASH/* $DIR/
rm -rf /tmp/$NAME-$HASH

# Normalize permissions
find $DIR -type d -exec chmod 755 {} \;
find $DIR -type f -exec chmod 644 {} \;

# Normalize owner
chown -R $(whoami):staff $DIR

# Normalize with a single xattr
xattr -c -r $DIR
xattr -w -r 'com.apple.quarantine' '0081;5bf82aeb;Chrome;62EAF42E-6961-4202-9134-F72750E8D93A' $DIR
