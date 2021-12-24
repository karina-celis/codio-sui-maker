import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import { cursorStyle } from '../user_interface/Viewers';
import { overrideEditorText, getTextEditor } from '../utils';
import { DocumentEvents } from './consts';
import { isSelectionEvent, isVisibleRangeEvent, isExecutionEvent, isEditorEvent } from './event_creator';

// Map of valid events.
const eventsToProcess = {
  [DocumentEvents.DOCUMENT_CHANGE]: processChangeEvent,
  [DocumentEvents.DOCUMENT_CLOSE]: processCloseEvent,
  [DocumentEvents.DOCUMENT_CREATE]: processCreateEvent,
  [DocumentEvents.DOCUMENT_DELETE]: processDeleteEvent,
  [DocumentEvents.DOCUMENT_OPEN]: processOpenEvent,
  [DocumentEvents.DOCUMENT_RENAME]: processRenameEvent,
  [DocumentEvents.DOCUMENT_SAVE]: processSaveEvent,
};

/**
 * Process given event.
 * @param event Event to process.
 * @returns void.
 */
export default async function processEvent(event: CodioEvent | DocumentEvent): Promise<void> {
  try {
    if (event.type in eventsToProcess) {
      await eventsToProcess[event.type](event);
      return;
    }

    console.log('dispatchEvent', event);
    if (isSelectionEvent(event)) {
      dispatchSelectionEvent(event);
    } else if (isVisibleRangeEvent(event)) {
      dispatchVisibleRangeEvent(event);
    } else if (isExecutionEvent(event)) {
      dispatchExecutionEvent(event);
    } else if (isEditorEvent(event)) {
      await dispatchEditorEvent(event);
    }
  } catch (e) {
    console.log('Failed to dispatch codio action', e);
  }
}

/**
 * Process a change in a document.
 * @param dce Event to process.
 */
async function processChangeEvent(dce: DocumentChangeEvent) {
  console.log(DocumentEvents[dce.type], dce);

  const actions = dce.data.changes;
  const edit = new vscode.WorkspaceEdit();
  actions.forEach((action) => {
    if (action.position) {
      edit.replace(dce.data.uri, new vscode.Range(action.position, action.position), action.value);
    } else if (action.range) {
      edit.replace(dce.data.uri, action.range, action.value);
    }
  });
  await vscode.workspace.applyEdit(edit);
}

/**
 * Process a document closing.
 * @param de Document event to process.
 */
async function processCloseEvent(de: DocumentEvent) {
  console.log(DocumentEvents[de.type], de);

  // During a 'Save As' action the source file reverts to previous state and closes.
  // This allows the file to be saved at its previous state and close cleanly.
  const td = vscode.workspace.textDocuments.find((td) => {
    return td.uri.path === de.data.uri.path;
  });
  if (td.isDirty) {
    await td.save();
  }

  // There could be a situation where the active editor is not the given event's URI.
  await vscode.window.showTextDocument(de.data.uri, { preview: false });
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

/**
 * Process a creation of a document.
 * @param de Document event to process.
 */
async function processCreateEvent(de: DocumentEvent) {
  console.log(DocumentEvents[de.type], de);
  await vscode.workspace.fs.writeFile(de.data.uri, new Uint8Array());
  await vscode.window.showTextDocument(de.data.uri, { preview: false });
}

/**
 * Process the deleting of a document.
 * @param de Document event to process.
 */
async function processDeleteEvent(de: DocumentEvent) {
  console.log(DocumentEvents[de.type], de);
  try {
    await vscode.workspace.fs.delete(de.data.uri, { recursive: true, useTrash: true });
  } catch (error) {
    console.warn(error.message);
  }
}

/**
 * Process opening a document.
 * @param de Document event to process.
 */
async function processOpenEvent(de: DocumentEvent) {
  console.log(DocumentEvents[de.type], de);

  // If the active editor is the document in an unsaved state then replace all.
  const ate = vscode.window.activeTextEditor;
  if (de.data.uri.path === ate?.document.uri.path && ate?.document.isDirty) {
    await ate.edit(async (tee: vscode.TextEditorEdit) => {
      const start = ate.visibleRanges[0].start as vscode.Position;
      const end = ate.visibleRanges[0].end as vscode.Position;
      tee.replace(new vscode.Range(start, end), de.data.content);
    });

    await ate.document.save();
  } else {
    await vscode.workspace.fs.writeFile(de.data.uri, new TextEncoder().encode(de.data.content));
  }

  await vscode.window.showTextDocument(de.data.uri, { preview: false });
}

/**
 * Process the renaming of a document.
 * @param dre Document rename event to process.
 */
async function processRenameEvent(dre: DocumentRenameEvent) {
  console.log(DocumentEvents[dre.type], dre);

  const src = dre.data.oldUri;
  const dest = dre.data.newUri;
  const content = dre.data.content;

  await vscode.workspace.fs.writeFile(src, new TextEncoder().encode(content));
  await vscode.workspace.fs.rename(src, dest, { overwrite: true });
}

/**
 * Process the saving of a document.
 * @param de Document event to process.
 */
async function processSaveEvent(de: DocumentEvent) {
  console.log(DocumentEvents[de.type], de);

  // Update file that could have been deleted before this event.
  const data = de.data;
  if (data.content) {
    /**
     * Workspace's setting's option:
     * { "files.saveConflictResolution": "overwriteFileOnDisk" }
     * ignores save conflicts. e.g.,
     * (Error: File Modified Since)
     * The content of the file is newer.
     * @note https://github.com/microsoft/vscode/issues/77387
     **/
    await vscode.workspace.fs.writeFile(data.uri, new TextEncoder().encode(data.content));
  }

  await vscode.window.showTextDocument(data.uri, { preview: false });
  await vscode.window.activeTextEditor.document.save();
}

async function dispatchSelectionEvent(event: CodioSelectionEvent) {
  const data = event.data;
  const RangesToDecorate = data.selections.map((selection: vscode.Selection) => {
    return new vscode.Range(selection.anchor, selection.active);
  });
  const textDocumentToDecorate: vscode.TextEditor = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.path === data.uri.path,
  );
  if (textDocumentToDecorate) {
    textDocumentToDecorate.setDecorations(cursorStyle, RangesToDecorate);
  }

  await vscode.window.showTextDocument(data.uri, { preview: false });
}

