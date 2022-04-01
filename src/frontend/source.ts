import { promises as fs } from 'fs'
import ora from 'ora'
import path from 'path'
import { flags } from '@oclif/command'

import { createSubTmp, exists, mount, TempState, withTempDir } from '../util/fs'
import { ALL_SYS_PARTITIONS } from '../util/partitions'
import { run } from '../util/process'
import { isSparseImage } from '../util/sparse'
import { listZipFiles } from '../util/zip'
import { withSpinner } from '../util/cli'

export const WRAPPED_SOURCE_FLAGS = {
  stockSrc: flags.string({
    char: 's',
    description:
      'path to (extracted) factory images, (mounted) images, (extracted) OTA package, OTA payload, or directory containing any such files (optionally under device and/or build ID directory)',
    required: true,
  }),
  buildId: flags.string({
    char: 'b',
    description: 'build ID of the stock images (optional, only used for locating factory images)',
  }),
  useTemp: flags.boolean({
    char: 't',
    description: 'use a temporary directory for all extraction (prevents reusing extracted files across runs)',
    default: false,
  }),
}

export interface WrappedSource {
  src: string | null
  factoryPath: string | null
}

async function containsParts(src: string, suffix = '') {
  // If any sys partitions are present
  for (let part of ALL_SYS_PARTITIONS) {
    let path = `${src}/${part}${suffix}`
    try {
      if (await exists(path)) {
        return true
      }
    } catch {
      // ENOENT
    }
  }

  return false
}

class SourceResolver {
  constructor(
    readonly device: string,
    readonly buildId: string | null,
    readonly useTemp: boolean,
    readonly tmp: TempState,
    readonly spinner: ora.Ora,
  ) {}

  // Dummy TempState that just returns the path, but with managed mountpoints
  private createStaticTmp(path: string) {
    return {
      ...this.tmp,
      dir: path,
    } as TempState
  }

  // Dynamically switch between static and real sub-temp, depending on useTemp
  private async createDynamicTmp(tmpPath: string, absPath: string) {
    if (this.useTemp) {
      return await createSubTmp(this.tmp, tmpPath)
    }
    return this.createStaticTmp(absPath)
  }

  private async mountImg(img: string, dest: string) {
    // Convert sparse image to raw
    if (await isSparseImage(img)) {
      this.spinner.text = `converting sparse image: ${img}`
      let sparseTmp = await this.createDynamicTmp(`sparse_img/${path.basename(path.dirname(img))}`, path.dirname(img))

      let rawImg = `${sparseTmp.dir}/${path.basename(img)}.raw`
      await run(`simg2img ${img} ${rawImg}`)
      await fs.rm(img)
      img = rawImg
    }

    this.spinner.text = `mounting: ${img}`
    await mount(img, dest)
    this.tmp.mounts.push(dest)
  }

  private async mountParts(src: string, mountTmp: TempState, suffix = '.img') {
    let mountRoot = mountTmp.dir

    for (let part of ALL_SYS_PARTITIONS) {
      let img = `${src}/${part}${suffix}`
      if (await exists(img)) {
        let partPath = `${mountRoot}/${part}`
        await fs.mkdir(partPath)
        await this.mountImg(img, partPath)
      }
    }
  }

  private async wrapLeafFile(file: string, factoryPath: string | null): Promise<WrappedSource> {
    let imagesTmp = await this.createDynamicTmp(`src_images/${path.basename(file)}`, path.dirname(file))

    // Extract images from OTA payload
    if (path.basename(file) == 'payload.bin') {
      this.spinner.text = `extracting OTA images: ${file}`
      await run(`cd ${imagesTmp.dir}; payload-dumper-go ${file}`)
      if (file.startsWith(this.tmp.dir)) {
        await fs.rm(file)
      }

      let extractedDir = (await fs.readdir(imagesTmp.dir))[0]
      let imagesPath = `${imagesTmp.dir}/${extractedDir}`
      return await this.searchLeafDir(imagesPath, factoryPath)
    }

    let files = await listZipFiles(file)

    let imagesEntry = files.find(f => f.includes('/image-') && f.endsWith('.zip'))
    if (imagesEntry != undefined) {
      // Factory images

      // Extract nested images zip
      this.spinner.text = `extracting factory images: ${file}`
      let imagesFile = `${imagesTmp.dir}/${imagesEntry}`
      await run(`unzip -od ${imagesTmp.dir} ${file}`)
      return await this.wrapLeafFile(imagesFile, file)
    }
    if (files.find(f => f == 'payload.bin') != undefined) {
      // OTA package

      // Extract update_engine payload
      this.spinner.text = `extracting OTA payload: ${file}`
      let payloadFile = `${imagesTmp.dir}/payload.bin`
      await run(`unzip -od ${imagesTmp.dir} ${file} payload.bin`)
      return await this.wrapLeafFile(payloadFile, factoryPath)
    }
    if (files.find(f => f.endsWith('.img') && ALL_SYS_PARTITIONS.has(f.replace('.img', '')))) {
      // Images zip

      // Extract image files
      this.spinner.text = `extracting images: ${file}`
      await run(`unzip -od ${imagesTmp.dir} ${file}`)
      if (file.startsWith(this.tmp.dir)) {
        await fs.rm(file)
      }
      return await this.searchLeafDir(imagesTmp.dir, factoryPath)
    }
    throw new Error(`File '${file}' has unknown format`)
  }

