#!/bin/bash

# Fix reinstalling True Image after removing with the other script

sudo launchctl unload -w /Library/LaunchAgents/com.acronis.*
sudo launchctl unload -w /Library/LaunchDaemons/com.acronis.*