import { promises as fs } from 'fs'
import { FileHandle } from 'fs/promises'

// https://greggman.github.io/unzipit/#loadafileasanarraybuffer
export class NodeFileReader {
  length?: number
  fhp: Promise<FileHandle>

  constructor(filename: string) {
    this.fhp = fs.open(filename, 'r')
  }

  async close() {
    const fh = await this.fhp
    await fh.close()
  }

  async getLength() {
    if (this.length == undefined) {
      const fh = await this.fhp
      const stat = await fh.stat()
      this.length = stat.size
    }
    return this.length
  }

  async read(offset: number, length: number) {
    const fh = await this.fhp
    const data = new Uint8Array(length)
    await fh.read(data, 0, length, offset)
    return data
  }
}
