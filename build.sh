#!/bin/bash
set -e

mkdir -p build
rm -rf build/next-index_*

export CGO_ENABLED=0

export GOARCH=amd64
export GOOS=linux
go build -o build/next-index_linux_amd64/next-index .

export GOOS=windows
go build -o build/next-index_windows_amd64/next-index.exe .

export GOOS=darwin
go build -o build/next-index_darwin_amd64/next-index .

export GOARCH=arm64

export GOOS=linux
go build -o build/next-index_linux_arm64/next-index .

export GOOS=windows
go build -o build/next-index_windows_arm64/next-index.exe .

export GOOS=darwin
go build -o build/next-index_darwin_arm64/next-index .

cd build

names=$(ls)

for name in ${names}; do
	tar -czf "${name}.tar.gz" "${name}"
done

for name in ${names}; do
	rm -rf "${name}"
done
