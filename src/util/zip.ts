import { promises as fs } from 'fs'
import * as unzipit from 'unzipit'

// https://greggman.github.io/unzipit/#loadafileasanarraybuffer
export class NodeFileReader {
  length?: number

  file: Promise<fs.FileHandle>

  constructor(filename: string) {
    this.file = fs.open(filename, 'r')
  }

  async close() {
    let fh = await this.file
    await fh.close()
  }

  async getLength() {
    if (this.length == undefined) {
      let fh = await this.file
      let stat = await fh.stat()
      this.length = stat.size
    }
    return this.length
  }

  async read(offset: number, length: number) {
    let fh = await this.file
    let data = new Uint8Array(length)
    await fh.read(data, 0, length, offset)
    return data
  }
}

export async function listZipFiles(path: string) {
  let reader = new NodeFileReader(path)

  try {
    let { entries } = await unzipit.unzip(reader)
    return Object.keys(entries)
  } finally {
    await reader.close()
  }
}
