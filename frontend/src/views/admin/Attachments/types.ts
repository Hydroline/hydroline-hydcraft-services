export type VisibilityModeOption = 'inherit' | 'public' | 'restricted'

export type AttachmentFolderEntry = {
  id: string
  name: string
  path: string
  parentId: string | null
  description?: string | null
  visibilityMode?: VisibilityModeOption | 'PUBLIC' | 'RESTRICTED' | 'INHERIT'
  visibilityRoles?: string[]
  visibilityLabels?: string[]
}

export type AttachmentTagEntry = {
  id: string
  key: string
  name: string
  description?: string | null
}

export type BatchUploadRow = {
  id: string
  file: File
  name: string
  description: string
  tagKeys: string[]
  visibilityMode: VisibilityModeOption
  visibilityRoles: string[]
  visibilityLabels: string[]
  status: 'pending' | 'uploading' | 'done' | 'error'
  errorMessage?: string
}
