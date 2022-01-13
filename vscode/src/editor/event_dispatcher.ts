import { TextEncoder } from 'util';
import * as vscode from 'vscode';
import { cursorStyle } from '../user_interface/Viewers';
import { overrideEditorText, getTextEditor } from '../utils';
import { DocumentEvents } from './consts';
import { isExecutionEvent, isEditorEvent } from './event_creator';

// Map of valid events.
const eventsToProcess = {
  [DocumentEvents.DOCUMENT_CHANGE]: processChangeEvent,
  [DocumentEvents.DOCUMENT_CLOSE]: processCloseEvent,
  [DocumentEvents.DOCUMENT_CREATE]: processCreateEvent,
  [DocumentEvents.DOCUMENT_DELETE]: processDeleteEvent,
  [DocumentEvents.DOCUMENT_OPEN]: processOpenEvent,
  [DocumentEvents.DOCUMENT_RENAME]: processRenameEvent,
  [DocumentEvents.DOCUMENT_SAVE]: processSaveEvent,
  [DocumentEvents.DOCUMENT_SELECTION]: processSelectionEvent,
  [DocumentEvents.DOCUMENT_VISIBLE_RANGE]: processVisibleRangeEvent,
};

/**
 * Process given event.
 * @param event Event to process.
 * @returns void.
 */
export default async function processEvent(event: CodioEvent | DocumentEvent): Promise<void> {
  try {
    if (event.type in eventsToProcess) {
      console.log(DocumentEvents[event.type], event);
      await eventsToProcess[event.type](event);
      return;
    }

    console.log('dispatchEvent', event);
    if (isExecutionEvent(event)) {
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
  const data = de.data;
  await vscode.workspace.fs.writeFile(data.uri, new TextEncoder().encode(data.content));

  // During a 'Save As' action the source file reverts to previous state and closes.
  // This allows the file to be saved at its previous state and close cleanly.
  const td = vscode.workspace.textDocuments.find((td) => {
    return td.uri.path === data.uri.path;
  });
  if (td?.isDirty) {
    await td.save();
  }

  // There could be a situation where the active editor is not the given event's URI.
  await vscode.window.showTextDocument(data.uri, { preview: false });
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
}

/**
 * Process a creation of a document.
 * @param de Document event to process.
 */
async function processCreateEvent(de: DocumentEvent) {
  const data = de.data;

  // A document could be opened and dirty and not focused.
  const foundTD = vscode.workspace.textDocuments.find((td) => {
    return td.uri.path === data.uri.path;
  });
  if (foundTD?.isDirty) {
    // Force focus.
    await vscode.window.showTextDocument(data.uri, { preview: false });
  }

  // If the active editor is the document in an unsaved state then replace all.
  const ate = vscode.window.activeTextEditor;
  if (data.uri.path === ate?.document.uri.path && ate?.document.isDirty) {
    await ate.edit(async (tee: vscode.TextEditorEdit) => {
      const start = ate.visibleRanges[0].start as vscode.Position;
      const end = ate.visibleRanges[0].end as vscode.Position;
      tee.replace(new vscode.Range(start, end), data.content);
    });

    await ate.document.save();
  } else {
    // @TODO: Check if encode parameter can be undefined
    const content = data.content ? new TextEncoder().encode(data.content) : new Uint8Array();
    await vscode.workspace.fs.writeFile(data.uri, content);
  }

  await vscode.window.showTextDocument(data.uri, { preview: false });
}

/**
 * Process the deleting of a document.
 * @param de Document event to process.
 */
async function processDeleteEvent(de: DocumentEvent) {
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
  const data = de.data;

  // A document could be opened and dirty and not focused.
  const foundTD = vscode.workspace.textDocuments.find((td) => {
    return td.uri.path === data.uri.path;
  });
  if (foundTD?.isDirty) {
    // Force focus.
    await vscode.window.showTextDocument(data.uri, { preview: false });
  }

  // If the active editor is the document in an unsaved state then replace all.
  const ate = vscode.window.activeTextEditor;
  if (data.uri.path === ate?.document.uri.path && ate?.document.isDirty) {
    await ate.edit(async (tee: vscode.TextEditorEdit) => {
      const start = ate.visibleRanges[0].start as vscode.Position;
      const end = ate.visibleRanges[0].end as vscode.Position;
      tee.replace(new vscode.Range(start, end), data.content);
    });

    await ate.document.save();
  } else {
    await vscode.workspace.fs.writeFile(data.uri, new TextEncoder().encode(data.content));
  }

  await vscode.window.showTextDocument(data.uri, { preview: false });
}

/**
 * Process the renaming of a document.
 * @param dre Document rename event to process.
 */
async function processRenameEvent(dre: DocumentRenameEvent) {
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

async function processSelectionEvent(dse: DocumentSelectionEvent) {
  const data = dse.data;
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

function processVisibleRangeEvent(dvre: DocumentVisibleRangeEvent) {
  const textEditor: vscode.TextEditor = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.path === dvre.data.uri.path,
  );
  if (textEditor) {
    textEditor.revealRange(dvre.data.visibleRange);
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

export function removeSelection(): void {
  vscode.window.visibleTextEditors.map((editor) => {
    editor.setDecorations(cursorStyle, []);
  });
}
