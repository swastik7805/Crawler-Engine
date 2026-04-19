import { extractContent } from "../extractor.js";

describe("extractContent", () => {
  const baseUrl = "https://example.com/docs/page1";

  it('should extract metadata correctly', () => {
    const html = `
      <html>
        <head>
          <title>Test Page Title</title>
          <meta name="description" content="A test description">
          <meta name="keywords" content="web3, blockchain, ethereum">
          <link rel="canonical" href="https://example.com/docs/canonical">
        </head>
        <body>
          <main>
            <h1>Main Heading</h1>
            <p>Some content here.</p>
          </main>
        </body>
      </html>
    `;

    const result = extractContent(html, baseUrl);

    expect(result.title).toBe('Test Page Title');
    expect(result.metaDescription).toBe('A test description');
    expect(result.metaKeywords).toEqual(['web3', 'blockchain', 'ethereum']);
    expect(result.canonicalUrl).toBe('https://example.com/docs/canonical');
  });

  it('should prioritize OpenGraph title over standard title', () => {
    const html = `
      <html>
        <head>
          <title>Standard Title</title>
          <meta property="og:title" content="Social Title">
        </head>
        <body></body>
      </html>
    `;

    const result = extractContent(html, baseUrl);
    expect(result.title).toBe('Social Title'); 
  });

  it('should strip noise elements', () => {
    const html = `
      <html>
        <body>
          <nav>Sidebar links</nav>
          <main>
            <p>This is real content.</p>
            <script>console.log('noise');</script>
            <style>.noise { color: red; }</style>
          </main>
          <footer>Footer info</footer>
        </body>
      </html>
    `;

    const result = extractContent(html, baseUrl);

    expect(result.bodyText).toContain('This is real content.');
    expect(result.bodyText).not.toContain('Sidebar links');
    expect(result.bodyText).not.toContain('Footer info');
    expect(result.bodyText).not.toContain('console.log');
  });

  it('should prioritize content containers like .markdown-body', () => {
    const html = `
      <html>
        <body>
          <div class="sidebar">Should be ignored</div>
          <div class="markdown-body">
            <h1>Docs</h1>
            <p>Target content.</p>
          </div>
          <div class="content">Fallback content</div>
        </body>
      </html>
    `;

    const result = extractContent(html, baseUrl);
    expect(result.bodyText).toContain('Target content.');
    expect(result.bodyText).not.toContain('Fallback content');
  });

  it('should discover and resolve internal links', () => {
    const html = `
      <html>
        <body>
          <a href="/relative/path">Relative</a>
          <a href="https://example.com/absolute">Absolute Internal</a>
          <a href="https://google.com/external">External</a>
          <a href="#fragment">Fragment</a>
        </body>
      </html>
    `;

    const result = extractContent(html, baseUrl);

    expect(result.internalLinks).toContain('https://example.com/relative/path');
    expect(result.internalLinks).toContain('https://example.com/absolute');
    expect(result.internalLinks).not.toContain('https://google.com/external');
  });
});
