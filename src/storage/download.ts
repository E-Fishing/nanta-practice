/** Trigger a browser download of `text` as a file named `name` (v1 has no backend: SPEC §4.4, §4.5). */
export function downloadText(name: string, text: string, type: string = 'application/json'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
