import { TextEncoder } from 'util';
import {
  commands,
  Position,
  Range,
  Selection,
  TextEditor,
  TextEditorEdit,
  TextDocument,
  window,
  workspace,
  WorkspaceEdit,
  TextDocumentContentChangeEvent,
  TextDocumentChangeEvent,
  languages,
} from 'vscode';
import { cursorStyle } from '../user_interface/Viewers';
import { overrideEditorText, getTextEditor } from '../utils';
import { DocumentEvents } from './consts';
import { isExecutionEvent, isEditorEvent, createDocumentChangeEvent } from './event_creator';

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
  const edit = new WorkspaceEdit();
  actions.forEach((action) => {
    let range = action.range;
    if (action.position) {
      range = new Range(action.position, action.position);
    }
    edit.replace(dce.data.uri, range, action.text);
  });
  await workspace.applyEdit(edit);
  removeSelection();
}

/**
 * Process a document closing.
 * @param de Document event to process.
 */
async function processCloseEvent(de: DocumentEvent) {
  const data = de.data;
  await workspace.fs.writeFile(data.uri, new TextEncoder().encode(data.content));

  // During a 'Save As' action the source file reverts to previous state and closes.
  // This allows the file to be saved at its previous state and close cleanly.
  const td = getTextDocument(data.uri.path);
  if (td?.isDirty) {
    await td.save();
  }

  // There could be a situation where the active editor is not the given event's URI.
  await window.showTextDocument(data.uri, { preview: false });
  await commands.executeCommand('workbench.action.closeActiveEditor');
}

/**
 * Find given path in the workspace's text documents.
 * @param path Path to find in workspace text documents.
 * @returns Found text document or undefined.
 */
function getTextDocument(path: string): TextDocument | undefined {
  return workspace.textDocuments.find((td) => {
    return td.uri.path === path;
  });
}

/**
 * Process a creation of a document.
 * @param de Document event to process.
 */
async function processCreateEvent(de: DocumentEvent) {
  const data = de.data;

  // A document could be opened and dirty and not focused.
  const td = getTextDocument(data.uri.path);
  if (td?.isDirty) {
    // Force focus.
    await window.showTextDocument(data.uri, { preview: false });
  }

  // If the active editor is the document in an unsaved state then replace all.
  const ate = window.activeTextEditor;
  if (data.uri.path === ate?.document.uri.path && ate?.document.isDirty) {
    await ate.edit(async (tee: TextEditorEdit) => {
      const start = ate.visibleRanges[0].start as Position;
      const end = ate.visibleRanges[0].end as Position;
      tee.replace(new Range(start, end), data.content);
    });

    await ate.document.save();
  } else {
    // @TODO: Check if encode parameter can be undefined
    const content = data.content ? new TextEncoder().encode(data.content) : new Uint8Array();
    await workspace.fs.writeFile(data.uri, content);
  }

  await window.showTextDocument(data.uri, { preview: false });
}

/**
 * Process the deleting of a document.
 * @param de Document event to process.
 */
