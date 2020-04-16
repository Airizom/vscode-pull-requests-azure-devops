import * as path from 'path';
import * as os from 'os';

export class FilePathUtility {


    /**
     * Given a list of file paths return a list of unique starting directories.
     * This will just return the base unique directories.
     *
     * @param {string[]} paths
     * @returns {string[]}
     * @memberof FilePathUtility
     */
    public static getDirectoriesWithDistinctStartingPaths(paths: string[]): string[] {
        const diretories: Set<string> = new Set<string>();

        for (const path of paths) {
            const splitPaths: string[] = path.split('/');
            if (splitPaths.length > 1) {
                diretories.add(splitPaths[0]);
            }
        }

        return [...diretories];
    }

    /**
     * Get the common directory path given a list of folders
     *
     * @param {string[]} paths
     * @returns {string}
     * @memberof FilePathUtility
     */
    public static getCommonPath(paths: string[]): string {
        let commonPath: string = '';

        const folders: string[][] = [];

        for (let index: number = 0; index < paths.length; index++) {
            folders[index] = paths[index].split('/');
        }

        for (let index: number = 0; index < folders[0].length - 1; index++) {
            const thisFolder: string = folders[0][index];
            let allMatched: boolean = true;
            for (let i: number = 0; i < folders.length && allMatched; i++) {
                if (folders[i].length < index) {
                    allMatched = false;
                    break;
                }
                allMatched = folders[i][index] === thisFolder;
            }
            if (allMatched) {
                commonPath += `${thisFolder}/`;
            } else {
                break;
            }
        }
        return commonPath;
    }

    /**
     * Create a path to the left side file diff
     *
     * @static
     * @param {(string | undefined)} lastPathFragment
     * @returns {string}
     * @memberof FilePathUtility
     */
    public static getLeftDiffFilePath(lastPathFragment: string | undefined): string {
        return `${os.tmpdir()}${path.sep}version2${lastPathFragment}`;
    }

    /**
     * Create a path to the right hand file diff
     *
     * @static
     * @param {(string | undefined)} lastPathFragment
     * @returns {string}
     * @memberof FilePathUtility
     */
    public static getRightDiffFilePath(lastPathFragment: string | undefined): string {
        return `${os.tmpdir()}${path.sep}version1${lastPathFragment}`;
    }


}
