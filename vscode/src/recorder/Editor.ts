import {
  workspace,
  window,
  TextEditor,
  TextDocumentChangeEvent,
  TextEditorSelectionChangeEvent,
  Disposable,
  TextEditorVisibleRangesChangeEvent,
  Uri,
  TextDocument,
  FileWillDeleteEvent,
  FileWillRenameEvent,
  FileWillCreateEvent,
  TextDocumentWillSaveEvent,
  FileDeleteEvent,
  TextDocumentSaveReason,
} from 'vscode';
import { TextDecoder, TextEncoder } from 'util';
import { basename } from 'path';
import serializeEvents from '../editor/serialize';
import * as eventCreators from '../editor/event_creator';
import FSManager from '../filesystem/FSManager';
import { createRelativeTimeline } from '../editor/event_timeline';
import ShadowDocument from '../editor/frame/ShadowDocument';
import serializeFrame from '../editor/frame/serialize_frame';
import { DocumentEvents } from '../editor/consts';

export default class CodeEditorRecorder {
  onDidChangeActiveTextEditorListener: Disposable;
  onDidChangeTextEditorSelectionListener: Disposable;
  onDidChangeTextEditorVisibleRangesListener: Disposable;

  onWillCreateFilesListener: Disposable;
  onWillRenameFilesListener: Disposable;
  onWillDeleteFilesListener: Disposable;
  onWillSaveDocumentListener: Disposable;
  onDeleteDocumentListener: Disposable;
  onOpenDocumentListener: Disposable;
  onChangeDocumentListener: Disposable;
  onSaveDocumentListener: Disposable;
  onCloseDocumentListener: Disposable;

  initialFrame: Array<CodioFile> = [];
  events: Array<CodioEvent> = [];
  processPaths: Array<string> = [];

  /**
   * Save active text editor and listen to change events.
   */
  record(): void {
    const editor = window.activeTextEditor;
    if (editor) {
      this.addCodioFileToInitialFrame(new ShadowDocument(editor.document.getText()), 1, editor.document.uri, 0);

      // Filter out active document.
      const unfocusedPaths = workspace.textDocuments.filter((td) => td.uri.path !== editor.document.uri.path);
      unfocusedPaths.forEach((td) => {
        const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_OPEN, td.uri, td.getText());
        if (event) {
          this.events.push(event);
        }
      });

      // Create active document to have focus.
      const event = eventCreators.createDocumentEvent(
        DocumentEvents.DOCUMENT_OPEN,
        editor.document.uri,
        editor.document.getText(),
      );
      if (event) {
        this.events.push(event);
      }
    }

    // Text Editor Events
    this.onDidChangeActiveTextEditorListener = window.onDidChangeActiveTextEditor(this.onDidChangeActiveTextEditor, this);
    this.onDidChangeTextEditorSelectionListener = window.onDidChangeTextEditorSelection(
      this.onDidChangeTextEditorSelection,
      this,
    );
    this.onDidChangeTextEditorVisibleRangesListener = window.onDidChangeTextEditorVisibleRanges(
      this.onDidChangeTextEditorVisibleRanges,
      this,
    );

    // Workspace Text Document Events
    this.onWillCreateFilesListener = workspace.onWillCreateFiles(this.onWillCreateFiles, this);
    this.onWillRenameFilesListener = workspace.onWillRenameFiles(this.onWillRenameFiles, this);
    this.onWillDeleteFilesListener = workspace.onWillDeleteFiles(this.onWillDeleteFiles, this);
    this.onWillSaveDocumentListener = workspace.onWillSaveTextDocument(this.onWillSaveDocument, this);

