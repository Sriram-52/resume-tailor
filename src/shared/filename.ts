/** Build a safe PDF file name from the candidate, company, and role. */

const MAX_PART = 60

function part(s: string | undefined, fallback: string): string {
  const cleaned = (s ?? '')
    .replace(/[\\/:*?"<>|,()[\]{}]/g, ' ') // characters that break file names or look odd in them
    .replace(/[^\p{L}\p{N}\s._+#-]/gu, '') // drop remaining symbols, keep letters/digits and a few safe marks
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
  const value = cleaned || fallback
  return value.length > MAX_PART ? value.slice(0, MAX_PART).replace(/_+$/, '') : value
}

/**
 * e.g. Sri_Ram_Mohan_Nyshadham_Commure_Senior_Fullstack_Engineer_Ambient_AI.pdf
 * Role is included so several applications at one company stay distinguishable.
 */
export function pdfFileName(
  personName: string | undefined,
  company: string | undefined,
  role: string | undefined,
  suffix: '' | 'cover' | 'master' = ''
): string {
  const pieces = [part(personName, 'resume'), part(company, '')]
  if (suffix !== 'master') pieces.push(part(role, ''))
  if (suffix) pieces.push(suffix)
  return pieces.filter(Boolean).join('_') + '.pdf'
}