  private async searchLeafDir(src: string, factoryPath: string | null): Promise<WrappedSource> {
    if (!(await exists(src))) {
      return {
        src: null,
        factoryPath: null,
      }
    }

    if (await containsParts(src)) {
      // Root of mounted images
      return { src, factoryPath }
    }
    if (await containsParts(src, '.img.raw')) {
      // Mount raw images: <images>.img.raw

      // Mount the images
      let mountTmp = await createSubTmp(this.tmp, `sysroot/${path.basename(src)}`)
      await this.mountParts(src, mountTmp, '.img.raw')
      return { src: mountTmp.dir, factoryPath: factoryPath || src }
    }
    if (await containsParts(src, '.img')) {
      // Mount potentially-sparse images: <images>.img

      // Mount the images
      let mountTmp = await createSubTmp(this.tmp, `sysroot/${path.basename(src)}`)
      await this.mountParts(src, mountTmp)
      return { src: mountTmp.dir, factoryPath: factoryPath || src }
    }
    if (this.device != null && this.buildId != null) {
      let imagesZip = `${src}/image-${this.device}-${this.buildId}.zip`
      if (await exists(imagesZip)) {
        // Factory images - nested images package: image-$device-$buildId.zip
        return await this.wrapLeafFile(imagesZip, factoryPath || src)
      }

      let newFactoryPath = (await fs.readdir(src)).find(f => f.startsWith(`${this.device}-${this.buildId}-factory-`))
      if (newFactoryPath != undefined) {
        // Factory images zip
        return await this.wrapLeafFile(`${src}/${newFactoryPath}`, newFactoryPath)
      }
    }

    return {
      src: null,
      factoryPath: null,
    }
  }

  async wrapSystemSrc(src: string) {
    let stat = await fs.stat(src)
    if (stat.isDirectory()) {
      // Directory

      let tryDirs = [
        ...((this.buildId != null && [
          `${src}/${this.buildId}`,
          `${src}/${this.device}/${this.buildId}`,
          `${src}/${this.buildId}/${this.device}`,
        ]) ||
          []),
        `${src}/${this.device}`,
        src,
      ]

      // Also try to find extracted factory images first: device-buildId
      if (this.buildId != null) {
        tryDirs = [...tryDirs.map(p => `${p}/${this.device}-${this.buildId}`), ...tryDirs]
      }

      for (let dir of tryDirs) {
        let { src: wrapped, factoryPath } = await this.searchLeafDir(dir, null)
        if (wrapped != null) {
          this.spinner.text = wrapped.startsWith(this.tmp.dir) ? path.relative(this.tmp.dir, wrapped) : wrapped
          return { src: wrapped, factoryPath }
        }
      }

      throw new Error(`No supported source format found in '${src}'`)
    } else if (stat.isFile()) {
      // File

      // Attempt to extract factory images or OTA
      let { src: wrapped, factoryPath } = await this.wrapLeafFile(src, null)
      if (wrapped != null) {
        this.spinner.text = wrapped.startsWith(this.tmp.dir) ? path.relative(this.tmp.dir, wrapped) : wrapped
        return { src: wrapped, factoryPath }
      }
    }

    throw new Error(`Source '${src}' has unknown type`)
  }
}

export async function wrapSystemSrc(
  src: string,
  device: string,
  buildId: string | null,
  useTemp: boolean,
  tmp: TempState,
  spinner: ora.Ora,
): Promise<WrappedSource> {
  let resolver = new SourceResolver(device, buildId, useTemp, tmp, spinner)
  return await resolver.wrapSystemSrc(src)
}

export async function withWrappedSrc<Return>(
  stockSrc: string,
  device: string,
  buildId: string | undefined,
  useTemp: boolean,
  callback: (stockSrc: string) => Promise<Return>,
) {
  return await withTempDir(async tmp => {
    // Prepare stock system source
    let wrapBuildId = buildId == undefined ? null : buildId
    let wrapped = await withSpinner('Extracting stock system source', spinner =>
      wrapSystemSrc(stockSrc, device, wrapBuildId, useTemp, tmp, spinner),
    )
    let wrappedSrc = wrapped.src!

    return await callback(wrappedSrc)
  })
}
