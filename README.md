adevtool
========

Android device support and bringup tool.

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/adevtool.svg)](https://npmjs.org/package/adevtool)
[![Downloads/week](https://img.shields.io/npm/dw/adevtool.svg)](https://npmjs.org/package/adevtool)
[![License](https://img.shields.io/npm/l/adevtool.svg)](https://github.com/kdrag0n/adevtool/blob/master/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g adevtool
$ adevtool COMMAND
running command...
$ adevtool (-v|--version|version)
adevtool/0.0.0 linux-x64 node-v16.11.1
$ adevtool --help [COMMAND]
USAGE
  $ adevtool COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`adevtool hello [FILE]`](#adevtool-hello-file)
* [`adevtool help [COMMAND]`](#adevtool-help-command)

## `adevtool hello [FILE]`

describe the command here

```
USAGE
  $ adevtool hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ adevtool hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/kdrag0n/adevtool/blob/v0.0.0/src/commands/hello.ts)_

## `adevtool help [COMMAND]`

display help for adevtool

```
USAGE
  $ adevtool help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v3.2.3/src/commands/help.ts)_
<!-- commandsstop -->
