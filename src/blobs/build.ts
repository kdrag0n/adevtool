import path from 'path'
import { promises as fs } from 'fs'

import {
  blobToFileCopy,
  BoardMakefile,
  ModulesMakefile,
  DeviceMakefile,
  sanitizeBasename,
  serializeBoardMakefile,
  serializeModulesMakefile,
  serializeDeviceMakefile,
  Symlink,
  ProductsMakefile,
  ProductMakefile,
  serializeProductMakefile,
  serializeProductsMakefile,
} from '../build/make'
import {
  blobToSoongModule,
  serializeBlueprint,
  SharedLibraryModule,
  SoongBlueprint,
  SoongModule,
  SPECIAL_FILE_EXTENSIONS,
  TYPE_SHARED_LIBRARY,
} from '../build/soong'
import { BlobEntry, blobNeedsSoong } from './entry'

export interface BuildFiles {
  rootBlueprint?: SoongBlueprint
  proprietaryBlueprint?: SoongBlueprint
  modulesMakefile?: ModulesMakefile

  deviceMakefile?: DeviceMakefile
  boardMakefile?: BoardMakefile

  productMakefile?: ProductMakefile
  productsMakefile?: ProductsMakefile
}

export interface VendorDirectories {
  out: string
  proprietary: string
  firmware: string
  overlays: string
  vintf: string
  sepolicy: string
}

function nameDepKey(entry: BlobEntry) {
  let ext = path.extname(entry.path)
  return `${ext === '.xml' ? 1 : 0}${entry.isNamedDependency ? 0 : 1}${entry.srcPath}`
}

export async function generateBuild(
  iterEntries: Iterable<BlobEntry>,
  device: string,
  vendor: string,
  source: string,
  dirs: VendorDirectories,
) {
  // Re-sort entries to give priority to explicit named dependencies in name
  // conflict resolution. XMLs are also de-prioritized because they have
  // filename_from_src.
  let entries = Array.from(iterEntries).sort((a, b) => nameDepKey(a).localeCompare(nameDepKey(b)))

  // Fast lookup for other arch libs
  let entrySrcPaths = new Set(entries.map(e => e.srcPath))

  // Create Soong modules, Make rules, and symlink modules
  let copyFiles = []
  let symlinks = []
  let namedModules = new Map<string, SoongModule>()
  let conflictCounters = new Map<string, number>()
  for (let entry of entries) {
    let ext = path.extname(entry.path)
    let pathParts = entry.path.split('/')
    let srcPath = entry.diskSrcPath ?? `${source}/${entry.srcPath}`
    let stat = await fs.lstat(srcPath)

    if (stat.isSymbolicLink()) {
      // Symlink -> Make module, regardless of file extension

      let targetPath = await fs.readlink(srcPath)
      let moduleName = `symlink__${sanitizeBasename(entry.srcPath)}`

      // Create link info
      symlinks.push({
        moduleName,
        linkPartition: entry.partition,
        linkSubpath: entry.path,
        targetPath,
      } as Symlink)
      continue
    } else if (blobNeedsSoong(entry, ext)) {
      // Named dependencies -> Soong blueprint

      // Module name = file name, excluding extension if it was used
      let baseExt = SPECIAL_FILE_EXTENSIONS.has(ext) ? ext : undefined
      let name = path.basename(entry.path, baseExt)

      // If already exists: skip if it's the other arch variant of a library in
      // the same partition AND has the same name (incl. ext), otherwise rename the
      // module to avoid conflict
      let needsMakeFallback = false
      if (namedModules.has(name)) {
        let conflictModule = namedModules.get(name)!
        if (
          conflictModule._type === TYPE_SHARED_LIBRARY &&
          (conflictModule as SharedLibraryModule).compile_multilib === 'both' &&
          conflictModule._entry?.path.split('/').at(-1) === pathParts.at(-1)
        ) {
          // Same partition = skip arch variant
          if (conflictModule._entry?.partition === entry.partition) {
            continue
          } else {
            // Fall back to PRODUCT_COPY_FILES for cross-partition conflicts.
            // TODO: resolve cross-platform conflicts without overrides
            needsMakeFallback = true
          }
        }

        // Increment conflict counter and append to name
        let conflictNum = (conflictCounters.get(name) ?? 1) + 1
        conflictCounters.set(name, conflictNum)
        name += `__${conflictNum}`
      }

      if (!needsMakeFallback) {
        let module = blobToSoongModule(name, ext, vendor, entry, entrySrcPaths)
        namedModules.set(name, module)
        continue
      }
    }

    // Other files (and failed Soong files) -> Kati Makefile

    // Simple PRODUCT_COPY_FILES line
    copyFiles.push(blobToFileCopy(entry, dirs.proprietary))
  }

  let buildPackages = Array.from(namedModules.keys())
  if (symlinks.length > 0) {
    buildPackages.push('device_symlinks')
  }

  return {
    rootBlueprint: {
      namespace: true,
    },
    proprietaryBlueprint: {
      modules: namedModules.values(),
    },
    modulesMakefile: {
      device,
      vendor,
      symlinks,
    },
    deviceMakefile: {
      namespaces: [dirs.out],
      packages: buildPackages,
      copyFiles,
    },
  } as BuildFiles
}