    this.onDeleteDocumentListener = workspace.onDidDeleteFiles(this.onDeleteDocument, this);
    this.onOpenDocumentListener = workspace.onDidOpenTextDocument(this.onOpenDocument, this);
    this.onChangeDocumentListener = workspace.onDidChangeTextDocument(this.onChangeDocument, this);
    this.onSaveDocumentListener = workspace.onDidSaveTextDocument(this.onSaveDocument, this);
    this.onCloseDocumentListener = workspace.onDidCloseTextDocument(this.onCloseDocument, this);
  }

  private addCodioFileToInitialFrame(document: ShadowDocument, column: number, uri: Uri, lastAction: number): void {
    this.initialFrame.push({
      document,
      column,
      uri,
      lastAction,
    });
  }

  /**
   * Clean up after recording.
   */
  async stopRecording(): Promise<void> {
    await this.syncOpenedTextDocuments();

    this.onDidChangeActiveTextEditorListener.dispose();
    this.onDidChangeTextEditorSelectionListener.dispose();
    this.onDidChangeTextEditorVisibleRangesListener.dispose();

    this.onWillCreateFilesListener.dispose();
    this.onWillRenameFilesListener.dispose();
    this.onWillDeleteFilesListener.dispose();
    this.onWillSaveDocumentListener.dispose();

    this.onDeleteDocumentListener.dispose();
    this.onOpenDocumentListener.dispose();
    this.onChangeDocumentListener.dispose();
    this.onSaveDocumentListener.dispose();
    this.onCloseDocumentListener.dispose();
  }

  /**
   * Check opened text documents' state.
   */
   private async syncOpenedTextDocuments(): Promise<void> {
    for(let td of workspace.textDocuments) {
      if (td.isDirty) {
        await td.save();

        const evt = <TextDocumentWillSaveEvent>{ document: td, reason: TextDocumentSaveReason.Manual };
        this.onWillSaveDocument(evt);
        this.removePathFromProcessing(td.uri.path);
      } else if (td.isUntitled) {
        const newUri = Uri.joinPath(workspace.workspaceFolders[0].uri, basename(td.uri.path));
        await workspace.fs.writeFile(newUri, new TextEncoder().encode(td.getText()));

        const createEvt = <FileWillCreateEvent>{
          files: [newUri] as ReadonlyArray<Uri>
        };
        this.onWillCreateFiles(createEvt);
        this.removePathFromProcessing(newUri.path);

        const newTD = await workspace.openTextDocument(newUri)
        const saveEvt = <TextDocumentWillSaveEvent>{ document: newTD, reason: TextDocumentSaveReason.Manual };
        this.onWillSaveDocument(saveEvt);
        this.removePathFromProcessing(newUri.path);
      }
    }
  }

  /**
   * Remove given file path from processing.
   * @param filePath File path to remove.
   * @returns True is found and removed; false otherwise.
   */
  private removePathFromProcessing(filePath: string): Boolean {
    const processedIndex = this.processPaths.indexOf(filePath);
    if (processedIndex !== -1) {
      this.processPaths.splice(processedIndex, 1);
      return true;
    }

    return false;
  }

  /**
   * Check if given file path is processing.
   * @param filePath File path to check if processing.
   * @returns True if in processing array; false otherwise.
   */
  private pathIsProcessing(filePath: string): Boolean {
    const isProcessing = this.processPaths.indexOf(filePath) !== -1 ? true : false;
    console.log('Processing', this.processPaths);
    return isProcessing;
  }

  getTimelineContent(recordingStartTime: number, workspaceRoot?: Uri): TimelineContent {
    const { files, rootPath } = FSManager.normalizeFilesPath([], workspaceRoot);
    console.log('getTimelineContent files', files);
    console.log('getTimelineContent rootPath', rootPath);
    const events = serializeEvents(this.events, rootPath);
    const initialFrame = serializeFrame(this.initialFrame, rootPath);
    const eventsTimeline = createRelativeTimeline(events, recordingStartTime);
    return { events: eventsTimeline, initialFrame, openDocuments: files };
  }

  /**
   * Handle when text editor is shown.
   * @param te New active text editor with state.
   */
  private onDidChangeActiveTextEditor(te: TextEditor): void {
    console.log('onDidChangeActiveTextEditor te', te);

    // Null when a file replaced another one in the same editor or closed file.
    if (!te) {
      return;
    }

    const document: TextDocument = te.document;
    const docUri = document.uri;
    const uriPath = docUri.path;
    const docContent = document.getText();

    // From an onOpenDocument.
    if (this.removePathFromProcessing(uriPath)) {
      console.log('Processed', uriPath, this.processPaths);

      // Save active text editor if it wasn't available when record started.
      if (this.events.length === 1) {
        this.addCodioFileToInitialFrame(new ShadowDocument(docContent), 1, docUri, 0);
      }

      return;
    }

    // Switch to document
    const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_OPEN, docUri, docContent);
    if (event) {
      this.events.push(event);
    }
  }

  /**
   * Handle when user is scrolling through a text editor.
   * @param e Scroll Event to handle.
   */
  private onDidChangeTextEditorVisibleRanges(e: TextEditorVisibleRangesChangeEvent): void {
    console.log('onDidChangeTextEditorVisibleRanges e', e);
    const event = eventCreators.createCodioVisibleRangeEvent(e);
    if (event) {
      this.events.push(event);
    }
  }

  /**
   * Handle cursor move or selection by user.
   * @param e Selection event to handle.
   */
  private onDidChangeTextEditorSelection(e: TextEditorSelectionChangeEvent): void {
    console.log('onDidChangeTextEditorSelection e', e);
    const event = eventCreators.createCodioSelectionEvent(e);
    if (event) {
      this.events.push(event);
    }
  }

  /**
   * Handle file creation from workspace.
   * @param e File creation event to handle.
   */
  private onWillCreateFiles(e: FileWillCreateEvent): void {
    console.log('onWillCreateFiles', e);

    e.files.forEach((uri) => {
      this.processPaths.push(uri.path);
      console.log('To be processed', this.processPaths);

      // Creating file so no content needed.
      const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_CREATE, uri);
      if (event) {
        this.events.push(event);
      }
    });
  }

  /**
   * Handle when user renames a file.
   * @param e File rename event to handle.
   */
  private onWillRenameFiles(e: FileWillRenameEvent): void {
    console.log('onWillRenameFiles', e);

    e.files.forEach((rename) => {
      this.processPaths.push(rename.oldUri.path);
      this.processPaths.push(rename.newUri.path);
      console.log('To be processed', this.processPaths);

      // IIFE
      (async () => {
        const uInt8Arr = await workspace.fs.readFile(rename.oldUri);
        const content = new TextDecoder().decode(uInt8Arr);
        const event = eventCreators.createDocumentRenameEvent(rename.oldUri, rename.newUri, content);
        if (event) {
          this.events.push(event);
        }
      })();
    });
  }

  /**
   * Handle the opening of a text document.
   * @param td Text document that is being opened.
   * @returns
   */
   private onOpenDocument(td: TextDocument): void {
    console.log('onOpenDocument td', td);

    // From a WillCreate or WillRename
    if (this.pathIsProcessing(td.uri.path)) {
      return;
    }

    // Already existing path
    this.processPaths.push(td.uri.path);
    console.log('To be processed', this.processPaths);

    // The document that is opened could be in a different state than expected.
    const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_OPEN, td.uri, td.getText());
    if (event) {
      this.events.push(event);
    }
  }

  /**
   * Handle file delete from user.
   * @param e File delete event to handle.
   */
  private onWillDeleteFiles(e: FileWillDeleteEvent): void {
    console.log('onWillDeleteFiles', e);

    e.files.forEach((uri) => {
      this.processPaths.push(uri.path);
      console.log('To be processed', this.processPaths);

      const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_DELETE, uri);
      if (event) {
        this.events.push(event);
      }
    });
  }

  /**
   * Handle when files are deleted.
   * @param e File deleted event to handle.
   */
  private onDeleteDocument(e: FileDeleteEvent): void {
    console.log('onDeleteDocument e', e);
    e.files.forEach((uri) => {
      this.removePathFromProcessing(uri.path);
      console.log('Processed', uri.path, this.processPaths);
    });
  }

  /**
   * Handle file that was closed by user.
   * @param td Text Document that closed.
   * @returns void
   */
   private onCloseDocument(td: TextDocument): void {
    console.log('onCloseDocument td', td);

    // From a WillDelete or WillRename
    if(this.removePathFromProcessing(td.uri.path)) {
      console.log('Processed', td.uri.path, this.processPaths);
      return;
    }

    // Close already existing file
    const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_CLOSE, td.uri);
    if (event) {
      this.events.push(event);
    }
  }

  /**
   * Handle a change event in a text document.
   * @param e Event noting a text or cursor change.
   * @returns Void
   */
  private onChangeDocument(e: TextDocumentChangeEvent): void {
    console.log('onChangeDocument e', e);

    if (this.pathIsProcessing(e.document.uri.path)) {
      return;
    }

    if (!e.contentChanges.length) {
      return;
    }

    const event = eventCreators.createDocumentChangeEvent(e);
    if (event) {
      this.events.push(event);
    }
  }

  /**
   * Handle file save event from user.
   * @param e Text Document save event.
   */
  private onWillSaveDocument(e: TextDocumentWillSaveEvent): void {
    console.log('onWillSaveDocument e', e);

    this.processPaths.push(e.document.uri.path);
    console.log('To be processed', this.processPaths);

    const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_SAVE, e.document.uri, e.document.getText());
    if (event) {
      this.events.push(event);
    }
  }

  /**
   * Handle file that was saved.
   * @param td Text Document that was saved.
   */
  private onSaveDocument(td: TextDocument): void {
    console.log('onSaveDocument td', td);
    this.removePathFromProcessing(td.uri.path);
    console.log('Processed', td.uri.path, this.processPaths);
  }
}
