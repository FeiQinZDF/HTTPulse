# HTTPulse


[![test library](https://img.shields.io/github/workflow/status/vicanso/HTTPulse/test?label=test)](https://github.com/vicanso/HTTPulse/actions?query=workflow%3A%22test%22)
[![License](https://img.shields.io/badge/License-Apache%202-green.svg)](https://github.com/vicanso/HTTPulse)
[![donwnload](https://img.shields.io/github/downloads/vicanso/HTTPulse/total?label=Downloads&logoColor=fff&logo=GitHub)](https://github.com/vicanso/HTTPulse/releases)


<p align="center">
    <img src="./HTTPulse.png" alt="HTTPulse" width="128">
</p>

<h3 align="center">
<a href="https://github.com/vicanso/HTTPulse">HTTPulse</a> is API tool based on <a href="https://github.com/tauri-apps/tauri">tauri</a>.
</h3>

English|[简体中文](./README_zh.md)|[Українська](./README_uk.md)
## Features

- Support macos, windows and linux platforms, the installation package is below 10MB
- Thousands of interfaces for a single project are opened in seconds, with low memory usage
- Support dark/light theme and chinese/english/ukrainian
- Operation and configuration is simple
- Support importing configuration from postman, insonmia or swagger.
- The configuration can be exported by interface, function and project, which is convenient for sharing
- Support many custom functions


<p align="center">
    <img src="./asset/HTTPulse.png" alt="HTTPulse">
</p>


## Installation

The installer can be downloaded through [release](https://github.com/vicanso/HTTPulse/releases), including windows, macos and linux versions.

Windows may need to install webview2.

## macos

> If you can't open it after installation, exec the following command then reopen:<br>`sudo xattr -rd com.apple.quarantine /Applications/HTTPulse.app`

## Development


The project depends on rust and Nodejs. If you want to compile or participate in the development yourself, you can first install the dependencies of tauri by referring to the relevant documents [here](https://tauri.app/v1/guides/getting-started/prerequisites), and then :

```shell
yarn
```

Install tauri-cli:

```shell
cargo install tauri-cli
```

Running in browser mode, the data is mock:

```shell
yarn dev
```

Running in app mode:

```shell
make dev
```

Build the release package:

```shell
make build
```




