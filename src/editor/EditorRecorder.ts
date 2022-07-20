import {
  workspace,
  window,
  TextEditor,
  TextDocumentChangeEvent,
  TextEditorSelectionChangeEvent,
  Disposable,
  TextEditorVisibleRangesChangeEvent,
  TextDocument,
  FileWillDeleteEvent,
  FileWillRenameEvent,
  FileWillCreateEvent,
  TextDocumentWillSaveEvent,
  FileDeleteEvent,
  TextEditorViewColumnChangeEvent,
  commands,
  Range,
} from 'vscode';
import { TextDecoder } from 'util';
import serializeEvents from './serialize';
import * as eventCreator from './event_creator';
import { createEventsWithRelativeTime } from './event_time';
import { DocumentEvents } from './consts';
import { schemeSupported } from '../utils';

interface Fold {
  line: number;
  path: string;
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

export default class EditorRecorder implements IMedia, IExport {
  private onDidChangeActiveTextEditorListener: Disposable;
  private onDidChangeTextEditorSelectionListener: Disposable;
  private onDidChangeTextEditorVisibleRangesListener: Disposable;
  private onDidChangeVisibleTextEditorListener: Disposable;
  private onDidChangeTextEditorViewColumnListener: Disposable;

  private onWillCreateFilesListener: Disposable;
  private onWillRenameFilesListener: Disposable;
  private onWillDeleteFilesListener: Disposable;
  private onWillSaveDocumentListener: Disposable;
  private onDeleteDocumentListener: Disposable;
  private onOpenDocumentListener: Disposable;
  private onChangeDocumentListener: Disposable;
  private onSaveDocumentListener: Disposable;
  private onCloseDocumentListener: Disposable;

  private events: DocumentEvent[] = [];
  private processPaths: Array<string> = [];
  private onLanguageIdChange: Record<string, string> = {};
  private foldUps: Fold[] = [];
  private foldDowns: Fold[] = [];
  private groups: Group[] = [];

