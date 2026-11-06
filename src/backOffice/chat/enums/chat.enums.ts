// src/backOffice/chat/enums/chat.enums.ts

export enum ConversationType {
  DIRECT = 'DIRECT',
  GROUP = 'GROUP',
}

export enum ParticipantRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT', // pdf, word, excel, powerpoint, zip, txt...
  MIXED = 'MIXED', // plusieurs pièces jointes de types différents
  SYSTEM = 'SYSTEM', // "X a ajouté Y au groupe", etc.
}

/** Aligné sur UploadedFileKind de FilesService (+ OTHER) */
export enum AttachmentType {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO',
  AUDIO = 'AUDIO',
  PDF = 'PDF',
  DOCUMENT = 'DOCUMENT',
  OTHER = 'OTHER',
}
