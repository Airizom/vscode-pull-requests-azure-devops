import * as vscode from 'vscode';
import { PolicyEvaluationStatus } from 'azure-devops-node-api/interfaces/PolicyInterfaces';

export class IconUtility {

    /**
     * Determine the type of vscode icon to use based on the status of a policy
     *
     * @static
     * @param {PolicyEvaluationStatus} status
     * @returns {vscode.ThemeIcon}
     * @memberof IconUtility
     */
    public static getPolicyStatusIcon(status: PolicyEvaluationStatus | undefined): vscode.ThemeIcon {
        switch (status) {
            case PolicyEvaluationStatus.Approved:
                return new (vscode.ThemeIcon as any)('check');
            case PolicyEvaluationStatus.Broken:
                return new (vscode.ThemeIcon as any)('debug');
            case PolicyEvaluationStatus.NotApplicable:
                return new (vscode.ThemeIcon as any)('circle-slash');
            case PolicyEvaluationStatus.Queued:
                return new (vscode.ThemeIcon as any)('watch');
            case PolicyEvaluationStatus.Rejected:
                return new (vscode.ThemeIcon as any)('x');
            case PolicyEvaluationStatus.Running:
                return new (vscode.ThemeIcon as any)('play');
            default:
                return new (vscode.ThemeIcon as any)('question');
        }
    }
}
