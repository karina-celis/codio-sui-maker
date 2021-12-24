import { asyncForEach, overrideEditorText } from '../../utils';
import { TextEditor, window, commands } from 'vscode';

export async function applyFrame(frame: CodioFrame): Promise<void> {
  await asyncForEach(frame, async (file: CodioFile) => {
    console.log('applyFrame file', file);

    // Find editor with current file path
    const textEditor: TextEditor = window.visibleTextEditors.find(
      (editor) => editor.document.uri.path === file.uri.path,
    );

    // Show correct column and close active editor
    if (textEditor && textEditor.viewColumn !== file.column) {
      await window.showTextDocument(textEditor.document, { viewColumn: textEditor.viewColumn });
      await commands.executeCommand('workbench.action.closeActiveEditor');
    }

    // Update editor with file document text.
    const editor = await window.showTextDocument(file.uri, { viewColumn: file.column, preview: false });
    console.log('applyFrame', { text: file.document.text, editorPath: editor.document.uri.path, originPath: file.uri });
    await overrideEditorText(editor, file.document.text);
  });
}
