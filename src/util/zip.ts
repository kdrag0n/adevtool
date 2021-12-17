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
    const fh = await this.file
    await fh.close()
  }

  async getLength() {
    if (this.length == undefined) {
      const fh = await this.file
      const stat = await fh.stat()
      this.length = stat.size
    }
    return this.length
  }

  async read(offset: number, length: number) {
    const fh = await this.file
    const data = new Uint8Array(length)
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
