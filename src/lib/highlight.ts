const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Minimal XML → HTML highlighter for the live preview (input is machine-generated, well-formed XML). */
export function highlightXml(xml: string): string {
  const src = esc(xml)
  const re = /(&lt;!--[\s\S]*?--&gt;)|(&lt;\?[\s\S]*?\?&gt;)|(&lt;\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)(\s*\/?&gt;)/g
  return src.replace(re, (_m, comment, decl, open, name, attrs, close) => {
    if (comment) return `<span class="xml-comment">${comment}</span>`
    if (decl) return `<span class="xml-decl">${decl}</span>`
    const a = (attrs as string).replace(/([\w:.-]+)(\s*=\s*)("[^"]*")/g, '<span class="xml-attr">$1</span><span class="xml-punct">$2</span><span class="xml-val">$3</span>')
    return `<span class="xml-punct">${open}</span><span class="xml-tag">${name}</span>${a}<span class="xml-punct">${close}</span>`
  })
}
