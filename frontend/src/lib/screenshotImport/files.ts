// ドロップ・貼り付け・ファイル選択から画像ファイルだけを取り出す
export function imageFilesFrom(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return []
  const files: File[] = []
  for (let index = 0; index < list.length; index += 1) {
    const entry = list[index]
    const file = entry instanceof File ? entry : entry.kind === 'file' ? entry.getAsFile() : null
    if (file && file.type.startsWith('image/')) files.push(file)
  }
  return files
}
