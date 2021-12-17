import { promises as fs } from 'fs'

const FILE_MAGIC = 0xed26ff3a

export async function isSparseImage(path: string) {
  let file = await fs.open(path, 'r')
  try {
    let buf = new Uint32Array(1)
    await file.read(buf, 0, 4)

    return buf[0] == FILE_MAGIC
  } finally {
    await file.close()
  }
}