export async function createVendorDirs(vendor: string, device: string) {
  let outDir = `vendor/${vendor}/${device}`
  await fs.rm(outDir, { force: true, recursive: true })
  await fs.mkdir(outDir, { recursive: true })

  let proprietaryDir = `${outDir}/proprietary`
  await fs.mkdir(proprietaryDir, { recursive: true })

  let fwDir = `${outDir}/firmware`
  await fs.mkdir(fwDir, { recursive: true })

  let overlaysDir = `${outDir}/overlays`
  await fs.mkdir(overlaysDir, { recursive: true })

  let vintfDir = `${outDir}/vintf`
  await fs.mkdir(vintfDir, { recursive: true })

  let sepolicyDir = `${outDir}/sepolicy`
  await fs.mkdir(sepolicyDir, { recursive: true })

  return {
    out: outDir,
    proprietary: proprietaryDir,
    firmware: fwDir,
    overlays: overlaysDir,
    vintf: vintfDir,
    sepolicy: sepolicyDir,
  } as VendorDirectories
}

export async function writeBuildFiles(build: BuildFiles, dirs: VendorDirectories) {
  if (build.rootBlueprint !== undefined) {
    let bp = serializeBlueprint(build.rootBlueprint)
    await fs.writeFile(`${dirs.out}/Android.bp`, bp)
  }

  if (build.proprietaryBlueprint !== undefined) {
    let bp = serializeBlueprint(build.proprietaryBlueprint)
    await fs.writeFile(`${dirs.proprietary}/Android.bp`, bp)
  }

  if (build.modulesMakefile !== undefined) {
    let mk = serializeModulesMakefile(build.modulesMakefile)
    await fs.writeFile(`${dirs.out}/Android.mk`, mk)
  }

  if (build.deviceMakefile !== undefined) {
    let mk = serializeDeviceMakefile(build.deviceMakefile)
    await fs.writeFile(`${dirs.proprietary}/device-vendor.mk`, mk)
  }

  if (build.boardMakefile !== undefined) {
    let mk = serializeBoardMakefile(build.boardMakefile)
    await fs.writeFile(`${dirs.proprietary}/BoardConfigVendor.mk`, mk)
  }

  if (build.productMakefile !== undefined) {
    let mk = serializeProductMakefile(build.productMakefile)
    await fs.writeFile(`${dirs.out}/${build.productMakefile.name}.mk`, mk)
  }

  if (build.productsMakefile !== undefined) {
    let mk = serializeProductsMakefile(build.productsMakefile)
    await fs.writeFile(`${dirs.out}/AndroidProducts.mk`, mk)
  }
}
