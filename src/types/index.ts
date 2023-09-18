interface File {
  readonly name: string
  readonly type: string
  readonly code?: string
}

interface Folder {
  readonly name: string
  readonly files: File[]
  readonly path?: string
}

export {
  File,
  Folder,
}
