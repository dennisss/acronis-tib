#!/bin/bash

# I use this script to upload data files so that they can be served outside of the size-sensitive git repo

gsutil -m cp -r -Z data/ gs://acronis-tib/samples
gsutil -m cp -r -Z win/ gs://acronis-tib/samples
gsutil -m cp -r -Z mac/ gs://acronis-tib/samples
