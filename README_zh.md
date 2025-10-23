<!--
 * @Author: feiqin
 * @Date: 2025-10-23 14:42:19
 * @LastEditors: feiqin
 * @LastEditTime: 2025-10-23 14:56:30
 * @Description: 
-->
# HTTPulse


[![test library](https://img.shields.io/github/workflow/status/vicanso/HTTPulse/test?label=test)](https://github.com/vicanso/HTTPulse/actions?query=workflow%3A%22test%22)
[![License](https://img.shields.io/badge/License-Apache%202-green.svg)](https://github.com/vicanso/HTTPulse)
[![donwnload](https://img.shields.io/github/downloads/vicanso/HTTPulse/total?label=Downloads&logoColor=fff&logo=GitHub)](https://github.com/vicanso/HTTPulse/releases)


<p align="center">
    <img src="./HTTPulse.png" alt="HTTPulse" width="128">
</p>

<h3 align="center">
<a href="https://github.com/vicanso/HTTPulse">HTTPulse</a>是基于<a href="https://github.com/tauri-apps/tauri">tauri</a>开发的跨平台API客户端
</h3>

[English](./README.md)|简体中文
## 功能

- 支持macos、windows以及linux平台，安装包均在10MB以下
- 单个项目上千个接口秒级打开，内存占用较低
- 支持Dark/Light主题以及中英语言
- 简单易用的操作及配置方式
- 可快速导入postman，insomnia或者swagger的配置
- 关键字筛选支持中文拼音或者首字母
- 可按接口、按功能、按项目导出配置，方便团队内共用
- 各类自定义的函数，方便各请求间关联数据


<p align="center">
    <img src="./asset/HTTPulse.png" alt="HTTPulse">
</p>

HTTPulse暂时仅是开发版本，业余时间的个人项目，如果有BUG或期望新增功能可以issue，对于BUG请附上系统版本信息，本人尽可能抽时间处理。


## 安装

安装程序可以通过[release](https://github.com/vicanso/HTTPulse/releases)下载，包括windows、macos以及linux版本。

需要注意如果是win7或者未安装Edge的windows，在安装时会提示需要执行MicrosoftEdgeUpdateSetup的程序，如果杀毒软件提示允许执行即可。
如果是macos，由于系统的安全调整，打开应用时会提示"无法打开"HTTPulse"，因为Apple无法检查其是否包含恶意软件"，在"系统设置" -> "安全性与隐私" -> "通用"面板选择继续打开即可。或者执行以下命令：`sudo xattr -rd com.apple.quarantine /Applications/HTTPulse.app`

## 开发

项目依赖于rust与Nodejs，如果想自行编译或参与开发，可以先参考[这里](https://tauri.app/v1/guides/getting-started/prerequisites)的相关文档安装tauri的依赖，之后执行：

```shell
yarn
```

安装tauri-cli:

```shell
cargo install tauri-cli
```

仅调整前端界面时可直接使用浏览器的方式来测试(增加了各类mock的接口)，执行：

```shell
yarn dev
```

如果以APP的形式运行，则执行：

```shell
make dev
```

如果想编译安装包，则执行：

```shell
make build
```