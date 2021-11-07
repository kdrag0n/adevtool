import * as path from 'path'
import * as util from 'util'

import { BlobEntry, partPathToSrcPath } from '../blobs/entry'

export const SPECIAL_FILE_EXTENSIONS = new Set([
  '.so',
  '.apk',
  '.jar',
  '.xml',
  '.apex',
])

export interface TargetSrcs {
  srcs: Array<string>
}

export interface SharedLibraryModule {
  stem: string
  relative_install_path?: string
  strip: {
    none: boolean
  }
  target: {
    android_arm?: TargetSrcs
    android_arm64?: TargetSrcs
  }
  compile_multilib: string
  check_elf_files: boolean
  prefer: boolean
}

export interface ExecutableModule {
  srcs: Array<string>
  stem: string
  relative_install_path?: string
  check_elf_files: boolean
  prefer: boolean
}

export interface ScriptModule {
  src: string
  relative_install_path?: string
}

export interface ApkModule {
  apk: string
  certificate?: string
  presigned?: boolean
  privileged?: boolean
  dex_preopt: {
    enabled: boolean
  }
}

export interface ApexModule {
  src: string
  prefer: boolean
}

export interface JarModule {
  jars: Array<string>
}

export interface EtcXmlModule {
  src: string
  filename_from_src: boolean
  sub_dir?: string
}

export interface DspModule {
  src: string
  sub_dir?: string
}

export type SoongModuleSpecific = {
  // This is used initially, but deleted before serialization
  _type?: string
} & (
  SharedLibraryModule |
  ExecutableModule |
  ScriptModule |
  ApkModule |
  ApexModule |
  JarModule |
  EtcXmlModule |
  DspModule
)

export type SoongModule = {
  name: string
  owner: string
  system_ext_specific?: boolean
  product_specific?: boolean
  soc_specific?: boolean

  // This is used initially, but deleted before serialization
  _entry?: BlobEntry
} & SoongModuleSpecific

function getRelativeInstallPath(entry: BlobEntry, pathParts: Array<string>, installDir: string) {
  if (pathParts[0] != installDir) {
    throw new Error(`File ${entry.srcPath} is not in ${installDir}`)
  }

  let subpath = pathParts.slice(1, -1).join('/')
  return subpath.length == 0 ? null : subpath;
}

