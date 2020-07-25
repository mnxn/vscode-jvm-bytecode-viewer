import * as vscode from "vscode";
import * as AdmZip from "adm-zip";
import * as path from "path";

export const output = vscode.window.createOutputChannel("JVM Bytecode Viewer");

export function classFile(bytecodeFile: string): string {
	return bytecodeFile.replace(/\.bytecode(\.verbose)?$/, ".class");
}

export function bytecodeFile(classFile: string, { verbose = false }: { verbose?: boolean } = {}): string {
	return verbose === true
		? classFile.replace(/\.class$/, ".bytecode.verbose")
		: classFile.replace(/\.class$/, ".bytecode");
}

export function jarPath(filePath: string): string {
	return "jar:file:" + filePath.replace(/\\/g, "/");
}

export function isInJar(filePath: string): boolean {
	return filePath.includes("jar!");
}

export function zipEntries(zip: AdmZip): string[] {
	return zip
		.getEntries()
		.map((e) => e.entryName)
		.sort((l, r) => l.localeCompare(r));
}

export function pathJoin(...paths: (string | vscode.Uri)[]): string {
	return path.posix.join(
		...paths.map((p: string | vscode.Uri) => {
			if (p instanceof vscode.Uri) return p.path;
			else return p;
		})
	);
}

export function uriJoin(...paths: (string | vscode.Uri)[]): vscode.Uri {
	return vscode.Uri.parse(pathJoin(...paths));
}
