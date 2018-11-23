@echo off

set DIR=%~dp0
set PATH=%PATH%;C:\Program Files\7-Zip\


if not exist C:\Users\Acronis mkdir C:\Users\Acronis
::takeown /f C:\Users\Acronis /r /d y

cd C:\Users\Acronis

:: Clearing old data
if exist chess rd /s /q chess

echo "Extracting version A"
set HASH=bfc47df6562b2e4f0a1d0a5dc8a526d9b7c103db
if exist chess-%HASH% rd /s /q chess-%HASH%
7z x "%DIR%\data\chess-%HASH%.zip" -y > NUL
move chess-%HASH% chess

echo Please archive from 'C:\Users\Acronis\chess' to '.\samples\win\' with name 'chess'.

set /p DUMMY=Hit ENTER to continue after completed...

:: TODO: Implement copying the backup

:: Clear again
rd /s /q chess


echo "Extracting version B"
set HASH=675ab91843499aa0b7e18293f1bbe7464b05a9c1
if exist chess-%HASH% rd /s /q chess-%HASH%
7z x "%DIR%\data\chess-%HASH%.zip" -y > NUL
move chess-%HASH% chess

set /p DUMMY=Hit ENTER to continue after completed...

:: TODO: Implement copying here as well
