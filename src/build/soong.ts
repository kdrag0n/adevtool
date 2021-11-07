import * as util from 'util'

import { BlobEntry } from '../blobs/entry'

export interface TargetSrcs {
  srcs: Array<string>
}

export interface SharedLibraryModule {
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

export interface ApkModule {
  apk: string
  certificate?: string
  presigned?: boolean
  privileged?: boolean
  dex_preopt: {
    enabled: boolean
  }
}

export interface JarModule {
  jars: Array<string>
}

export interface EtcXmlModule {
  src: string
  filename_from_src: boolean
  sub_dir: string
}

export type SoongModuleSpecific = {
  // Type is mandatory initially, but this is deleted for serialization
  _type?: string
} & (
  SharedLibraryModule |
  ApkModule |
  JarModule |
  EtcXmlModule
)

export type SoongModule = {
  name: string
  owner: string
  system_ext_specific?: boolean
  product_specific?: boolean
  soc_specific?: boolean
} & SoongModuleSpecific

export function blobToSoongModule(
  name: string,
  ext: string,
  vendor: string,
  entry: BlobEntry,
  entrySrcPaths: Set<string>,
) {
  // Module name = file name
  let moduleSrcPath = `proprietary/${entry.srcPath}`

  // Type and info is based on file extension
  let moduleSpecific: SoongModuleSpecific
  if (ext == '.so') {
    // Extract architecture from lib dir
    let pathParts = entry.srcPath.split('/')
    let libDir = pathParts.at(-2)
    let curArch: string
    if (libDir == 'lib') {
      curArch = '32'
    } else {
      // Assume 64-bit native if not lib/lib64
      curArch = '64'
    }
    let arch = curArch

    // Check for the other arch
    let otherLibDir = arch == '32' ? 'lib64' : 'lib'
    let otherSrcPath = [
      // Preceding parts
      ...pathParts.slice(0, -2),
      // lib / lib64
      otherLibDir,
      // Trailing part (file name)
      pathParts.at(-1),
    ].join('/')
    if (entrySrcPaths.has(otherSrcPath)) {
      // Both archs are present
      arch = 'both'
    }

    // For single-arch
    let targetSrcs = {
      srcs: [moduleSrcPath],
    } as TargetSrcs

    // For multi-arch
    let targetSrcs32 = (curArch == '32') ? targetSrcs : {
      srcs: [`proprietary/${otherSrcPath}`],
    } as TargetSrcs
    let targetSrcs64 = (curArch == '64') ? targetSrcs : {
      srcs: [`proprietary/${otherSrcPath}`],
    } as TargetSrcs

    moduleSpecific = {
      _type: 'cc_prebuilt_library_shared',
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
      apk: moduleSrcPath,
      ...(entry.isPresigned && { presigned: true } || { certificate: 'platform' }),
      ...(entry.path.startsWith('priv-app/') && { privileged: true }),
      dex_preopt: {
        enabled: false,
      },
    }
  } else if (ext == '.jar') {
    moduleSpecific = {
      _type: 'dex_import',
      jars: [moduleSrcPath],
    }
  } else if (ext == '.xml') {
    // Only etc/ XMLs are supported for now
    let pathParts = entry.path.split('/')
    if (pathParts[0] != 'etc') {
      throw new Error(`XML file ${entry.srcPath} is not in etc/`)
    }

    moduleSpecific = {
      _type: 'prebuilt_etc_xml',
      src: moduleSrcPath,
      filename_from_src: true,
      sub_dir: pathParts.slice(1).join('/'),
    }
  } else {
    throw new Error(`File ${entry.srcPath} has unknown extension ${ext}`)
  }

  return {
    name: name,
    owner: vendor,
    ...moduleSpecific,

    // Partition flag
    ...(entry.partition == 'system_ext' && { system_ext_specific: true }),
    ...(entry.partition == 'product' && { product_specific: true }),
    ...(entry.partition == 'vendor' && { soc_specific: true }),
  } as SoongModule
}

export function serializeModule(module: SoongModule) {
    // Type prepended to Soong module props, so remove it from the object
    let type = module._type;
    delete module._type;

    // Initial serialization pass. Node.js util.inspect happens to be identical to Soong format.
    let serialized = util.inspect(module, {
      depth: Infinity,
      maxArrayLength: Infinity,
      maxStringLength: Infinity,
    })

    // ' -> "
    serialized = serialized.replaceAll("'", '"')
    // 4-space indentation
    serialized = serialized.replaceAll('  ', '    ')
    // Prepend type
    serialized = `${type} ${serialized}`
    // Add trailing comma to last prop
    let serialLines = serialized.split('\n')
    serialLines[serialLines.length - 2] = serialLines.at(-2) + ','
    serialized = serialLines.join('\n')

    return serialized
}

export function serializeBlueprint(modules: IterableIterator<SoongModule>) {
  // Soong pass 2: serialize module objects
  let serializedModules = []
  for (let module of modules) {
    let serialized = serializeModule(module)
    serializedModules.push(serialized)
  }

  return `// Generated by adevtool, do not edit

soong_namespace {
}

${serializedModules.join('\n\n')}
`
}
