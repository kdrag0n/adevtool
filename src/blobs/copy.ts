import { promises as fs } from 'fs'
import * as path from 'path'
import * as chalk from 'chalk'
import * as ora from 'ora'

import { BlobEntry } from './entry'

export async function copyBlobs(entries: Array<BlobEntry>, srcDir: string, outDir: string) {
  let spinner = ora({
    prefixText: chalk.bold(chalk.greenBright('Copying blobs')),
    color: 'green',
  }).start()

  for (let entry of entries) {
    let outPath = `${outDir}/${entry.srcPath}`
    let srcPath = `${srcDir}/${entry.srcPath}`
    spinner.text = entry.srcPath

    // Symlinks are created at build time, not copied
    let stat = await fs.lstat(srcPath)
    if (stat.isSymbolicLink()) {
      continue
    }

    // Create directory structure
    await fs.mkdir(path.dirname(outPath), {recursive: true})

    // Some files need patching
    if (entry.path.endsWith('.xml')) {
      let xml = await fs.readFile(srcPath, {encoding: 'utf8'})
      // Fix Qualcomm "version 2.0" XMLs
      if (xml.startsWith('<?xml version="2.0"')) {
        let patched = xml.replace(/^<\?xml version="2.0"/, '<?xml version="1.0"')
        await fs.writeFile(outPath, patched)
        continue
      }
    }

    await fs.copyFile(srcPath, outPath)
  }

  spinner.stopAndPersist()
}
