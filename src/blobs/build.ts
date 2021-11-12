import * as path from 'path'
import { promises as fs } from 'fs'

import { blobToFileCopy, BoardMakefile, ModulesMakefile, ProductMakefile, sanitizeBasename, serializeBoardMakefile, serializeModulesMakefile, serializeProductMakefile, Symlink } from '../build/make'
import { blobToSoongModule, serializeBlueprint, SharedLibraryModule, SoongBlueprint, SoongModule, SPECIAL_FILE_EXTENSIONS, TYPE_SHARED_LIBRARY } from '../build/soong'
import { BlobEntry, blobNeedsSoong } from './entry'

export interface BuildFiles {
  blueprint: SoongBlueprint
  modulesMakefile: ModulesMakefile
  productMakefile: ProductMakefile
  boardMakefile: BoardMakefile
}

export interface VendorDirectories {
  outDir: string
  proprietaryDir: string
  fwDir: string
  overlaysDir: string
}

function nameDepKey(entry: BlobEntry) {
  let ext = path.extname(entry.path)
  return `${ext == '.xml' ? 1 : 0}${entry.isNamedDependency ? 0 : 1}${entry.srcPath}`
}

export async function generateBuild(
  iterEntries: Iterable<BlobEntry>,
  device: string,
  vendor: string,
  source: string,
  proprietaryDir: string,
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
    let srcPath = `${source}/${entry.srcPath}`
    let stat = await fs.lstat(srcPath)

    if (stat.isSymbolicLink()) {
      // Symlink -> Make module, regardless of file extension

      let targetPath = await fs.readlink(srcPath)
      let moduleName = `symlink__${sanitizeBasename(entry.srcPath)}`

      // Create link info
      symlinks.push({
        moduleName: moduleName,
        linkPartition: entry.partition,
        linkSubpath: entry.path,
        targetPath: targetPath,
      } as Symlink)
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
        if (conflictModule._type == TYPE_SHARED_LIBRARY &&
              (conflictModule as SharedLibraryModule).compile_multilib == 'both' &&
              conflictModule._entry?.path.split('/').at(-1) == pathParts.at(-1)) {
          // Same partition = skip arch variant
          if (conflictModule._entry?.partition == entry.partition) {
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
    copyFiles.push(blobToFileCopy(entry, proprietaryDir))
  }

  let buildPackages = Array.from(namedModules.keys())
  buildPackages.push(...symlinks.map(l => l.moduleName))

  return {
    blueprint: {
      modules: namedModules.values(),
    },
    modulesMakefile: {
      device: device,
      vendor: vendor,
      symlinks: symlinks,
    },
    productMakefile: {
      namespaces: [proprietaryDir],
      packages: buildPackages,
      copyFiles: copyFiles,
    },
    boardMakefile: {},
  } as BuildFiles
}

export async function createVendorDirs(vendor: string, device: string) {
  let outDir = `vendor/${vendor}/${device}`
  await fs.rm(outDir, { force: true, recursive: true })
  await fs.mkdir(outDir, { recursive: true })

  let proprietaryDir = `${outDir}/proprietary`
  await fs.mkdir(proprietaryDir, { recursive: true })

  let fwDir = `${proprietaryDir}/firmware`
  await fs.mkdir(fwDir, { recursive: true })

  let overlaysDir = `${proprietaryDir}/overlays`
  await fs.mkdir(overlaysDir, { recursive: true })

  return {
    outDir: outDir,
    proprietaryDir: proprietaryDir,
    fwDir: fwDir,
    overlaysDir: overlaysDir,
  } as VendorDirectories
}

export async function writeBuildFiles(build: BuildFiles, proprietaryDir: string) {
  let blueprint = serializeBlueprint(build.blueprint)
  await fs.writeFile(`${proprietaryDir}/Android.bp`, blueprint)

  let modulesMakefile = serializeModulesMakefile(build.modulesMakefile)
  await fs.writeFile(`${proprietaryDir}/Android.mk`, modulesMakefile)

  let productMakefile = serializeProductMakefile(build.productMakefile)
  await fs.writeFile(`${proprietaryDir}/device-vendor.mk`, productMakefile)

  let boardMakefile = serializeBoardMakefile(build.boardMakefile)
  await fs.writeFile(`${proprietaryDir}/BoardConfigVendor.mk`, boardMakefile)
}
