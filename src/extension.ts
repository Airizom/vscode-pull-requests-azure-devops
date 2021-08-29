import * as vscode from 'vscode';
import { DiffTextDocumentContentProvider } from './pull-request-tree-view/diff-text-document-content-provider';
import { PullRequestExplorer } from './pull-request-tree-view/pull-request-explorer';
import { ConfigManager } from './utilities/config-manager';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(DiffTextDocumentContentProvider.pullRequestDiffScheme,
            new DiffTextDocumentContentProvider()
        ));

    const configManager: ConfigManager = new ConfigManager();

    // tslint:disable-next-line: no-unused-expression
    new PullRequestExplorer(configManager);
}


// This method is called when your extension is deactivated
export function deactivate(): void {
    //
}
