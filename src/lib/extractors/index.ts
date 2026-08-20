// src/lib/extractors/index.ts
// Utilitário de extração de texto multi-formato para documentos (PDF, DOCX, XLSX, CSV, TXT, MD, etc.)

import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'

// Configura o worker do PDF.js para carregar via CDN ou localmente sem travar o bundler
if (typeof window !== 'undefined' && 'Worker' in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.10.38'}/pdf.worker.min.mjs`
}

export interface ExtractionResult {
  text: string
  charCount: number
  truncated: boolean
  fileType: string
}

const MAX_CHAR_LIMIT = 20000

/**
 * Extrai texto legível de um arquivo fornecido pelo usuário.
 */
export async function extractTextFromFile(file: File): Promise<ExtractionResult> {
  const fileName = file.name.toLowerCase()
  let rawText = ''
  let fileType = 'other'

  try {
    if (fileName.endsWith('.pdf')) {
      fileType = 'pdf'
      rawText = await extractFromPdf(file)
    } else if (fileName.endsWith('.docx')) {
      fileType = 'docx'
      rawText = await extractFromDocx(file)
    } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      fileType = 'xlsx'
      rawText = await extractFromExcel(file)
    } else if (
      fileName.endsWith('.txt') ||
      fileName.endsWith('.md') ||
      fileName.endsWith('.csv') ||
      fileName.endsWith('.json') ||
      fileName.endsWith('.log') ||
      fileName.endsWith('.xml') ||
      fileName.endsWith('.html')
    ) {
      fileType = fileName.endsWith('.csv') ? 'csv' : 'txt'
      rawText = await file.text()
    } else if (file.type.startsWith('image/')) {
      fileType = 'image'
      rawText = `[Arquivo de imagem: ${file.name} (${(file.size / 1024).toFixed(1)} KB)]`
    } else {
      fileType = 'other'
      rawText = `[Arquivo: ${file.name} (${file.type || 'tipo desconhecido'})]`
    }
  } catch (err) {
    console.warn(`Aviso ao extrair texto do arquivo ${file.name}:`, err)
    rawText = `[Não foi possível extrair todo o texto de ${file.name}: ${err instanceof Error ? err.message : 'formato não suportado'}]`
  }

  const cleanText = rawText.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim()
  const truncated = cleanText.length > MAX_CHAR_LIMIT
  const finalText = truncated
    ? `${cleanText.slice(0, MAX_CHAR_LIMIT)}\n\n[...Texto resumido: primeiros ${MAX_CHAR_LIMIT} caracteres indexados]`
    : cleanText

  return {
    text: finalText,
    charCount: finalText.length,
    truncated,
    fileType,
  }
}

/**
 * Extrai texto de PDF usando PDF.js
 */
async function extractFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdf = await loadingTask.promise
  const pageTexts: string[] = []

  // Lê até 30 páginas ou até atingir limite
  const maxPages = Math.min(pdf.numPages, 30)
  for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const textContent = await page.getTextContent()
    const pageString = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str || '')
      .join(' ')
    if (pageString.trim()) {
      pageTexts.push(`--- Página ${pageNum} ---\n${pageString}`)
    }
    // Se já passou do tamanho limite, interrompe
    if (pageTexts.join('\n').length > MAX_CHAR_LIMIT) break
  }

  return pageTexts.join('\n\n')
}

/**
 * Extrai texto de documento Word DOCX usando mammoth
 */
async function extractFromDocx(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value || ''
}

/**
 * Extrai texto e dados tabulares de planilha Excel XLSX/XLS usando SheetJS
 */
async function extractFromExcel(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array' })
  const sheetTexts: string[] = []

  for (const sheetName of workbook.SheetNames.slice(0, 5)) {
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) continue
    const csv = XLSX.utils.sheet_to_csv(worksheet)
    if (csv.trim()) {
      sheetTexts.push(`[Planilha: ${sheetName}]\n${csv.slice(0, 5000)}`)
    }
  }

  return sheetTexts.join('\n\n')
}

/**
 * Retorna ícone FontAwesome correspondente ao tipo de arquivo
 */
export function getFileIconClass(fileType: string): string {
  switch (fileType?.toLowerCase()) {
    case 'pdf':
      return 'fa-solid fa-file-pdf text-red-500'
    case 'docx':
    case 'doc':
      return 'fa-solid fa-file-word text-blue-500'
    case 'xlsx':
    case 'xls':
    case 'csv':
      return 'fa-solid fa-file-excel text-emerald-500'
    case 'image':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return 'fa-solid fa-file-image text-purple-500'
    case 'txt':
    case 'md':
    case 'json':
      return 'fa-solid fa-file-lines text-amber-500'
    default:
      return 'fa-solid fa-file text-muted-foreground'
  }
}

/**
 * Formata bytes em KB ou MB legível
 */
export function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}
