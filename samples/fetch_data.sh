#!/bin/bash

# Retrieves the raw standard data we want to try archiving

set -e

mkdir -p data
cd data

wget --content-disposition https://github.com/dennisss/chess/archive/bfc47df6562b2e4f0a1d0a5dc8a526d9b7c103db.zip
wget --content-disposition https://github.com/dennisss/chess/archive/675ab91843499aa0b7e18293f1bbe7464b05a9c1.zip
