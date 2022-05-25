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
  TextEditorViewColumnChangeEvent,
} from 'vscode';
import { TextDecoder } from 'util';
import serializeEvents from '../editor/serialize';
import * as eventCreators from '../editor/event_creator';
import { createRelativeTimeline } from '../editor/event_timeline';
import ShadowDocument from '../editor/frame/ShadowDocument';
import serializeFrame from '../editor/frame/serialize_frame';
import { DocumentEvents } from '../editor/consts';
import { schemeSupported } from '../utils';

interface Fold {
  index: number;
  line: number;
  viewColumn?: number;
}

interface Group {
  index: number;
  path: string;
  state: GroupState;
  viewColumn?: number;
}

enum GroupState {
  INIT = 1,
  CREATE,
  LIVE,
  DESTROY,
}

export default class CodeEditorRecorder {
  onDidChangeActiveTextEditorListener: Disposable;
  onDidChangeTextEditorSelectionListener: Disposable;
  onDidChangeTextEditorVisibleRangesListener: Disposable;
  onDidChangeVisibleTextEditorListener: Disposable;
  onDidChangeTextEditorViewColumnListener: Disposable;

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
  events: DocumentEvent[] = [];
  processPaths: Array<string> = [];
  onLanguageIdChange: Record<string, string> = {};
  folds: Fold[] = [];
  groups: Group[] = [];

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
        if (!schemeSupported(td.uri.scheme)) {
          return;
        }

