import FSManager from '../../filesystem/FSManager';
import ShadowDocument from './ShadowDocument';
import { Uri } from 'vscode';

export default function deserializeFrame(frame: Array<CodioSerializedFile>, codioPath): Array<CodioFile> {
  return frame.map((file) => {
    return deserializeFile(file, codioPath);
  });
}

function deserializeFile(file: CodioSerializedFile, codioPath: string): CodioFile {
  return {
    uri: Uri.joinPath(Uri.file(codioPath), file.path),
    document: new ShadowDocument(file.text),
    lastAction: file.lastActionCount,
    column: file.column,
  };
}