async function processDeleteEvent(de: DocumentEvent) {
  try {
    const data = de.data;

    if (data.isUntitled) {
      await window.showTextDocument(data.uri, { preview: false });
      await commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      return;
    }

    // Closing an unsaved document will pop-up a dialog.
    const td = getTextDocument(data.uri.path);
    if (td?.isDirty) {
      await td.save();
    }

    await window.showTextDocument(data.uri, { preview: false });
    await commands.executeCommand('workbench.action.closeActiveEditor');
    await workspace.fs.delete(data.uri, { recursive: true, useTrash: true });
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
  const td = getTextDocument(data.uri.path);

  if (data.isUntitled && !td) {
    // https://github.com/microsoft/vscode/issues/142112
    await commands.executeCommand('workbench.action.files.newUntitledFile'); // Should really return the filename created.
    // Assuming here that the file going to be worked on is created.

    const newTD = workspace.textDocuments.find((td) => {
      return td.uri.path === data.uri.path;
    });
    await languages.setTextDocumentLanguage(newTD, de.data.languageId);

    if (!data.content.length) {
      return;
    }

    const position = new Position(0, 0);
    const contentChanges = [
      <TextDocumentContentChangeEvent>{
        text: data.content,
        range: new Range(position, position),
        rangeLength: 0,
        rangeOffset: 0,
      },
    ];
    const tdce = <TextDocumentChangeEvent>{
      document: newTD,
      contentChanges,
      reason: undefined,
    };
    const evt = createDocumentChangeEvent(tdce);
    await processChangeEvent(evt);
    return;
  }

  // A document could be opened but not focused.
  await window.showTextDocument(data.uri, { preview: false });
  await languages.setTextDocumentLanguage(td, de.data.languageId);

  // If the active editor is the document in an unsaved state or untitled then replace all.
  const ate = window.activeTextEditor;
  if (ate?.document.isDirty || ate?.document.isUntitled) {
    await ate.edit(async (tee: TextEditorEdit) => {
      const start = ate.visibleRanges[0].start as Position;
      const end = ate.visibleRanges[0].end as Position;
      tee.replace(new Range(start, end), data.content);
    });

    if (!ate.document.isUntitled) {
      await ate.document.save();
    }
  } else {
    await workspace.fs.writeFile(data.uri, new TextEncoder().encode(data.content));
  }

  removeSelection();
}

/**
 * Process the renaming of a document.
 * @param dre Document rename event to process.
 */
async function processRenameEvent(dre: DocumentRenameEvent) {
  const src = dre.data.oldUri;
  const dest = dre.data.newUri;
  const content = dre.data.content;

  await workspace.fs.writeFile(src, new TextEncoder().encode(content));
  await workspace.fs.rename(src, dest, { overwrite: true });
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
    await workspace.fs.writeFile(data.uri, new TextEncoder().encode(data.content));
  }

  await window.showTextDocument(data.uri, { preview: false });
  await window.activeTextEditor.document.save();
}

async function processSelectionEvent(dse: DocumentSelectionEvent) {
  const data = dse.data;
  const RangesToDecorate = data.selections.map((selection: Selection) => {
    return new Range(selection.anchor, selection.active);
  });
  const textDocumentToDecorate: TextEditor = window.visibleTextEditors.find(
    (editor) => editor.document.uri.path === data.uri.path,
  );
  if (textDocumentToDecorate) {
    textDocumentToDecorate.setDecorations(cursorStyle, RangesToDecorate);
  }

  await window.showTextDocument(data.uri, { preview: false });
}

function processVisibleRangeEvent(dvre: DocumentVisibleRangeEvent) {
  const textEditor: TextEditor = window.visibleTextEditors.find(
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
    const outputChannel = window.createOutputChannel('codioReplay');
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
  await window.showTextDocument(event.data.uri, {
    viewColumn: event.data.viewColumn,
    preview: true,
  });
  const textEditor: TextEditor = window.visibleTextEditors.find(
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
    const textEditor: TextEditor = getTextEditor(event.data.uri.path);
    if (textEditor) {
      try {
        if (textEditor.viewColumn === event.data.viewColumn) {
          await window.showTextDocument(textEditor.document, {
            viewColumn: event.data.viewColumn,
            preview: true,
          });
        } else {
          await workspace.saveAll();
          await window.showTextDocument(textEditor.document, {
            viewColumn: textEditor.viewColumn,
          });
          await commands.executeCommand('workbench.action.closeActiveEditor');
          await window.showTextDocument(textEditor.document, {
            viewColumn: event.data.viewColumn,
            preview: true,
          });
        }
        textEditor.revealRange(event.data.visibleRange);
      } catch (e) {
        console.log('bagabaga faillll', { e, event });
      }
    } else {
      await window.showTextDocument(event.data.uri, {
        viewColumn: event.data.viewColumn,
        preview: true,
      });
      const textEditor = getTextEditor(event.data.uri.path);
      textEditor.revealRange(event.data.visibleRange);
    }
  }
}

export function removeSelection(): void {
  console.log('removeSelection', window.visibleTextEditors);
  window.visibleTextEditors.map((editor: TextEditor) => {
    editor.setDecorations(cursorStyle, []);
  });
}