export function blobToSoongModule(
  name: string,
  ext: string,
  vendor: string,
  entry: BlobEntry,
  entrySrcPaths: Set<string>,
) {
  let pathParts = entry.path.split('/')

  // Type and info is based on file extension
  let moduleSpecific: SoongModuleSpecific
  // High-precedence extension-based types first
  if (ext == '.sh') { // check before bin/ to catch .sh files in bin
    let relPath = getRelativeInstallPath(entry, pathParts, 'bin')

    moduleSpecific = {
      _type: 'sh_binary',
      src: entry.srcPath,
      ...(relPath && { relative_install_path: relPath }),
    }
  // Then special paths
  } else if (pathParts[0] == 'bin') {
    let relPath = getRelativeInstallPath(entry, pathParts, 'bin')

    moduleSpecific = {
      _type: 'cc_prebuilt_binary',
      srcs: [entry.srcPath],
      stem: path.basename(entry.path),
      ...(relPath && { relative_install_path: relPath }),
      check_elf_files: false,
      prefer: true,
    }
  } else if (pathParts[0] == 'dsp') {
    let relPath = getRelativeInstallPath(entry, pathParts, 'dsp')

    moduleSpecific = {
      _type: 'prebuilt_dsp',
      src: entry.srcPath,
      ...(relPath && { sub_dir: relPath }),
    }
  // Then other extension-based types
  } else if (ext == '.so') {
    // Extract architecture from lib dir
    let libDir = pathParts.at(0)!
    let curArch: string
    if (libDir == 'lib') {
      curArch = '32'
    } else if (libDir == 'lib64') {
      curArch = '64'
    } else {
      throw new Error(`File ${entry.srcPath} is in unknown lib dir ${libDir}`)
    }
    // Save current lib arch before changing to 'both' for multilib
    let arch = curArch

    // Get install path relative to lib dir
    let relPath = getRelativeInstallPath(entry, pathParts, libDir)

    // Check for the other arch
    let otherLibDir = arch == '32' ? 'lib64' : 'lib'
    let otherPartPath = [otherLibDir, ...pathParts.slice(1)].join('/')
    let otherSrcPath = partPathToSrcPath(entry.partition, otherPartPath)
    if (entrySrcPaths.has(otherSrcPath)) {
      // Both archs are present
      arch = 'both'
    }

    // For single-arch
    let targetSrcs = {
      srcs: [entry.srcPath],
    } as TargetSrcs

    // For multi-arch
    let targetSrcs32 = (curArch == '32') ? targetSrcs : {
      srcs: [otherSrcPath],
    } as TargetSrcs
    let targetSrcs64 = (curArch == '64') ? targetSrcs : {
      srcs: [otherSrcPath],
    } as TargetSrcs

    moduleSpecific = {
      _type: 'cc_prebuilt_library_shared',
      stem: path.basename(entry.path, '.so'),
      ...(relPath && { relative_install_path: relPath }),
      strip: {
        none: true,
      },
      target: {
        ...(arch == '32' && { android_arm: targetSrcs }),
        ...(arch == '64' && { android_arm64: targetSrcs }),
        ...(arch == 'both' && {
          android_arm: targetSrcs32,
          android_arm64: targetSrcs64,
        }),
      },
      compile_multilib: arch,
      check_elf_files: false,
      prefer: true,
    }
  } else if (ext == '.apk') {
    moduleSpecific = {
      _type: 'android_app_import',
      apk: entry.srcPath,
      ...(entry.isPresigned && { presigned: true } || { certificate: 'platform' }),
      ...(entry.path.startsWith('priv-app/') && { privileged: true }),
      dex_preopt: {
        enabled: false,
      },
    }
  } else if (ext == '.jar') {
    moduleSpecific = {
      _type: 'dex_import',
      jars: [entry.srcPath],
    }
  } else if (ext == '.xml') {
    let relPath = getRelativeInstallPath(entry, pathParts, 'etc')

    moduleSpecific = {
      _type: 'prebuilt_etc_xml',
      src: entry.srcPath,
      filename_from_src: true,
      ...(relPath && { sub_dir: relPath }),
    }
  } else if (ext == '.apex') {
    moduleSpecific = {
      _type: 'prebuilt_apex',
      src: entry.srcPath,
      prefer: true,
    }
  } else {
    throw new Error(`File ${entry.srcPath} has unknown extension ${ext}`)
  }

  return {
    name: name,
    owner: vendor,
    ...moduleSpecific,
    _entry: entry,

    // Partition flag
    ...(entry.partition == 'system_ext' && { system_ext_specific: true }),
    ...(entry.partition == 'product' && { product_specific: true }),
    ...(entry.partition == 'vendor' && { soc_specific: true }),
    ...(entry.partition == 'odm' && { device_specific: true }),
  } as SoongModule
}

export function serializeModule(module: SoongModule) {
    // Type is prepended to Soong module props, so remove it from the object
    let type = module._type
    delete module._type

    // Delete internal blob entry reference as well
    delete module._entry

    // Initial serialization pass. Node.js util.inspect happens to be identical to Soong format.
    let serialized = util.inspect(module, {
      depth: Infinity,
      maxArrayLength: Infinity,
      maxStringLength: Infinity,
      breakLength: 100,
    })

    // ' -> "
    serialized = serialized.replaceAll("'", '"')
    // 4-space indentation
    serialized = serialized.replaceAll('  ', '    ')
    // Prepend type
    serialized = `${type} ${serialized}`
    // Add trailing comma to last prop
    let serialLines = serialized.split('\n')
    if (serialLines.length > 1) {
      serialLines[serialLines.length - 2] = serialLines.at(-2) + ','
      serialized = serialLines.join('\n')
    }

    return serialized
}

export function serializeBlueprint(modules: IterableIterator<SoongModule>) {
  // Soong pass 2: serialize module objects
  let serializedModules = []
  for (let module of modules) {
    let serialized = serializeModule(module)
    serializedModules.push(serialized)
  }

  return `// Generated by adevtool; do not edit

soong_namespace {
}

${serializedModules.join('\n\n')}
`
}