        // These events don't have a viewColumn because they aren't viewable yet.
        const event = eventCreators.createDocumentEvent(
          DocumentEvents.DOCUMENT_OPEN,
          td.uri,
          td.getText(),
          td.isUntitled,
          td.languageId,
        );
        this.events.push(event);
      });

      // Create active document to have focus.
      const event = eventCreators.createDocumentEvent(
        DocumentEvents.DOCUMENT_OPEN,
        editor.document.uri,
        editor.document.getText(),
        editor.document.isUntitled,
        editor.document.languageId,
        editor.viewColumn,
      );
      this.events.push(event);
    }

    // Text Editor Events
    this.onDidChangeActiveTextEditorListener = window.onDidChangeActiveTextEditor(
      this.onDidChangeActiveTextEditor,
      this,
    );
    this.onDidChangeTextEditorSelectionListener = window.onDidChangeTextEditorSelection(
      this.onDidChangeTextEditorSelection,
      this,
    );
    this.onDidChangeTextEditorVisibleRangesListener = window.onDidChangeTextEditorVisibleRanges(
      this.onDidChangeTextEditorVisibleRanges,
      this,
    );
    this.onDidChangeVisibleTextEditorListener = window.onDidChangeVisibleTextEditors(
      this.onDidChangeVisibleTextEditor,
      this,
    );
    this.onDidChangeTextEditorViewColumnListener = window.onDidChangeTextEditorViewColumn(
      this.onDidChangeTextEditorViewColumn,
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
    this.onDidChangeActiveTextEditorListener.dispose();
    this.onDidChangeTextEditorSelectionListener.dispose();
    this.onDidChangeTextEditorVisibleRangesListener.dispose();
    this.onDidChangeVisibleTextEditorListener.dispose();
    this.onDidChangeTextEditorViewColumnListener.dispose();

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
   * Remove given file path from processing.
   * @param filePath File path to remove.
   * @returns True is found and removed; false otherwise.
   */
  private removePathFromProcessing(filePath: string): boolean {
    const processedIndex = this.processPaths.indexOf(filePath);
    if (processedIndex !== -1) {
      this.processPaths.splice(processedIndex, 1);
      console.log('Processed', filePath, this.processPaths);
      return true;
    }

    return false;
  }

  /**
   * Check if given file path is processing.
   * @param filePath File path to check if processing.
   * @returns True if in processing array; false otherwise.
   */
  private pathIsProcessing(filePath: string): boolean {
    const isProcessing = this.processPaths.indexOf(filePath) !== -1 ? true : false;
    console.log('Processing', this.processPaths);
    return isProcessing;
  }

  getTimelineContent(recordingStartTime: number, workspaceRoot: Uri): TimelineContent {
    const rootPath = workspaceRoot.path;
    console.log('getTimelineContent workspaceRoot', workspaceRoot);
    console.log('getTimelineContent rootPath', rootPath);
    const eventsTimeline = createRelativeTimeline(this.events, recordingStartTime);
    const events = serializeEvents(eventsTimeline, rootPath);
    const initialFrame = serializeFrame(this.initialFrame, rootPath);
    return { events, initialFrame };
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
    const uri = document.uri;
    const content = document.getText();

    // From an onOpenDocument.
    if (this.removePathFromProcessing(uri.path)) {
      // Save active text editor if it wasn't available when record started.
      if (this.events.length === 1) {
        this.addCodioFileToInitialFrame(new ShadowDocument(content), 1, uri, 0);
      }

      return;
    }

    // Switch to document
    const event = eventCreators.createDocumentEvent(
      DocumentEvents.DOCUMENT_OPEN,
      uri,
      content,
      document.isUntitled,
      document.languageId,
      te.viewColumn,
    );
    this.events.push(event);
  }

  /**
   * Handle when user is scrolling through a text editor or folding ranges.
   * @param e Visible range event to handle.
   */
  private onDidChangeTextEditorVisibleRanges(e: TextEditorVisibleRangesChangeEvent): void {
    console.log('onDidChangeTextEditorVisibleRanges e', e);

    // Scrolled to the end of file with no content.
    if (!e.visibleRanges.length) {
      return;
    }

    let event: DocumentFoldEvent | DocumentVisibleRangeEvent;

    // Check for any unfold events in this view column.
    const viewColumnFolds = this.folds.filter((fold) => fold.viewColumn === e.textEditor.viewColumn);
    for (let i = 0; i < viewColumnFolds.length; i++) {
      const startLine = viewColumnFolds[i].line;
      for (let j = 0; j < e.visibleRanges.length; j++) {
        // Is current folded start line between visible ranges?
        const range = e.visibleRanges[j];
        if (startLine < range.end.line) {
          if (startLine >= range.start.line) {
            this.folds.splice(viewColumnFolds[i].index, 1);
            event = eventCreators.createDocumentFoldEvent(e, startLine, 'down');
            this.events.push(event);
          }
        }
      }
    }
    if (event) {
      // No need to process further.
      return;
    }

    // Create fold start lines before last visible range (aka EOF).
    event = null;
    for (let i = 0; i < e.visibleRanges.length - 1; i++) {
      const curLine = e.visibleRanges[i].end.line;
      const fold = this.folds.find((fold) => fold.line === curLine && fold.viewColumn === e.textEditor.viewColumn);
      if (!fold) {
        this.folds.push({ index: this.folds.length, line: curLine, viewColumn: e.textEditor.viewColumn });
        event = eventCreators.createDocumentFoldEvent(e, curLine, 'up');
        this.events.push(event);
      }
    }
    if (event) {
      // No need to process further.
      return;
    }

    // Create scroll event
    event = eventCreators.createDocumentVisibleRangeEvent(e);
    this.events.push(event);
  }

  /**
   * Handle cursor move or selection by user.
   * @param e Selection event to handle.
   */
  private onDidChangeTextEditorSelection(e: TextEditorSelectionChangeEvent): void {
    console.log('onDidChangeTextEditorSelection e', e);
    const event = eventCreators.createDocumentSelectionEvent(e);
    this.events.push(event);
  }

  /**
   * Handle the user splitting or drag and dropping of a text editor into a new view column.
   * @param tes An array of text editors that are visible.
   */
  private onDidChangeVisibleTextEditor(tes: readonly TextEditor[]): void {
    console.log('onDidChangeVisibleTextEditor tes', tes);
    if (!tes.length) {
      return;
    }

    const groups = this.groups;

    // Handle group event?
    const lastTE = tes[tes.length - 1];
    if (!lastTE.viewColumn) {
      // Collect viewColumns
      const viewColumns: (number | undefined)[] = [];
      for (let i = 0; i < tes.length - 1; i++) {
        const te = tes[i];
        if (!te.viewColumn) {
          continue;
        }
        viewColumns.push(te.viewColumn);
      }

      // A missing view column seen before indicates an ungroup.
      const missingViewColumnGroup = groups.find((g) => !viewColumns.includes(g.viewColumn));
      if (missingViewColumnGroup) {
        missingViewColumnGroup.state = GroupState.DESTROY;
      } else {
        // No missing viewColumns, do any have the last text editor path?
        // Only one group can exist in a file and only one visible file per view column, otherwise a merge happens.
        const tePath = groups.find((g) => g.path === lastTE.document.uri.path);
        if (!tePath) {
          groups.push({
            index: groups.length,
            path: lastTE.document.uri.path,
            state: GroupState.INIT,
          });
        }
      }
      // The other viewColumns will be processed in the future.
      return;
    }

    // No new group events, let's loop and handle each visible text editor.
    tes.forEach((te) => {
      const path = te.document.uri.path;
      // A new group will have no `viewColumn` and a group state of `GroupState.INIT`.
      const group = groups.find((g) => g.path === path && (!g.viewColumn || g.viewColumn === te?.viewColumn));

      // Check for a grouped text editor and change state.
      if (!te.viewColumn) {
        // This could be visited multiple times
        if (group?.state === GroupState.INIT) {
          group.state = GroupState.CREATE;
        }
        return;
      }

      // Create a group event?
      switch (group?.state) {
        case GroupState.DESTROY: {
          groups.splice(group.index, 1);
          const event = eventCreators.createDocumentUngroupEvent(te.document, te.viewColumn);
          this.events.push(event);
          return;
        }
        case GroupState.CREATE: {
          group.state = GroupState.LIVE;
          group.viewColumn = te.viewColumn;
          const event = eventCreators.createDocumentGroupEvent(te.document, te.viewColumn);
          this.events.push(event);
          return;
        }
      }

      // Regular visible event with possible prior group event to act like native VSCode.
      const event = eventCreators.createDocumentVisibleEvent(te.document, te.viewColumn);
      this.events.push(event);

      const foundGroup = groups.find((g) => {
        return g.state === GroupState.LIVE && g.path === te.document.uri.path && g.viewColumn !== te.viewColumn;
      });
      if (foundGroup) {
        const event = eventCreators.createDocumentGroupEvent(te.document, te.viewColumn);
        this.events.push(event);
      }
    });
  }

  /**
   * Handle the VSCode changing the column of a text editor.
   * @param e View column event to handle.
   */
  private onDidChangeTextEditorViewColumn(e: TextEditorViewColumnChangeEvent): void {
    console.log('onDidChangeTextEditorViewColumn e', e);
    const event = eventCreators.createDocumentViewColumnEvent(e.textEditor.document, e.viewColumn);
    this.events.push(event);
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
      this.events.push(event);
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
        this.events.push(event);
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

    if (!schemeSupported(td.uri.scheme)) {
      console.log('Not supporting', td.uri.scheme);
      return;
    }

    // From a WillCreate or WillRename
    if (this.pathIsProcessing(td.uri.path)) {
      return;
    }

    // Add to processing queue?
    if (!this.onLanguageIdChange[td.uri.path] || this.onLanguageIdChange[td.uri.path] === td.languageId) {
      this.processPaths.push(td.uri.path);
      console.log('To be processed', this.processPaths);
    }
    delete this.onLanguageIdChange[td.uri.path];

    // The document that is opened could be in a different state than expected.
    // No viewColumn because it is not viewable yet.
    const event = eventCreators.createDocumentEvent(
      DocumentEvents.DOCUMENT_OPEN,
      td.uri,
      td.getText(),
      td.isUntitled,
      td.languageId,
    );
    this.events.push(event);
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
      this.events.push(event);
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
    });
  }

  /**
   * Handle file that was closed by user.
   * @param td Text Document that closed.
   * @returns void
   */
  private onCloseDocument(td: TextDocument): void {
    console.log('onCloseDocument td', td);

    if (!schemeSupported(td.uri.scheme)) {
      console.log('Not supporting', td.uri.scheme);
      return;
    }

    // From a WillDelete or WillRename
    if (this.removePathFromProcessing(td.uri.path)) {
      return;
    }

    // Possible language Id change
    this.onLanguageIdChange[td.uri.path] = td.languageId;

    let event;
    if (td.isUntitled) {
      event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_DELETE, td.uri, td.getText(), td.isUntitled);
    } else {
      event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_CLOSE, td.uri, td.getText());
    }
    this.events.push(event);
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
    this.events.push(event);
  }

  /**
   * Handle file save event from user.
   * @param e Text Document save event.
   */
  private onWillSaveDocument(e: TextDocumentWillSaveEvent): void {
    console.log('onWillSaveDocument e', e);
    const td = e.document;

    if (!schemeSupported(td.uri.scheme)) {
      console.log('Not supporting', td.uri.scheme);
      return;
    }

    this.processPaths.push(td.uri.path);
    console.log('To be processed', this.processPaths);

    const event = eventCreators.createDocumentEvent(DocumentEvents.DOCUMENT_SAVE, td.uri, td.getText());
    this.events.push(event);
  }

  /**
   * Handle file that was saved.
   * @param td Text Document that was saved.
   */
  private onSaveDocument(td: TextDocument): void {
    console.log('onSaveDocument td', td);
    if (!schemeSupported(td.uri.scheme)) {
      console.log('Not supporting', td.uri.scheme);
      return;
    }
    this.removePathFromProcessing(td.uri.path);
  }
}
