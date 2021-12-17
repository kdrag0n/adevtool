import { promises as fs } from 'fs'
import ora from 'ora'
import path from 'path'

import { createSubTmp, exists, mount, TempState } from '../util/fs'
import { ALL_SYS_PARTITIONS } from '../util/partitions'
import { run } from '../util/process'
import { isSparseImage } from '../util/sparse'
import { listZipFiles } from '../util/zip'

export interface WrappedSource {
  src: string | null
  factoryZip: string | null
}

async function containsParts(src: string, suffix: string = '') {
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

async function mountImg(
  img: string,
  dest: string,
  mountTmp: TempState,
  spinner: ora.Ora,
) {
  // Convert sparse image to raw
  if (await isSparseImage(img)) {
    spinner.text = `converting sparse image: ${img}`
    let sparseTmp = await createSubTmp(mountTmp.rootTmp!, `sparse_img/${path.basename(path.dirname(img))}`)
    let rawImg = `${sparseTmp.dir}/${path.basename(img)}`
    await run(`simg2img ${img} ${rawImg}`)
    await fs.rm(img)
    img = rawImg
  }

  spinner.text = `mounting: ${img}`
  await mount(img, dest)
  mountTmp.mounts.push(dest)
}

async function mountParts(
  src: string,
  mountTmp: TempState,
  spinner: ora.Ora,
  suffix: string = '.img',
) {
  let mountRoot = mountTmp.dir

  for (let part of ALL_SYS_PARTITIONS) {
    let img = `${src}/${part}${suffix}`
    if (await exists(img)) {
      let partPath = `${mountRoot}/${part}`
      await fs.mkdir(partPath)
      await mountImg(img, partPath, mountTmp, spinner)
    }
  }
}

async function wrapLeafFile(
  file: string,
  factoryZip: string | null,
  tmp: TempState,
  spinner: ora.Ora,
): Promise<WrappedSource> {
  let imagesTmp = await createSubTmp(tmp, `src_images/${path.basename(file)}`)

  // Extract images from OTA payload
  if (path.basename(file) == 'payload.bin') {
    spinner.text = `extracting OTA images: ${file}`
    await run(`cd ${imagesTmp.dir}; payload-dumper-go ${file}`)
    if (file.startsWith(tmp.dir)) {
      await fs.rm(file)
    }

    let extractedDir = (await fs.readdir(imagesTmp.dir))[0]
    let imagesPath = `${imagesTmp.dir}/${extractedDir}`
    return await searchLeafDir(imagesPath, factoryZip, null, null, tmp, spinner)
  }

  let files = await listZipFiles(file)

  let imagesEntry = files.find(f => f.includes('/image-') && f.endsWith('.zip'))
  if (imagesEntry != undefined) {
    // Factory images

    // Extract nested images zip
    spinner.text = `extracting factory images: ${file}`
    let imagesFile = `${imagesTmp.dir}/${imagesEntry}`
    await run(`unzip -d ${imagesTmp.dir} ${file} ${imagesEntry}`)
    return await wrapLeafFile(imagesFile, file, tmp, spinner)
  } else if (files.find(f => f == 'payload.bin') != undefined) {
    // OTA package

    // Extract update_engine payload
    spinner.text = `extracting OTA payload: ${file}`
    let payloadFile = `${imagesTmp.dir}/payload.bin`
    await run(`unzip -d ${imagesTmp.dir} ${file} payload.bin`)
    return await wrapLeafFile(payloadFile, factoryZip, tmp, spinner)
  } else if (files.find(f => f.endsWith('.img') && ALL_SYS_PARTITIONS.has(f.replace('.img', '')))) {
    // Images zip

    // Extract image files
    spinner.text = `extracting images: ${file}`
    await run(`unzip -d ${imagesTmp.dir} ${file}`)
    if (file.startsWith(tmp.dir)) {
      await fs.rm(file)
    }
    return await searchLeafDir(imagesTmp.dir, factoryZip, null, null, tmp, spinner)
  } else {
    throw new Error(`File '${file}' has unknown format`)
  }
}

async function searchLeafDir(
  src: string,
  factoryZip: string | null,
  device: string | null,
  buildId: string | null,
  tmp: TempState,
  spinner: ora.Ora,
): Promise<WrappedSource> {
  if (!(await exists(src))) {
    return {
      src: null,
      factoryZip: null,
    }
  }

  if (await containsParts(src)) {
    // Root of mounted images
    return { src, factoryZip }
  } else if (await containsParts(src, '.img.raw')) {
    // Mount raw images: <images>.img.raw

    // Mount the images
    let mountTmp = await createSubTmp(tmp, `sysroot/${path.basename(src)}`)
    await mountParts(src, mountTmp, spinner, '.img.raw')
    return { src: mountTmp.dir, factoryZip }
  } else if (await containsParts(src, '.img')) {
    // Mount potentially-sparse images: <images>.img

    // Mount the images
    let mountTmp = await createSubTmp(tmp, `sysroot/${path.basename(src)}`)
    await mountParts(src, mountTmp, spinner)
    return { src: mountTmp.dir, factoryZip }
  } else if (device != null && buildId != null) {
    let imagesZip = `${src}/image-${device}-${buildId}.zip`
    if (await exists(imagesZip)) {
      // Factory images - nested images package: image-$device-$buildId.zip
      return await wrapLeafFile(imagesZip, factoryZip, tmp, spinner)
    }

    let factoryPath = (await fs.readdir(src))
      .find(f => f.startsWith(`${device}-${buildId}-factory-`))
    if (factoryPath != undefined) {
      // Factory images zip
      return await wrapLeafFile(`${src}/${factoryPath}`, factoryPath, tmp, spinner)
    }
  }

  return {
    src: null,
    factoryZip: null,
  }
}

export async function wrapSystemSrc(
  src: string,
  device: string,
  buildId: string | null,
  tmp: TempState,
  spinner: ora.Ora,
): Promise<WrappedSource> {
  let stat = await fs.stat(src)
  if (stat.isDirectory()) {
    // Directory

    let tryDirs = [
      ...(buildId != null && [
        `${src}/${buildId}`,
        `${src}/${device}/${buildId}`,
        `${src}/${buildId}/${device}`,
      ] || []),
      `${src}/${device}`,
      src,
    ]

    // Also try to find extracted factory images first: device-buildId
    if (buildId != null) {
      tryDirs = [
        ...tryDirs.map(p => `${p}/${device}-${buildId}`),
        ...tryDirs,
      ]
    }

    for (let dir of tryDirs) {
      let { src: wrapped, factoryZip } = await searchLeafDir(dir, null, device, buildId, tmp, spinner)
      if (wrapped != null) {
        spinner.text = wrapped.startsWith(tmp.dir) ? path.relative(tmp.dir, wrapped) : wrapped
        return { src: wrapped, factoryZip }
      }
    }

    throw new Error(`No supported source format found in '${src}'`)
  } else if (stat.isFile()) {
    // File

    // Attempt to extract factory images or OTA
    let { src: wrapped, factoryZip } = await wrapLeafFile(src, null, tmp, spinner)
    if (wrapped != null) {
      spinner.text = wrapped.startsWith(tmp.dir) ? path.relative(tmp.dir, wrapped) : wrapped
      return { src: wrapped, factoryZip }
    }
  }

  throw new Error(`Source '${src}' has unknown type`)
}
