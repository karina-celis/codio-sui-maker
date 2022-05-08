const CODIO_EDITOR_CHANGED = 'editor';
const CODIO_EXEC = 'exec';

enum DocumentEvents {
  DOCUMENT_CHANGE,
  DOCUMENT_CLOSE,
  DOCUMENT_CREATE,
  DOCUMENT_DELETE,
  DOCUMENT_OPEN,
  DOCUMENT_RENAME,
  DOCUMENT_SAVE,
  DOCUMENT_SELECTION,
  DOCUMENT_VISIBLE_RANGE,
  DOCUMENT_FOLD,
  DOCUMENT_VISIBLE,
  DOCUMENT_VIEW_COLUMN,
  DOCUMENT_GROUP,
  DOCUMENT_UNGROUP,
}

export { CODIO_EDITOR_CHANGED, CODIO_EXEC, DocumentEvents };
