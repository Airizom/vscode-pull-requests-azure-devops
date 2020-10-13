import * as vscode from 'vscode';
import * as fs from 'fs';

export class DiffTextDocumentContentProvider implements vscode.TextDocumentContentProvider {

    public static pullRequestDiffScheme: string = 'pullRequestDiffSchmeme';

    // emitter and its event
    onDidChangeEmitter: vscode.EventEmitter<vscode.Uri> = new vscode.EventEmitter<vscode.Uri>();
    onDidChange: vscode.Event<vscode.Uri> = this.onDidChangeEmitter.event;

    /**
     * Retrieve the file text document from disc for the file
     *
     * @param {vscode.Uri} uri
     * @param {vscode.CancellationToken} token
     * @returns {vscode.ProviderResult<string>}
     * @memberof DiffTextDocumentContentProvider
     */
    provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
        try {
            return fs.readFileSync(uri.path, { encoding: 'utf-8' });
        } catch (error) {
            vscode.window.showErrorMessage(`Error retrieving file contents for file: ${uri.path}`);
        }
    }

}