function dispatchVisibleRangeEvent(event: CodioVisibleRangeEvent) {
  const textEditor: vscode.TextEditor = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.path === event.data.uri.path,
  );
  if (textEditor) {
    textEditor.revealRange(event.data.visibleRange);
  }
}

// DEPRECATED
function dispatchExecutionEvent(event: CodioExecutionEvent) {
  console.log('dispatchExecutionEvent DEPRECATED');
  try {
    const outputChannel = vscode.window.createOutputChannel('codioReplay');
    outputChannel.show(true);
    outputChannel.append(event.data.executionOutput);
  } catch (e) {
    console.log('output error', e);
  }
}

// DEPRECATED
function isEditorShownForFirstTime(event: CodioChangeActiveEditorEvent) {
  console.log('isEditorShownForFirstTime DEPRECATED');
  return !!event.data.isInitial;
}

// DEPRECATED
async function dispatchEditorShownFirstTime(event: CodioChangeActiveEditorEvent) {
  console.log('dispatchEditorShownFirstTime DEPRECATED');
  await vscode.window.showTextDocument(event.data.uri, {
    viewColumn: event.data.viewColumn,
    preview: true,
  });
  const textEditor: vscode.TextEditor = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.path === event.data.uri.path,
  );
  console.log(textEditor);
  if (textEditor) {
    overrideEditorText(textEditor, event.data.content);
  }
}

// DEPRECATED
async function dispatchEditorEvent(event: CodioChangeActiveEditorEvent) {
  console.log('dispatchEditorEvent DEPRECATED');
  if (isEditorShownForFirstTime(event)) {
    dispatchEditorShownFirstTime(event);
  } else {
    const textEditor: vscode.TextEditor = getTextEditor(event.data.uri.path);
    if (textEditor) {
      try {
        if (textEditor.viewColumn === event.data.viewColumn) {
          await vscode.window.showTextDocument(textEditor.document, {
            viewColumn: event.data.viewColumn,
            preview: true,
          });
        } else {
          await vscode.workspace.saveAll();
          await vscode.window.showTextDocument(textEditor.document, {
            viewColumn: textEditor.viewColumn,
          });
          await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
          await vscode.window.showTextDocument(textEditor.document, {
            viewColumn: event.data.viewColumn,
            preview: true,
          });
        }
        textEditor.revealRange(event.data.visibleRange);
      } catch (e) {
        console.log('bagabaga faillll', { e, event });
      }
    } else {
      await vscode.window.showTextDocument(event.data.uri, {
        viewColumn: event.data.viewColumn,
        preview: true,
      });
      const textEditor = getTextEditor(event.data.uri.path);
      textEditor.revealRange(event.data.visibleRange);
    }
  }
}

export function removeSelection() {
  vscode.window.visibleTextEditors.map((editor) => {
    editor.setDecorations(cursorStyle, []);
  });
}
