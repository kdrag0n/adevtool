import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

import { run } from './process'

const TMP_PREFIX = 'adevtool-'

export interface TempState {
  dir: string
  mounts: Array<string>
  rootTmp?: TempState
}

// https://stackoverflow.com/a/45130990
export async function* listFilesRecursive(dir: string): AsyncGenerator<string> {
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  for (const dirent of dirents) {
    const res = path.resolve(dir, dirent.name)
    if (dirent.isDirectory()) {
      yield* listFilesRecursive(res)
    } else if (dirent.isFile() || dirent.isSymbolicLink()) {
      yield res
    }
  }
}

export async function exists(path: string) {
  try {
    await fs.access(path)
    return true
  } catch {
    // Doesn't exist or can't read
    return false
  }
}

export async function withTempDir<Return>(callback: (tmp: TempState) => Promise<Return>) {
  let tmp = os.tmpdir()
  let rand = `${Math.random()}`.slice(2, 10)
  let dir = `${tmp}/${TMP_PREFIX}${rand}`

  await fs.rm(dir, { force: true, recursive: true })
  await fs.mkdir(dir)
  let state = {
    dir,
    mounts: [],
  } as TempState

  try {
    return await callback(state)
  } finally {
    // Clean up mountpoints
    for (let mount of state.mounts) {
      await run(`umount -f ${mount}`)
    }

    await fs.rm(dir, { force: true, recursive: true })
  }
}

export async function createSubTmp(tmp: TempState, subpath: string) {
  await fs.mkdir(`${tmp.dir}/${subpath}`, { recursive: true })

  return {
    ...tmp,
    dir: `${tmp.dir}/${subpath}`,
    rootTmp: tmp.rootTmp ?? tmp,
  } as TempState
}

export async function readFile(path: string) {
  return await fs.readFile(path, { encoding: 'utf8' })
}

export async function mount(imgPath: string, mountpoint: string) {
  await run(`mount -o ro ${imgPath} ${mountpoint}`)
}
