import { promises as fs } from 'fs'
import ora from 'ora'
import path from 'path'

import { createSubTmp, exists, mount, TempState } from '../util/fs'
import { ALL_SYS_PARTITIONS } from '../util/partitions'
import { run } from '../util/process'
import { isSparseImage } from '../util/sparse'
import { listZipFiles } from '../util/zip'

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

async function wrapFileSrc(
  file: string,
  tmp: TempState,
  spinner: ora.Ora,
): Promise<string | null> {
  let imagesTmp = await createSubTmp(tmp, `src_images/${path.basename(file)}`)

  // Extract images from OTA payload
  if (path.basename(file) == 'payload.bin') {
    spinner.text = `extracting OTA images: ${file}`
    await run(`cd ${imagesTmp.dir}; payload-dumper-go ${file}`)

    let extractedDir = (await fs.readdir(imagesTmp.dir))[0]
    let imagesPath = `${imagesTmp.dir}/${extractedDir}`
    return await searchLeafDir(imagesPath, null, null, tmp, spinner)
  }

  let files = await listZipFiles(file)

  let imagesEntry = files.find(f => f.includes('/image-') && f.endsWith('.zip'))
  if (imagesEntry != undefined) {
    // Factory images

    // Extract nested images zip
    spinner.text = `extracting factory images: ${file}`
    let imagesFile = `${imagesTmp.dir}/${imagesEntry}`
    await run(`unzip -d ${imagesTmp.dir} ${file} ${imagesEntry}`)
    return await wrapFileSrc(imagesFile, tmp, spinner)
  } else if (files.find(f => f == 'payload.bin') != undefined) {
    // OTA package

    // Extract update_engine payload
    spinner.text = `extracting OTA payload: ${file}`
    let payloadFile = `${imagesTmp.dir}/payload.bin`
    await run(`unzip -d ${imagesTmp.dir} ${file} payload.bin`)
    return await wrapFileSrc(payloadFile, tmp, spinner)
  } else if (files.find(f => f.endsWith('.img') && ALL_SYS_PARTITIONS.has(f.replace('.img', '')))) {
    // Images zip

    // Extract image files
    spinner.text = `extracting images: ${file}`
    await run(`unzip -d ${imagesTmp.dir} ${file}`)
    return await searchLeafDir(imagesTmp.dir, null, null, tmp, spinner)
  } else {
    throw new Error(`File '${file}' has unknown format`)
  }
}

async function searchLeafDir(
  src: string,
  device: string | null,
  buildId: string | null,
  tmp: TempState,
  spinner: ora.Ora,
): Promise<string | null> {
  if (!(await exists(src))) {
    return null
  }

  if (await containsParts(src)) {
    // Root of mounted images
    return src
  } else if (await containsParts(src, '.img.raw')) {
    // Mount raw images: <images>.img.raw

    // Mount the images
    let mountTmp = await createSubTmp(tmp, `sysroot/${path.basename(src)}`)
    await mountParts(src, mountTmp, spinner, '.img.raw')
    return mountTmp.dir
  } else if (await containsParts(src, '.img')) {
    // Mount potentially-sparse images: <images>.img

    // Mount the images
    let mountTmp = await createSubTmp(tmp, `sysroot/${path.basename(src)}`)
    await mountParts(src, mountTmp, spinner)
    return mountTmp.dir
  } else if (device != null && buildId != null) {
    let imagesZip = `${src}/image-${device}-${buildId}.zip`
    if (await exists(imagesZip)) {
      // Factory images - nested images package: image-$device-$buildId.zip
      return await wrapFileSrc(imagesZip, tmp, spinner)
    }

    let factoryZip = (await fs.readdir(src))
      .find(f => f.startsWith(`${device}-${buildId}-factory-`))
    if (factoryZip != undefined) {
      // Factory images zip
      return await wrapFileSrc(`${src}/${factoryZip}`, tmp, spinner)
    }
  }

  return null
}

export async function wrapSystemSrc(
  src: string,
  device: string,
  buildId: string | null,
  tmp: TempState,
  spinner: ora.Ora,
) {
  let stat = await fs.stat(src)
  if (stat.isDirectory()) {
    // Directory

    let tryDirs = [
      src,
      `${src}/${device}`,
      ...(buildId != null && [
        `${src}/${buildId}`,
        `${src}/${device}/${buildId}`,
        `${src}/${buildId}/${device}`,
      ] || []),
    ]

    // Also try to find extracted factory images: device-buildId
    if (buildId != null) {
      tryDirs.push(...tryDirs.map(p => `${p}/${device}-${buildId}`))
    }

    for (let dir of tryDirs) {
      let wrapped = await searchLeafDir(dir, device, buildId, tmp, spinner)
      if (wrapped != null) {
        spinner.text = wrapped.startsWith(tmp.dir) ? path.relative(tmp.dir, wrapped) : wrapped
        return wrapped
      }
    }

    throw new Error(`No supported source format found in '${src}'`)
  } else if (stat.isFile()) {
    // File

    // Attempt to extract factory images or OTA
    let wrapped = await wrapFileSrc(src, tmp, spinner)
    if (wrapped != null) {
      spinner.text = wrapped.startsWith(tmp.dir) ? path.relative(tmp.dir, wrapped) : wrapped
      return wrapped
    }
  }

  throw new Error(`Source '${src}' has unknown type`)
}
