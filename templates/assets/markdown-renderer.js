(function (root) {
  'use strict';

  function escapeHtml(value) {
    const element = document.createElement('div');
    element.textContent = String(value ?? '');
    return element.innerHTML;
  }

  function renderInline(value) {
    return escapeHtml(value)
      .replace(/`([^`\n]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  function renderMarkdown(value) {
    const output = [];
    let paragraph = [];
    let listType = '';

    const flushParagraph = () => {
      if (paragraph.length) output.push(`<p>${paragraph.map(renderInline).join('<br>')}</p>`);
      paragraph = [];
    };
    const closeList = () => {
      if (listType) output.push(`</${listType}>`);
      listType = '';
    };

    for (const line of String(value ?? '').replace(/\r\n?/g, '\n').split('\n')) {
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      const bullet = line.match(/^[-*+]\s+(.+)$/);
      const numbered = line.match(/^\d+[.)]\s+(.+)$/);
      const quote = line.match(/^>\s?(.+)$/);
      if (heading) {
        flushParagraph(); closeList();
        output.push(`<h${heading[1].length + 2}>${renderInline(heading[2])}</h${heading[1].length + 2}>`);
      } else if (bullet || numbered) {
        flushParagraph();
        const nextType = bullet ? 'ul' : 'ol';
        if (listType && listType !== nextType) closeList();
        if (!listType) { output.push(`<${nextType}>`); listType = nextType; }
        output.push(`<li>${renderInline((bullet || numbered)[1])}</li>`);
      } else if (quote) {
        flushParagraph(); closeList();
        output.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      } else if (!line.trim()) {
        flushParagraph(); closeList();
      } else {
        closeList();
        paragraph.push(line);
      }
    }
    flushParagraph(); closeList();
    return output.join('');
  }

  root.LxMarkdown = Object.freeze({ render: renderMarkdown });
})(window);