  private startTimeMs: number;
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Save active text editor and listen to change events.
   */
  async start(timeMs: number): Promise<void> {
    this.startTimeMs = timeMs;

    const editor = window.activeTextEditor;
    if (editor) {
      // Filter out active document.
      const unfocusedTds = this.getTdsExcept(editor.document.uri.path);
      for (let i = 0; i < unfocusedTds.length; i++) {
        const td = unfocusedTds[i];
        if (!schemeSupported(td.uri.scheme)) {
          continue;
        }

        await window.showTextDocument(td.uri, { preserveFocus: true, preview: false });
        await commands.executeCommand('editor.unfoldAll');
        await commands.executeCommand('workbench.action.joinEditorInGroup');

        // These events don't have a viewColumn because they aren't viewable yet.
        const event = eventCreator.createDocumentEvent(
          DocumentEvents.DOCUMENT_OPEN,
          td.uri,
          td.getText(),
          td.isUntitled,
          td.languageId,
        );
        this.events.push(event);
      }

      await window.showTextDocument(editor.document.uri, { preview: false });
      await commands.executeCommand('editor.unfoldAll', editor);
      await commands.executeCommand('workbench.action.joinEditorInGroup');

      // Create active document to have focus.
      const event = eventCreator.createDocumentEvent(
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

  /**
   * Get an array of text documents excluding the given path.
   * @param path Path to exclude from returned array.
   * @returns An array of text documents that exclude given path.
   */
  private getTdsExcept(path: string): TextDocument[] {
    return workspace.textDocuments.filter((td) => td.uri.path !== path);
  }

  /**
   * Clean up after recording.
   */
  stop(): void {
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

    const td: TextDocument = te.document;
    const path = td.uri.path;

    // From an onOpenDocument.
    if (this.removePathFromProcessing(td.uri.path)) {
      return;
    }

    // This just became active with folded ranges so ignore multiple visible range events.
    if (this.foldUps.find((fold) => fold.path === path) && this.shouldAddToProcessingQueue(td)) {
      this.processPaths.push(path);
      this.processPaths.push(path);
      this.processPaths.push(path);
      console.log('To be processed', this.processPaths);
    }

    // Switch to already opened document
    const event = eventCreator.createDocumentEvent(
      DocumentEvents.DOCUMENT_ACTIVE,
      td.uri,
      td.getText(),
      td.isUntitled,
      td.languageId,
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

    // From an onDidChangeActiveTextEditor.
    const path = e.textEditor.document.uri.path;
    if (this.foldUps.length && this.removePathFromProcessing(path)) {
      return;
    }

    if (this.handleFoldDowns(e)) {
      return;
    }

    if (this.handleFoldUps(e)) {
      return;
    }

    // Create scroll event
    const event = eventCreator.createDocumentVisibleRangeEvent(e);
    this.events.push(event);
  }

  /**
   * Handle the creation of any fold down events.
   * @param e Visible range event to handle.
   * @returns True if events were created.
   */
  private handleFoldDowns(e: TextEditorVisibleRangesChangeEvent): boolean {
    const path = e.textEditor.document.uri.path;
    const viewColumn = e.textEditor.viewColumn;
    const ranges = e.visibleRanges;
    let event: DocumentFoldDownEvent;

    // Check for any unfold events in this view column and path.
    const viewColumnFoldUps = this.foldUps.filter((fold) => fold.viewColumn === viewColumn && fold.path === path);
    for (const foldUp of viewColumnFoldUps) {
      const line = foldUp.line;
      for (let j = 0; j < ranges.length; j++) {
        if (!this.lineBetweenRange(line, ranges[j])) {
          continue;
        }

        this.removeFold(foldUp, this.foldUps);

        const fold = this.getFold(line, path, viewColumn, this.foldDowns);
        if (fold) {
          continue;
        }

        this.foldDowns.push({ line: line, path, viewColumn });
        event = eventCreator.createDocumentFoldDownEvent(e, line);
        this.events.push(event);
      }
    }

    return event ? true : false;
  }

  /**
   * Test if given line is between given range.
   * @param line Line number to test against.
   * @param range Range to test against.
   * @returns True if given line is between given range; false otherwise.
   */
  private lineBetweenRange(line: number, range: Range): boolean {
    return line < range.end.line && line >= range.start.line;
  }

  /**
   * Delete given fold from given fold array.
   * @param toDelete Fold object to delete.
   * @param folds Fold object array to delete from.
   * @returns Deleted fold.
   */
  private removeFold(toDelete: Fold, folds: Fold[]): Fold {
    const index = this.getFoldIndex(toDelete.line, toDelete.path, toDelete.viewColumn, folds);
    return folds.splice(index, 1)[0];
  }

  /**
   * Find index of fold object with given arguments.
   * @param line Line to test for.
   * @param path Path to test for.
   * @param viewColumn View column to test for.
   * @param folds Fold object array to parse.
   * @returns The index of found object; -1 otherwise.
   */
  private getFoldIndex(line: number, path: string, viewColumn: number, folds: Fold[]): number {
    return folds.findIndex((fold) => fold.line === line && fold.path === path && fold.viewColumn === viewColumn);
  }

  /**
   * Find fold object with given arguments.
   * @param line Line to test for.
   * @param path Path to test for.
   * @param viewColumn View column to test for.
   * @param folds Fold object array to parse.
   * @returns Fold object found; undefined otherwise.
   */
  private getFold(line: number, path: string, viewColumn: number, folds: Fold[]): Fold | undefined {
    return folds.find((fold) => fold.line === line && fold.path === path && fold.viewColumn === viewColumn);
  }

  /**
   * Handle the creation of any fold up events.
   * @param e Visible range event to handle.
   * @returns True if events were created.
   */
  private handleFoldUps(e: TextEditorVisibleRangesChangeEvent): boolean {
    const path = e.textEditor.document.uri.path;
    const viewColumn = e.textEditor.viewColumn;
    const ranges = e.visibleRanges;

    // Create fold start lines before last visible range (aka EOF).
    let event: DocumentFoldUpEvent;
    for (let i = 0; i < ranges.length - 1; i++) {
      const line = ranges[i].end.line;
      let fold = this.getFold(line, path, viewColumn, this.foldDowns);
      if (fold) {
        this.removeFold(fold, this.foldDowns);
      }

      fold = this.getFold(line, path, viewColumn, this.foldUps);
      if (fold) {
        continue;
      }

      this.foldUps.push({ line: line, path, viewColumn });
      event = eventCreator.createDocumentFoldUpEvent(e, line);
      this.events.push(event);
    }

    return event ? true : false;
  }

  /**
   * Handle cursor move or selection by user.
   * @param e Selection event to handle.
   */
  private onDidChangeTextEditorSelection(e: TextEditorSelectionChangeEvent): void {
    console.log('onDidChangeTextEditorSelection e', e);
    const event = eventCreator.createDocumentSelectionEvent(e);
    this.events.push(event);
  }

  /**
   * Handle the user grouping, splitting, or drag and dropping of a text editor into a new view column.
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
          const event = eventCreator.createDocumentUngroupEvent(te.document, te.viewColumn);
          this.events.push(event);
          return;
        }
        case GroupState.CREATE: {
          group.state = GroupState.LIVE;
          group.viewColumn = te.viewColumn;
          const event = eventCreator.createDocumentGroupEvent(te.document, te.viewColumn);
          this.events.push(event);
          return;
        }
      }

      // Regular visible event with possible prior group event to act like native VSCode.
      const event = eventCreator.createDocumentVisibleEvent(te.document, te.viewColumn);
      this.events.push(event);

      const foundGroup = groups.find((g) => {
        return g.state === GroupState.LIVE && g.path === te.document.uri.path && g.viewColumn !== te.viewColumn;
      });
      if (foundGroup) {
        const event = eventCreator.createDocumentGroupEvent(te.document, te.viewColumn);
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
    const event = eventCreator.createDocumentViewColumnEvent(e.textEditor.document, e.viewColumn);
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
      const event = eventCreator.createDocumentEvent(DocumentEvents.DOCUMENT_CREATE, uri);
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
        const event = eventCreator.createDocumentRenameEvent(rename.oldUri, rename.newUri, content);
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

    if (this.shouldAddToProcessingQueue(td)) {
      this.processPaths.push(td.uri.path);
      console.log('To be processed', this.processPaths);
    }
    delete this.onLanguageIdChange[td.uri.path];

    // The document that is opened could be in a different state than expected.
    // No viewColumn because it is not viewable yet.
    const event = eventCreator.createDocumentEvent(
      DocumentEvents.DOCUMENT_OPEN,
      td.uri,
      td.getText(),
      td.isUntitled,
      td.languageId,
    );
    this.events.push(event);
  }

  /**
   * Test if given text document should be added to the processing queue.
   * @param td Text document to test.
   * @returns True if text document should be added to the processing queue.
   */
  private shouldAddToProcessingQueue(td: TextDocument): boolean {
    return !this.onLanguageIdChange[td.uri.path] || this.onLanguageIdChange[td.uri.path] === td.languageId;
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

      const event = eventCreator.createDocumentEvent(DocumentEvents.DOCUMENT_DELETE, uri);
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
      event = eventCreator.createDocumentEvent(DocumentEvents.DOCUMENT_DELETE, td.uri, td.getText(), td.isUntitled);
    } else {
      event = eventCreator.createDocumentEvent(DocumentEvents.DOCUMENT_CLOSE, td.uri, td.getText());
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

    const event = eventCreator.createDocumentChangeEvent(e);
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

    const event = eventCreator.createDocumentEvent(DocumentEvents.DOCUMENT_SAVE, td.uri, td.getText());
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

  /**
   * Return a JSON string of events converted to relative time and path.
   * @returns JSON of editor and workspace events.
   */
  export(): string {
    const relativeTimeEvents = createEventsWithRelativeTime(this.events, this.startTimeMs);
    const serializedEvents = serializeEvents(relativeTimeEvents, this.workspacePath);
    console.log('export serializedEvents', serializedEvents);
    return JSON.stringify(serializedEvents);
  }
}
