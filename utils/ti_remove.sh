#!/bin/bash

# Removes True Image on Mac
# NOTE: Also this, if you want to reinstall True Image afterwards, you will want to run ti_init.sh after reinstalling but before opening it to make it actually work

sudo launchctl unload -w /Library/LaunchAgents/com.acronis.*
sudo launchctl unload -w /Library/LaunchDaemons/com.acronis.*
sudo rm -f /Library/LaunchAgents/com.acronis.* /Library/LaunchDaemons/com.acronis.*
rm -rf /Applications/Acronis\ True\ Image.app/
pkill "Tray Monitor"
sudo kextunload -b com.acronis.fileprotector
sudo rm -rf /Library/Extensions/fileprotector.kext
sudo rm -rf /Library/Application\ Support/Acronis
sudo rm -rf /Library/Application\ Support/Acronis\ Mobile\ Backup\ Data/
rm -rf ~/Library/Application\ Support/Acronis/
rm -rf ~/Library/Caches/com.acronis.*
